/**
 * 最小化 TUI 实现，支持差异渲染
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import { isKeyRelease, matchesKey } from "./keys.ts";
import type { Terminal } from "./terminal.ts";
import { deleteKittyImage, getCapabilities, isImageLine, setCellDimensions } from "./terminal-image.ts";
import { extractSegments, normalizeTerminalOutput, sliceByColumn, sliceWithWidth, visibleWidth } from "./utils.ts";

const KITTY_SEQUENCE_PREFIX = "\x1b_G";

function extractKittyImageIds(line: string): number[] {
	const sequenceStart = line.indexOf(KITTY_SEQUENCE_PREFIX);
	if (sequenceStart === -1) return [];

	const paramsStart = sequenceStart + KITTY_SEQUENCE_PREFIX.length;
	const paramsEnd = line.indexOf(";", paramsStart);
	if (paramsEnd === -1) return [];

	const params = line.slice(paramsStart, paramsEnd);
	for (const param of params.split(",")) {
		const [key, value] = param.split("=", 2);
		if (key !== "i" || value === undefined) continue;
		const id = Number(value);
		if (Number.isInteger(id) && id > 0 && id <= 0xffffffff) {
			return [id];
		}
	}
	return [];
}

/**
 * 组件接口 - 所有组件都必须实现此接口
 */
export interface Component {
	/**
	 * 将组件渲染为指定视口宽度的行
	 * @param width - 当前视口宽度
	 * @returns 字符串数组，每个元素代表一行
	 */
	render(width: number): string[];

	/**
	 * 可选：当组件获得焦点时处理键盘输入
	 */
	handleInput?(data: string): void;

	/**
	 * 如果为 true，组件会接收键释放事件（Kitty 协议）。
	 * 默认为 false - 释放事件会被过滤掉。
	 */
	wantsKeyRelease?: boolean;

	/**
	 * 使任何缓存的渲染状态失效。
	 * 当主题更改或组件需要从头重新渲染时调用。
	 */
	invalidate(): void;
}

type InputListenerResult = { consume?: boolean; data?: string } | undefined;
type InputListener = (data: string) => InputListenerResult;

/**
 * 可接收焦点并显示硬件光标的组件接口。
 * 当获得焦点时，组件应在渲染输出中的光标位置发出 CURSOR_MARKER。
 * TUI 会找到此标记并将硬件光标定位到该处，以便正确显示 IME 候选窗口。
 */
export interface Focusable {
	/** TUI 在焦点改变时设置。当此值为 true 时，组件应发出 CURSOR_MARKER。 */
	focused: boolean;
}

/** 类型守卫，检查组件是否实现了 Focusable */
export function isFocusable(component: Component | null): component is Component & Focusable {
	return component !== null && "focused" in component;
}

/**
 * 光标位置标记 - APC（应用程序命令）序列。
 * 这是一个零宽度的转义序列，终端会忽略它。
 * 组件在获得焦点时会在光标位置发出此标记。
 * TUI 会找到并剥离此标记，然后将硬件光标定位到那里。
 */
export const CURSOR_MARKER = "\x1b_pi:c\x07";

export { visibleWidth };

/**
 * 覆盖层的锚点位置
 */
export type OverlayAnchor =
	| "center"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "top-center"
	| "bottom-center"
	| "left-center"
	| "right-center";

/**
 * 覆盖层的边距配置
 */
export interface OverlayMargin {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
}

/** 可以是绝对数值（数字）或百分比（字符串如 "50%"）的值 */
export type SizeValue = number | `${number}%`;

/** 根据参考尺寸将 SizeValue 解析为绝对值 */
function parseSizeValue(value: SizeValue | undefined, referenceSize: number): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "number") return value;
	// 解析百分比字符串，如 "50%"
	const match = value.match(/^(\d+(?:\.\d+)?)%$/);
	if (match) {
		return Math.floor((referenceSize * parseFloat(match[1])) / 100);
	}
	return undefined;
}

function isTermuxSession(): boolean {
	return Boolean(process.env.TERMUX_VERSION);
}

/**
 * 覆盖层定位和尺寸选项。
 * 数值可以是绝对数字或百分比字符串（例如 "50%"）。
 */
export interface OverlayOptions {
	// === 尺寸 ===
	/** 宽度（列数），或终端宽度的百分比（例如 "50%"） */
	width?: SizeValue;
	/** 最小宽度（列数） */
	minWidth?: number;
	/** 最大高度（行数），或终端高度的百分比（例如 "50%"） */
	maxHeight?: SizeValue;

	// === 定位 - 基于锚点 ===
	/** 定位的锚点（默认值：'center'） */
	anchor?: OverlayAnchor;
	/** 距锚点位置的水平偏移（正值 = 向右） */
	offsetX?: number;
	/** 距锚点位置的垂直偏移（正值 = 向下） */
	offsetY?: number;

	// === 定位 - 百分比或绝对 ===
	/** 行位置：绝对数字，或百分比（例如 "25%" = 距顶部 25%） */
	row?: SizeValue;
	/** 列位置：绝对数字，或百分比（例如 "50%" = 水平居中） */
	col?: SizeValue;

	// === 距终端边缘的边距 ===
	/** 距终端边缘的边距。数字将应用于所有边。 */
	margin?: OverlayMargin | number;

	// === 可见性 ===
	/**
	 * 根据终端尺寸控制覆盖层的可见性。
	 * 如果提供，仅当此函数返回 true 时才渲染覆盖层。
	 * 每个渲染周期都会使用当前终端尺寸调用它。
	 */
	visible?: (termWidth: number, termHeight: number) => boolean;
	/** 如果为 true，显示时不会捕获键盘焦点 */
	nonCapturing?: boolean;
}

/**
 * showOverlay 返回的句柄，用于控制覆盖层
 */
export interface OverlayHandle {
	/** 永久移除覆盖层（无法再次显示） */
	hide(): void;
	/** 临时隐藏或显示覆盖层 */
	setHidden(hidden: boolean): void;
	/** 检查覆盖层是否临时隐藏 */
	isHidden(): boolean;
	/** 聚焦此覆盖层并将其置于视觉最前面 */
	focus(): void;
	/** 将焦点释放回之前的对象 */
	unfocus(): void;
	/** 检查此覆盖层当前是否具有焦点 */
	isFocused(): boolean;
}

/**
 * 容器 - 包含其他组件的组件
 */
export class Container implements Component {
	children: Component[] = [];

	addChild(component: Component): void {
		this.children.push(component);
	}

	removeChild(component: Component): void {
		const index = this.children.indexOf(component);
		if (index !== -1) {
			this.children.splice(index, 1);
		}
	}

	clear(): void {
		this.children = [];
	}

	invalidate(): void {
		for (const child of this.children) {
			child.invalidate?.();
		}
	}

	render(width: number): string[] {
		const lines: string[] = [];
		for (const child of this.children) {
			const childLines = child.render(width);
			for (const line of childLines) {
				lines.push(line);
			}
		}
		return lines;
	}
}

/**
 * TUI - 管理终端 UI 并提供差异渲染的主类
 */
export class TUI extends Container {
	public terminal: Terminal;
	private previousLines: string[] = [];
	private previousKittyImageIds = new Set<number>();
	private previousWidth = 0;
	private previousHeight = 0;
	private focusedComponent: Component | null = null;
	private inputListeners = new Set<InputListener>();

	/** 调试键（Shift+Ctrl+D）的全局回调。在输入被转发到焦点组件之前调用。 */
	public onDebug?: () => void;
	private renderRequested = false;
	private renderTimer: NodeJS.Timeout | undefined;
	private lastRenderAt = 0;
	private static readonly MIN_RENDER_INTERVAL_MS = 16;
	private cursorRow = 0; // 逻辑光标行（渲染内容的末尾）
	private hardwareCursorRow = 0; // 实际终端光标行（可能因 IME 定位而不同）
	private showHardwareCursor = process.env.PI_HARDWARE_CURSOR === "1";
	private clearOnShrink = process.env.PI_CLEAR_ON_SHRINK === "1"; // 内容缩小时清除空行（默认关闭）
	private maxLinesRendered = 0; // 跟踪终端的工作区（曾经渲染过的最大行数）
	private previousViewportTop = 0; // 跟踪上一视图顶部位置，用于调整大小感知的光标移动
	private fullRedrawCount = 0;
	private stopped = false;

	// 覆盖层堆栈，用于在基础内容之上渲染的模态组件
	private focusOrderCounter = 0;
	private overlayStack: {
		component: Component;
		options?: OverlayOptions;
		preFocus: Component | null;
		hidden: boolean;
		focusOrder: number;
	}[] = [];

	constructor(terminal: Terminal, showHardwareCursor?: boolean) {
		super();
		this.terminal = terminal;
		if (showHardwareCursor !== undefined) {
			this.showHardwareCursor = showHardwareCursor;
		}
	}

	get fullRedraws(): number {
		return this.fullRedrawCount;
	}

	getShowHardwareCursor(): boolean {
		return this.showHardwareCursor;
	}

	setShowHardwareCursor(enabled: boolean): void {
		if (this.showHardwareCursor === enabled) return;
		this.showHardwareCursor = enabled;
		if (!enabled) {
			this.terminal.hideCursor();
		}
		this.requestRender();
	}

	getClearOnShrink(): boolean {
		return this.clearOnShrink;
	}

	/**
	 * 设置是否在内容缩小时触发完全重渲染。
	 * 为 true（默认）时，内容缩小时会清除空行。
	 * 为 false 时，空行保留（减少在慢速终端上的重绘）。
	 */
	setClearOnShrink(enabled: boolean): void {
		this.clearOnShrink = enabled;
	}

	setFocus(component: Component | null): void {
		// 清除旧组件的焦点标记
		if (isFocusable(this.focusedComponent)) {
			this.focusedComponent.focused = false;
		}

		this.focusedComponent = component;

		// 在新组件上设置焦点标记
		if (isFocusable(component)) {
			component.focused = true;
		}
	}

	/**
	 * 显示一个覆盖层组件，支持可配置的定位和尺寸。
	 * 返回一个句柄来控制覆盖层的可见性。
	 */
	showOverlay(component: Component, options?: OverlayOptions): OverlayHandle {
		const entry = {
			component,
			options,
			preFocus: this.focusedComponent,
			hidden: false,
			focusOrder: ++this.focusOrderCounter,
		};
		this.overlayStack.push(entry);
		// 仅当覆盖层实际可见时才聚焦
		if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
			this.setFocus(component);
		}
		this.terminal.hideCursor();
		this.requestRender();

		// 返回控制此覆盖层的句柄
		return {
			hide: () => {
				const index = this.overlayStack.indexOf(entry);
				if (index !== -1) {
					this.overlayStack.splice(index, 1);
					// 如果此覆盖层具有焦点，恢复焦点
					if (this.focusedComponent === component) {
						const topVisible = this.getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
					if (this.overlayStack.length === 0) this.terminal.hideCursor();
					this.requestRender();
				}
			},
			setHidden: (hidden: boolean) => {
				if (entry.hidden === hidden) return;
				entry.hidden = hidden;
				// 隐藏/显示时更新焦点
				if (hidden) {
					// 如果此覆盖层具有焦点，将焦点移到下一个可见或 preFocus
					if (this.focusedComponent === component) {
						const topVisible = this.getTopmostVisibleOverlay();
						this.setFocus(topVisible?.component ?? entry.preFocus);
					}
				} else {
					// 显示时恢复此覆盖层的焦点（如果它实际可见）
					if (!options?.nonCapturing && this.isOverlayVisible(entry)) {
						entry.focusOrder = ++this.focusOrderCounter;
						this.setFocus(component);
					}
				}
				this.requestRender();
			},
			isHidden: () => entry.hidden,
			focus: () => {
				if (!this.overlayStack.includes(entry) || !this.isOverlayVisible(entry)) return;
				if (this.focusedComponent !== component) {
					this.setFocus(component);
				}
				entry.focusOrder = ++this.focusOrderCounter;
				this.requestRender();
			},
			unfocus: () => {
				if (this.focusedComponent !== component) return;
				const topVisible = this.getTopmostVisibleOverlay();
				this.setFocus(topVisible && topVisible !== entry ? topVisible.component : entry.preFocus);
				this.requestRender();
			},
			isFocused: () => this.focusedComponent === component,
		};
	}

	/** 隐藏最顶层的覆盖层并恢复之前的焦点。 */
	hideOverlay(): void {
		const overlay = this.overlayStack.pop();
		if (!overlay) return;
		if (this.focusedComponent === overlay.component) {
			// 找到最顶层可见覆盖层，否则回退到 preFocus
			const topVisible = this.getTopmostVisibleOverlay();
			this.setFocus(topVisible?.component ?? overlay.preFocus);
		}
		if (this.overlayStack.length === 0) this.terminal.hideCursor();
		this.requestRender();
	}

	/** 检查是否有任何可见的覆盖层 */
	hasOverlay(): boolean {
		return this.overlayStack.some((o) => this.isOverlayVisible(o));
	}

	/** 检查覆盖层条目当前是否可见 */
	private isOverlayVisible(entry: (typeof this.overlayStack)[number]): boolean {
		if (entry.hidden) return false;
		if (entry.options?.visible) {
			return entry.options.visible(this.terminal.columns, this.terminal.rows);
		}
		return true;
	}

	/** 找到最顶层可见且捕获焦点的覆盖层（如果有） */
	private getTopmostVisibleOverlay(): (typeof this.overlayStack)[number] | undefined {
		for (let i = this.overlayStack.length - 1; i >= 0; i--) {
			if (this.overlayStack[i].options?.nonCapturing) continue;
			if (this.isOverlayVisible(this.overlayStack[i])) {
				return this.overlayStack[i];
			}
		}
		return undefined;
	}

	override invalidate(): void {
		super.invalidate();
		for (const overlay of this.overlayStack) overlay.component.invalidate?.();
	}

	start(): void {
		this.stopped = false;
		this.terminal.start(
			(data) => this.handleInput(data),
			() => this.requestRender(),
		);
		this.terminal.hideCursor();
		this.queryCellSize();
		this.requestRender();
	}

	addInputListener(listener: InputListener): () => void {
		this.inputListeners.add(listener);
		return () => {
			this.inputListeners.delete(listener);
		};
	}

	removeInputListener(listener: InputListener): void {
		this.inputListeners.delete(listener);
	}

	private queryCellSize(): void {
		// 仅当终端支持图像时查询（单元格尺寸仅用于图像渲染）
		if (!getCapabilities().images) {
			return;
		}
		// 向终端查询单元格像素尺寸：CSI 16 t
		// 响应格式：CSI 6 ; height ; width t
		this.terminal.write("\x1b[16t");
	}

	stop(): void {
		this.stopped = true;
		if (this.renderTimer) {
			clearTimeout(this.renderTimer);
			this.renderTimer = undefined;
		}
		// 将光标移到内容末尾，防止退出时覆盖/产生伪影
		if (this.previousLines.length > 0) {
			const targetRow = this.previousLines.length; // 最后一行之后的行
			const lineDiff = targetRow - this.hardwareCursorRow;
			if (lineDiff > 0) {
				this.terminal.write(`\x1b[${lineDiff}B`);
			} else if (lineDiff < 0) {
				this.terminal.write(`\x1b[${-lineDiff}A`);
			}
			this.terminal.write("\r\n");
		}

		this.terminal.showCursor();
		this.terminal.stop();
	}

	/**
	 * 请求渲染，可选强制完全重绘
	 * @param force - 如果为 true，强制从头开始完全重绘
	 */
	requestRender(force = false): void {
		if (force) {
			this.previousLines = [];
			this.previousWidth = -1; // -1 触发 widthChanged，强制完全清除
			this.previousHeight = -1; // -1 触发 heightChanged，强制完全清除
			this.cursorRow = 0;
			this.hardwareCursorRow = 0;
			this.maxLinesRendered = 0;
			this.previousViewportTop = 0;
			if (this.renderTimer) {
				clearTimeout(this.renderTimer);
				this.renderTimer = undefined;
			}
			this.renderRequested = true;
			process.nextTick(() => {
				if (this.stopped || !this.renderRequested) {
					return;
				}
				this.renderRequested = false;
				this.lastRenderAt = performance.now();
				this.doRender();
			});
			return;
		}
		if (this.renderRequested) return;
		this.renderRequested = true;
		process.nextTick(() => this.scheduleRender());
	}

	private scheduleRender(): void {
		if (this.stopped || this.renderTimer || !this.renderRequested) {
			return;
		}
		const elapsed = performance.now() - this.lastRenderAt;
		const delay = Math.max(0, TUI.MIN_RENDER_INTERVAL_MS - elapsed);
		this.renderTimer = setTimeout(() => {
			this.renderTimer = undefined;
			if (this.stopped || !this.renderRequested) {
				return;
			}
			this.renderRequested = false;
			this.lastRenderAt = performance.now();
			this.doRender();
			if (this.renderRequested) {
				this.scheduleRender();
			}
		}, delay);
	}

	private handleInput(data: string): void {
		if (this.inputListeners.size > 0) {
			let current = data;
			for (const listener of this.inputListeners) {
				const result = listener(current);
				if (result?.consume) {
					return;
				}
				if (result?.data !== undefined) {
					current = result.data;
				}
			}
			if (current.length === 0) {
				return;
			}
			data = current;
		}

		// 消耗终端单元格尺寸响应，不阻塞无关输入。
		if (this.consumeCellSizeResponse(data)) {
			return;
		}

		// 全局调试键处理程序（Shift+Ctrl+D）
		if (matchesKey(data, "shift+ctrl+d") && this.onDebug) {
			this.onDebug();
			return;
		}

		// 如果焦点组件是覆盖层，验证它是否仍然可见
		// （可见性可能因终端大小调整或 visible() 回调而改变）
		const focusedOverlay = this.overlayStack.find((o) => o.component === this.focusedComponent);
		if (focusedOverlay && !this.isOverlayVisible(focusedOverlay)) {
			// 焦点覆盖层不再可见，重定向到最顶层可见覆盖层
			const topVisible = this.getTopmostVisibleOverlay();
			if (topVisible) {
				this.setFocus(topVisible.component);
			} else {
				// 没有可见覆盖层，恢复到 preFocus
				this.setFocus(focusedOverlay.preFocus);
			}
		}

		// 将输入传递给焦点组件（包括 Ctrl+C）
		// 焦点组件可以决定如何处理 Ctrl+C
		if (this.focusedComponent?.handleInput) {
			// 除非组件选择接收，否则过滤掉键释放事件
			if (isKeyRelease(data) && !this.focusedComponent.wantsKeyRelease) {
				return;
			}
			this.focusedComponent.handleInput(data);
			this.requestRender();
		}
	}

	private consumeCellSizeResponse(data: string): boolean {
		// 响应格式：ESC [ 6 ; height ; width t
		const match = data.match(/^\x1b\[6;(\d+);(\d+)t$/);
		if (!match) {
			return false;
		}

		const heightPx = parseInt(match[1], 10);
		const widthPx = parseInt(match[2], 10);
		if (heightPx <= 0 || widthPx <= 0) {
			return true;
		}

		setCellDimensions({ widthPx, heightPx });
		// 使所有组件失效，使图像以正确尺寸重新渲染。
		this.invalidate();
		this.requestRender();
		return true;
	}

	/**
	 * 从选项解析覆盖层布局。
	 * 返回 { width, row, col, maxHeight } 用于渲染。
	 */
	private resolveOverlayLayout(
		options: OverlayOptions | undefined,
		overlayHeight: number,
		termWidth: number,
		termHeight: number,
	): { width: number; row: number; col: number; maxHeight: number | undefined } {
		const opt = options ?? {};

		// 解析边距（钳制为非负数）
		const margin =
			typeof opt.margin === "number"
				? { top: opt.margin, right: opt.margin, bottom: opt.margin, left: opt.margin }
				: (opt.margin ?? {});
		const marginTop = Math.max(0, margin.top ?? 0);
		const marginRight = Math.max(0, margin.right ?? 0);
		const marginBottom = Math.max(0, margin.bottom ?? 0);
		const marginLeft = Math.max(0, margin.left ?? 0);

		// 减去边距后的可用空间
		const availWidth = Math.max(1, termWidth - marginLeft - marginRight);
		const availHeight = Math.max(1, termHeight - marginTop - marginBottom);

		// === 解析宽度 ===
		let width = parseSizeValue(opt.width, termWidth) ?? Math.min(80, availWidth);
		// 应用 minWidth
		if (opt.minWidth !== undefined) {
			width = Math.max(width, opt.minWidth);
		}
		// 钳制到可用空间
		width = Math.max(1, Math.min(width, availWidth));

		// === 解析 maxHeight ===
		let maxHeight = parseSizeValue(opt.maxHeight, termHeight);
		// 钳制到可用空间
		if (maxHeight !== undefined) {
			maxHeight = Math.max(1, Math.min(maxHeight, availHeight));
		}

		// 有效覆盖层高度（可能被 maxHeight 钳制）
		const effectiveHeight = maxHeight !== undefined ? Math.min(overlayHeight, maxHeight) : overlayHeight;

		// === 解析位置 ===
		let row: number;
		let col: number;

		if (opt.row !== undefined) {
			if (typeof opt.row === "string") {
				// 百分比：0% = 顶部，100% = 底部（覆盖层保持在边界内）
				const match = opt.row.match(/^(\d+(?:\.\d+)?)%$/);
				if (match) {
					const maxRow = Math.max(0, availHeight - effectiveHeight);
					const percent = parseFloat(match[1]) / 100;
					row = marginTop + Math.floor(maxRow * percent);
				} else {
					// 格式无效，回退到居中
					row = this.resolveAnchorRow("center", effectiveHeight, availHeight, marginTop);
				}
			} else {
				// 绝对行位置
				row = opt.row;
			}
		} else {
			// 基于锚点（默认居中）
			const anchor = opt.anchor ?? "center";
			row = this.resolveAnchorRow(anchor, effectiveHeight, availHeight, marginTop);
		}

		if (opt.col !== undefined) {
			if (typeof opt.col === "string") {
				// 百分比：0% = 左侧，100% = 右侧（覆盖层保持在边界内）
				const match = opt.col.match(/^(\d+(?:\.\d+)?)%$/);
				if (match) {
					const maxCol = Math.max(0, availWidth - width);
					const percent = parseFloat(match[1]) / 100;
					col = marginLeft + Math.floor(maxCol * percent);
				} else {
					// 格式无效，回退到居中
					col = this.resolveAnchorCol("center", width, availWidth, marginLeft);
				}
			} else {
				// 绝对列位置
				col = opt.col;
			}
		} else {
			// 基于锚点（默认居中）
			const anchor = opt.anchor ?? "center";
			col = this.resolveAnchorCol(anchor, width, availWidth, marginLeft);
		}

		// 应用偏移
		if (opt.offsetY !== undefined) row += opt.offsetY;
		if (opt.offsetX !== undefined) col += opt.offsetX;

		// 钳制到终端边界（尊重边距）
		row = Math.max(marginTop, Math.min(row, termHeight - marginBottom - effectiveHeight));
		col = Math.max(marginLeft, Math.min(col, termWidth - marginRight - width));

		return { width, row, col, maxHeight };
	}

	private resolveAnchorRow(anchor: OverlayAnchor, height: number, availHeight: number, marginTop: number): number {
		switch (anchor) {
			case "top-left":
			case "top-center":
			case "top-right":
				return marginTop;
			case "bottom-left":
			case "bottom-center":
			case "bottom-right":
				return marginTop + availHeight - height;
			case "left-center":
			case "center":
			case "right-center":
				return marginTop + Math.floor((availHeight - height) / 2);
		}
	}

	private resolveAnchorCol(anchor: OverlayAnchor, width: number, availWidth: number, marginLeft: number): number {
		switch (anchor) {
			case "top-left":
			case "left-center":
			case "bottom-left":
				return marginLeft;
			case "top-right":
			case "right-center":
			case "bottom-right":
				return marginLeft + availWidth - width;
			case "top-center":
			case "center":
			case "bottom-center":
				return marginLeft + Math.floor((availWidth - width) / 2);
		}
	}

	/** 将所有覆盖层合成为内容行（按 focusOrder 排序，值越大则显示在最上层） */
	private compositeOverlays(lines: string[], termWidth: number, termHeight: number): string[] {
		if (this.overlayStack.length === 0) return lines;
		const result = [...lines];

		// 预渲染所有可见覆盖层并计算位置
		const rendered: { overlayLines: string[]; row: number; col: number; w: number }[] = [];
		let minLinesNeeded = result.length;

		const visibleEntries = this.overlayStack.filter((e) => this.isOverlayVisible(e));
		visibleEntries.sort((a, b) => a.focusOrder - b.focusOrder);
		for (const entry of visibleEntries) {
			const { component, options } = entry;

			// 首先使用高度=0 获取布局以确定宽度和 maxHeight
			// （宽度和 maxHeight 不依赖于覆盖层高度）
			const { width, maxHeight } = this.resolveOverlayLayout(options, 0, termWidth, termHeight);

			// 在计算出的宽度下渲染组件
			let overlayLines = component.render(width);

			// 如果指定了 maxHeight，则应用
			if (maxHeight !== undefined && overlayLines.length > maxHeight) {
				overlayLines = overlayLines.slice(0, maxHeight);
			}

			// 使用实际覆盖层高度获取最终行/列
			const { row, col } = this.resolveOverlayLayout(options, overlayLines.length, termWidth, termHeight);

			rendered.push({ overlayLines, row, col, w: width });
			minLinesNeeded = Math.max(minLinesNeeded, row + overlayLines.length);
		}

		// 至少填充到终端高度，以便覆盖层具有相对于屏幕的位置。
		// 排除 maxLinesRendered：历史高水位会导致自增强的膨胀，从而在终端变宽时将内容推入滚动缓冲区。
		const workingHeight = Math.max(result.length, termHeight, minLinesNeeded);

		// 如果内容太短以至于无法放置覆盖层或工作区，则用空行扩展结果
		while (result.length < workingHeight) {
			result.push("");
		}

		const viewportStart = Math.max(0, workingHeight - termHeight);

		// 合成每个覆盖层
		for (const { overlayLines, row, col, w } of rendered) {
			for (let i = 0; i < overlayLines.length; i++) {
				const idx = viewportStart + row + i;
				if (idx >= 0 && idx < result.length) {
					// 防御性：将覆盖层行截断到声明的宽度后再合成
					// （组件应已遵守宽度，但这确保了一致性）
					const truncatedOverlayLine =
						visibleWidth(overlayLines[i]) > w ? sliceByColumn(overlayLines[i], 0, w, true) : overlayLines[i];
					result[idx] = this.compositeLineAt(result[idx], truncatedOverlayLine, col, w, termWidth);
				}
			}
		}

		return result;
	}

	private static readonly SEGMENT_RESET = "\x1b[0m\x1b]8;;\x07";

	private applyLineResets(lines: string[]): string[] {
		const reset = TUI.SEGMENT_RESET;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!isImageLine(line)) {
				lines[i] = normalizeTerminalOutput(line) + reset;
			}
		}
		return lines;
	}

	private collectKittyImageIds(lines: string[]): Set<number> {
		const ids = new Set<number>();
		for (const line of lines) {
			for (const id of extractKittyImageIds(line)) {
				ids.add(id);
			}
		}
		return ids;
	}

	private deleteKittyImages(ids: Iterable<number>): string {
		let buffer = "";
		for (const id of ids) {
			buffer += deleteKittyImage(id);
		}
		return buffer;
	}

	private expandLastChangedForKittyImages(firstChanged: number, lastChanged: number): number {
		let expandedLastChanged = lastChanged;
		for (let i = firstChanged; i < this.previousLines.length; i++) {
			if (extractKittyImageIds(this.previousLines[i]).length > 0) {
				expandedLastChanged = Math.max(expandedLastChanged, i);
			}
		}
		return expandedLastChanged;
	}

	private deleteChangedKittyImages(firstChanged: number, lastChanged: number): string {
		if (firstChanged < 0 || lastChanged < firstChanged) return "";

		const ids = new Set<number>();
		const maxLine = Math.min(lastChanged, this.previousLines.length - 1);
		for (let i = firstChanged; i <= maxLine; i++) {
			for (const id of extractKittyImageIds(this.previousLines[i] ?? "")) {
				ids.add(id);
			}
		}

		return this.deleteKittyImages(ids);
	}

	/** 将覆盖层内容拼接到基线行的指定列。单遍优化。 */
	private compositeLineAt(
		baseLine: string,
		overlayLine: string,
		startCol: number,
		overlayWidth: number,
		totalWidth: number,
	): string {
		if (isImageLine(baseLine)) return baseLine;

		// 单遍遍历 baseLine，提取前后段
		const afterStart = startCol + overlayWidth;
		const base = extractSegments(baseLine, startCol, afterStart, totalWidth - afterStart, true);

		// 提取覆盖层，跟踪宽度（strict=true 排除边界处的宽字符）
		const overlay = sliceWithWidth(overlayLine, 0, overlayWidth, true);

		// 填充段以达到目标宽度
		const beforePad = Math.max(0, startCol - base.beforeWidth);
		const overlayPad = Math.max(0, overlayWidth - overlay.width);
		const actualBeforeWidth = Math.max(startCol, base.beforeWidth);
		const actualOverlayWidth = Math.max(overlayWidth, overlay.width);
		const afterTarget = Math.max(0, totalWidth - actualBeforeWidth - actualOverlayWidth);
		const afterPad = Math.max(0, afterTarget - base.afterWidth);

		// 合成结果
		const r = TUI.SEGMENT_RESET;
		const result =
			base.before +
			" ".repeat(beforePad) +
			r +
			overlay.text +
			" ".repeat(overlayPad) +
			r +
			base.after +
			" ".repeat(afterPad);

		// 关键：始终验证并截断到终端宽度。
		// 这是防止宽度溢出导致 TUI 崩溃的最后一道防线。
		// 宽度跟踪可能因以下原因偏离实际可见宽度：
		// - 复杂的 ANSI/OSC 序列（超链接、颜色）
		// - 分界处的宽字符
		// - 段提取中的边缘情况
		const resultWidth = visibleWidth(result);
		if (resultWidth <= totalWidth) {
			return result;
		}
		// 使用 strict=true 截断，确保不会超过 totalWidth
		return sliceByColumn(result, 0, totalWidth, true);
	}

	/**
	 * 从渲染的行中查找并提取光标位置。
	 * 搜索 CURSOR_MARKER，计算其位置，并将其从输出中剥离。
	 * 仅扫描底部终端高度行（可见视口）。
	 * @param lines - 要搜索的渲染行
	 * @param height - 终端高度（可见视口大小）
	 * @returns 光标位置 { row, col }，如果未找到标记则返回 null
	 */
	private extractCursorPosition(lines: string[], height: number): { row: number; col: number } | null {
		// 仅扫描底部 `height` 行（可见视口）
		const viewportTop = Math.max(0, lines.length - height);
		for (let row = lines.length - 1; row >= viewportTop; row--) {
			const line = lines[row];
			const markerIndex = line.indexOf(CURSOR_MARKER);
			if (markerIndex !== -1) {
				// 计算可视列（标记前文本的宽度）
				const beforeMarker = line.slice(0, markerIndex);
				const col = visibleWidth(beforeMarker);

				// 从行中剥离标记
				lines[row] = line.slice(0, markerIndex) + line.slice(markerIndex + CURSOR_MARKER.length);

				return { row, col };
			}
		}
		return null;
	}

	private doRender(): void {
		if (this.stopped) return;
		const width = this.terminal.columns;
		const height = this.terminal.rows;
		const widthChanged = this.previousWidth !== 0 && this.previousWidth !== width;
		const heightChanged = this.previousHeight !== 0 && this.previousHeight !== height;
		const previousBufferLength = this.previousHeight > 0 ? this.previousViewportTop + this.previousHeight : height;
		let prevViewportTop = heightChanged ? Math.max(0, previousBufferLength - height) : this.previousViewportTop;
		let viewportTop = prevViewportTop;
		let hardwareCursorRow = this.hardwareCursorRow;
		const computeLineDiff = (targetRow: number): number => {
			const currentScreenRow = hardwareCursorRow - prevViewportTop;
			const targetScreenRow = targetRow - viewportTop;
			return targetScreenRow - currentScreenRow;
		};

		// 渲染所有组件以获取新行
		let newLines = this.render(width);

		// 将覆盖层合成到渲染的行中（在差异比较之前）
		if (this.overlayStack.length > 0) {
			newLines = this.compositeOverlays(newLines, width, height);
		}

		// 在应用行重置之前提取光标位置（必须首先找到标记）
		const cursorPos = this.extractCursorPosition(newLines, height);

		newLines = this.applyLineResets(newLines);

		// 辅助函数：清除滚动缓冲区和视口，并渲染所有新行
		const fullRender = (clear: boolean): void => {
			this.fullRedrawCount += 1;
			let buffer = "\x1b[?2026h"; // 开始同步输出
			if (clear) {
				buffer += this.deleteKittyImages(this.previousKittyImageIds);
				buffer += "\x1b[2J\x1b[H\x1b[3J"; // 清屏，光标归位，然后清除滚动缓冲区
			}
			for (let i = 0; i < newLines.length; i++) {
				if (i > 0) buffer += "\r\n";
				buffer += newLines[i];
			}
			buffer += "\x1b[?2026l"; // 结束同步输出
			this.terminal.write(buffer);
			this.cursorRow = Math.max(0, newLines.length - 1);
			this.hardwareCursorRow = this.cursorRow;
			// 清除时重置最大行数，否则跟踪增长
			if (clear) {
				this.maxLinesRendered = newLines.length;
			} else {
				this.maxLinesRendered = Math.max(this.maxLinesRendered, newLines.length);
			}
			const bufferLength = Math.max(height, newLines.length);
			this.previousViewportTop = Math.max(0, bufferLength - height);
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousLines = newLines;
			this.previousKittyImageIds = this.collectKittyImageIds(newLines);
			this.previousWidth = width;
			this.previousHeight = height;
		};

		const debugRedraw = process.env.PI_DEBUG_REDRAW === "1";
		const logRedraw = (reason: string): void => {
			if (!debugRedraw) return;
			const logPath = path.join(os.homedir(), ".pi", "agent", "pi-debug.log");
			const msg = `[${new Date().toISOString()}] fullRender: ${reason} (prev=${this.previousLines.length}, new=${newLines.length}, height=${height})\n`;
			fs.appendFileSync(logPath, msg);
		};

		// 首次渲染 - 直接输出所有内容而不清除（假设屏幕干净）
		if (this.previousLines.length === 0 && !widthChanged && !heightChanged) {
			logRedraw("first render");
			fullRender(false);
			return;
		}

		// 宽度变化总是需要完全重渲染，因为换行会改变。
		if (widthChanged) {
			logRedraw(`terminal width changed (${this.previousWidth} -> ${width})`);
			fullRender(true);
			return;
		}

		// 高度变化通常需要完全重渲染以保持可见视口对齐，
		// 但在 Termux 环境中，当软件键盘显示或隐藏时会改变高度。
		// 在这种环境中，完全重绘会导致每次切换时整个历史重放。
		if (heightChanged && !isTermuxSession()) {
			logRedraw(`terminal height changed (${this.previousHeight} -> ${height})`);
			fullRender(true);
			return;
		}

		// 内容缩到工作区以下且没有覆盖层 - 重新渲染以清除空行
		// （覆盖层需要填充，因此仅在无覆盖层时执行）
		// 可通过 setClearOnShrink() 或 PI_CLEAR_ON_SHRINK=0 环境变量配置
		if (this.clearOnShrink && newLines.length < this.maxLinesRendered && this.overlayStack.length === 0) {
			logRedraw(`clearOnShrink (maxLinesRendered=${this.maxLinesRendered})`);
			fullRender(true);
			return;
		}

		// 找到第一个和最后一个改变的行
		let firstChanged = -1;
		let lastChanged = -1;
		const maxLines = Math.max(newLines.length, this.previousLines.length);
		for (let i = 0; i < maxLines; i++) {
			const oldLine = i < this.previousLines.length ? this.previousLines[i] : "";
			const newLine = i < newLines.length ? newLines[i] : "";

			if (oldLine !== newLine) {
				if (firstChanged === -1) {
					firstChanged = i;
				}
				lastChanged = i;
			}
		}
		const appendedLines = newLines.length > this.previousLines.length;
		if (appendedLines) {
			if (firstChanged === -1) {
				firstChanged = this.previousLines.length;
			}
			lastChanged = newLines.length - 1;
		}
		if (firstChanged !== -1) {
			lastChanged = this.expandLastChangedForKittyImages(firstChanged, lastChanged);
		}
		const appendStart = appendedLines && firstChanged === this.previousLines.length && firstChanged > 0;

		// 没有变化 - 但仍需在光标移动时更新硬件光标位置
		if (firstChanged === -1) {
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousViewportTop = prevViewportTop;
			this.previousHeight = height;
			return;
		}

		// 所有变化都在被删除的行中（无需渲染，只需清除）
		if (firstChanged >= newLines.length) {
			if (this.previousLines.length > newLines.length) {
				let buffer = "\x1b[?2026h";
				buffer += this.deleteChangedKittyImages(firstChanged, lastChanged);
				// 移动到新内容的末尾（空内容时钳制为 0）
				const targetRow = Math.max(0, newLines.length - 1);
				if (targetRow < prevViewportTop) {
					logRedraw(`deleted lines moved viewport up (${targetRow} < ${prevViewportTop})`);
					fullRender(true);
					return;
				}
				const lineDiff = computeLineDiff(targetRow);
				if (lineDiff > 0) buffer += `\x1b[${lineDiff}B`;
				else if (lineDiff < 0) buffer += `\x1b[${-lineDiff}A`;
				buffer += "\r";
				// 清除多余的行而不滚动
				const extraLines = this.previousLines.length - newLines.length;
				if (extraLines > height) {
					logRedraw(`extraLines > height (${extraLines} > ${height})`);
					fullRender(true);
					return;
				}
				if (extraLines > 0) {
					buffer += "\x1b[1B";
				}
				for (let i = 0; i < extraLines; i++) {
					buffer += "\r\x1b[2K";
					if (i < extraLines - 1) buffer += "\x1b[1B";
				}
				if (extraLines > 0) {
					buffer += `\x1b[${extraLines}A`;
				}
				buffer += "\x1b[?2026l";
				this.terminal.write(buffer);
				this.cursorRow = targetRow;
				this.hardwareCursorRow = targetRow;
			}
			this.positionHardwareCursor(cursorPos, newLines.length);
			this.previousLines = newLines;
			this.previousKittyImageIds = this.collectKittyImageIds(newLines);
			this.previousWidth = width;
			this.previousHeight = height;
			this.previousViewportTop = prevViewportTop;
			return;
		}

		// 差异渲染只能触及实际可见的部分。
		// 如果第一个改变的行在之前的视口之上，则需要完全重绘。
		if (firstChanged < prevViewportTop) {
			logRedraw(`firstChanged < viewportTop (${firstChanged} < ${prevViewportTop})`);
			fullRender(true);
			return;
		}

		// 从第一个改变的行渲染到末尾
		// 在同步输出中构建包含所有更新的缓冲区
		let buffer = "\x1b[?2026h"; // 开始同步输出
		buffer += this.deleteChangedKittyImages(firstChanged, lastChanged);
		const prevViewportBottom = prevViewportTop + height - 1;
		const moveTargetRow = appendStart ? firstChanged - 1 : firstChanged;
		if (moveTargetRow > prevViewportBottom) {
			const currentScreenRow = Math.max(0, Math.min(height - 1, hardwareCursorRow - prevViewportTop));
			const moveToBottom = height - 1 - currentScreenRow;
			if (moveToBottom > 0) {
				buffer += `\x1b[${moveToBottom}B`;
			}
			const scroll = moveTargetRow - prevViewportBottom;
			buffer += "\r\n".repeat(scroll);
			prevViewportTop += scroll;
			viewportTop += scroll;
			hardwareCursorRow = moveTargetRow;
		}

		// 将光标移到第一个改变的行（使用 hardwareCursorRow 获取实际位置）
		const lineDiff = computeLineDiff(moveTargetRow);
		if (lineDiff > 0) {
			buffer += `\x1b[${lineDiff}B`; // 向下移动
		} else if (lineDiff < 0) {
			buffer += `\x1b[${-lineDiff}A`; // 向上移动
		}

		buffer += appendStart ? "\r\n" : "\r"; // 移动到第 0 列

		// 仅渲染改变的行（firstChanged 到 lastChanged），而不是所有行到末尾
		// 这减少了只有单行变化时的闪烁（例如旋转动画）
		const renderEnd = Math.min(lastChanged, newLines.length - 1);
		for (let i = firstChanged; i <= renderEnd; i++) {
			if (i > firstChanged) buffer += "\r\n";
			buffer += "\x1b[2K"; // 清除当前行
			const line = newLines[i];
			const isImage = isImageLine(line);
			if (!isImage && visibleWidth(line) > width) {
				// 将所有行记录到崩溃文件以进行调试
				const crashLogPath = path.join(os.homedir(), ".pi", "agent", "pi-crash.log");
				const crashData = [
					`Crash at ${new Date().toISOString()}`,
					`Terminal width: ${width}`,
					`Line ${i} visible width: ${visibleWidth(line)}`,
					"",
					"=== All rendered lines ===",
					...newLines.map((l, idx) => `[${idx}] (w=${visibleWidth(l)}) ${l}`),
					"",
				].join("\n");
				fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
				fs.writeFileSync(crashLogPath, crashData);

				// 抛出前清理终端状态
				this.stop();

				const errorMsg = [
					`渲染的行 ${i} 超过了终端宽度 (${visibleWidth(line)} > ${width})。`,
					"",
					"这很可能是因为自定义 TUI 组件没有截断其输出。",
					"请使用 visibleWidth() 测量并使用 truncateToWidth() 截断行。",
					"",
					`调试日志已写入: ${crashLogPath}`,
				].join("\n");
				throw new Error(errorMsg);
			}
			buffer += line;
		}

		// 跟踪渲染后光标所在的行
		let finalCursorRow = renderEnd;

		// 如果之前行数更多，清除它们并将光标移回
		if (this.previousLines.length > newLines.length) {
			// 如果渲染提前终止，首先移动到新内容的末尾
			if (renderEnd < newLines.length - 1) {
				const moveDown = newLines.length - 1 - renderEnd;
				buffer += `\x1b[${moveDown}B`;
				finalCursorRow = newLines.length - 1;
			}
			const extraLines = this.previousLines.length - newLines.length;
			for (let i = newLines.length; i < this.previousLines.length; i++) {
				buffer += "\r\n\x1b[2K";
			}
			// 将光标移回新内容的末尾
			buffer += `\x1b[${extraLines}A`;
		}

		buffer += "\x1b[?2026l"; // 结束同步输出

		if (process.env.PI_TUI_DEBUG === "1") {
			const debugDir = "/tmp/tui";
			fs.mkdirSync(debugDir, { recursive: true });
			const debugPath = path.join(debugDir, `render-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
			const debugData = [
				`firstChanged: ${firstChanged}`,
				`viewportTop: ${viewportTop}`,
				`cursorRow: ${this.cursorRow}`,
				`height: ${height}`,
				`lineDiff: ${lineDiff}`,
				`hardwareCursorRow: ${hardwareCursorRow}`,
				`renderEnd: ${renderEnd}`,
				`finalCursorRow: ${finalCursorRow}`,
				`cursorPos: ${JSON.stringify(cursorPos)}`,
				`newLines.length: ${newLines.length}`,
				`previousLines.length: ${this.previousLines.length}`,
				"",
				"=== newLines ===",
				JSON.stringify(newLines, null, 2),
				"",
				"=== previousLines ===",
				JSON.stringify(this.previousLines, null, 2),
				"",
				"=== buffer ===",
				JSON.stringify(buffer),
			].join("\n");
			fs.writeFileSync(debugPath, debugData);
		}

		// 一次性写入整个缓冲区
		this.terminal.write(buffer);

		// 为下次渲染跟踪光标位置
		// cursorRow 跟踪内容末尾（用于视口计算）
		// hardwareCursorRow 跟踪实际终端光标位置（用于移动）
		this.cursorRow = Math.max(0, newLines.length - 1);
		this.hardwareCursorRow = finalCursorRow;
		// 跟踪终端的工作区（增长但不收缩，除非清除）
		this.maxLinesRendered = Math.max(this.maxLinesRendered, newLines.length);
		this.previousViewportTop = Math.max(prevViewportTop, finalCursorRow - height + 1);

		// 为 IME 定位硬件光标
		this.positionHardwareCursor(cursorPos, newLines.length);

		this.previousLines = newLines;
		this.previousKittyImageIds = this.collectKittyImageIds(newLines);
		this.previousWidth = width;
		this.previousHeight = height;
	}

	/**
	 * 为 IME 候选窗口定位硬件光标。
	 * @param cursorPos 从渲染输出中提取的光标位置，或 null
	 * @param totalLines 渲染的总行数
	 */
	private positionHardwareCursor(cursorPos: { row: number; col: number } | null, totalLines: number): void {
		if (!cursorPos || totalLines <= 0) {
			this.terminal.hideCursor();
			return;
		}

		// 将光标位置钳制到有效范围
		const targetRow = Math.max(0, Math.min(cursorPos.row, totalLines - 1));
		const targetCol = Math.max(0, cursorPos.col);

		// 从当前位置将光标移动到目标
		const rowDelta = targetRow - this.hardwareCursorRow;
		let buffer = "";
		if (rowDelta > 0) {
			buffer += `\x1b[${rowDelta}B`; // 向下移动
		} else if (rowDelta < 0) {
			buffer += `\x1b[${-rowDelta}A`; // 向上移动
		}
		// 移动到绝对列（基于 1）
		buffer += `\x1b[${targetCol + 1}G`;

		if (buffer) {
			this.terminal.write(buffer);
		}

		this.hardwareCursorRow = targetRow;
		if (this.showHardwareCursor) {
			this.terminal.showCursor();
		} else {
			this.terminal.hideCursor();
		}
	}
}
