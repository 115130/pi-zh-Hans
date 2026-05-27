/**
 * Overlay Test - validates overlay compositing with inline text inputs
 *
 * Usage: pi --extension ./examples/extensions/overlay-test.ts
 *
 * Run /overlay-test to show a floating overlay with:
 * - Inline text inputs within menu items
 * - Edge case tests (wide chars, styled text, emoji)
 */

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type Focusable, matchesKey, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("overlay-test", {
		description: "测试叠加渲染（含边界情况）",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const result = await ctx.ui.custom<{ action: string; query?: string } | undefined>(
				(_tui, theme, _keybindings, done) => new OverlayTestComponent(theme, done),
				{ overlay: true },
			);

			if (result) {
				const msg = result.query ? `${result.action}: "${result.query}"` : result.action;
				ctx.ui.notify(msg, "info");
			}
		},
	});
}

class OverlayTestComponent implements Focusable {
	readonly width = 70;

	/** Focusable interface - set by TUI when focus changes */
	focused = false;

	private selected = 0;
	private items = [
		{ label: "搜索", hasInput: true, text: "", cursor: 0 },
		{ label: "运行", hasInput: true, text: "", cursor: 0 },
		{ label: "设置", hasInput: false, text: "", cursor: 0 },
		{ label: "取消", hasInput: false, text: "", cursor: 0 },
	];

	private theme: Theme;
	private done: (result: { action: string; query?: string } | undefined) => void;

	constructor(theme: Theme, done: (result: { action: string; query?: string } | undefined) => void) {
		this.theme = theme;
		this.done = done;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(undefined);
			return;
		}

		const current = this.items[this.selected]!;

		if (matchesKey(data, "return")) {
			this.done({ action: current.label, query: current.hasInput ? current.text : undefined });
			return;
		}

		if (matchesKey(data, "up")) {
			this.selected = Math.max(0, this.selected - 1);
		} else if (matchesKey(data, "down")) {
			this.selected = Math.min(this.items.length - 1, this.selected + 1);
		} else if (current.hasInput) {
			if (matchesKey(data, "backspace")) {
				if (current.cursor > 0) {
					current.text = current.text.slice(0, current.cursor - 1) + current.text.slice(current.cursor);
					current.cursor--;
				}
			} else if (matchesKey(data, "left")) {
				current.cursor = Math.max(0, current.cursor - 1);
			} else if (matchesKey(data, "right")) {
				current.cursor = Math.min(current.text.length, current.cursor + 1);
			} else if (data.length === 1 && data.charCodeAt(0) >= 32) {
				current.text = current.text.slice(0, current.cursor) + data + current.text.slice(current.cursor);
				current.cursor++;
			}
		}
	}

	render(_width: number): string[] {
		const w = this.width;
		const th = this.theme;
		const innerW = w - 2;
		const lines: string[] = [];

		const pad = (s: string, len: number) => {
			const vis = visibleWidth(s);
			return s + " ".repeat(Math.max(0, len - vis));
		};

		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));
		lines.push(row(` ${th.fg("accent", "🧪 叠加测试")}`));
		lines.push(row(""));

		// Edge cases - full width lines to test compositing at boundaries
		lines.push(row(` ${th.fg("dim", "─── 边界情况（边框应对齐） ───")}`));
		lines.push(row(` 宽字符: ${th.fg("warning", "中文日本語한글テスト漢字繁體简体ひらがなカタカナ가나다라마바")}`));
		lines.push(
			row(
				` 样式: ${th.fg("error", "红")} ${th.fg("success", "绿")} ${th.fg("warning", "黄")} ${th.fg("accent", "强调")} ${th.fg("dim", "暗淡")} ${th.fg("error", "更多")} ${th.fg("success", "颜色")}`,
			),
		);
		lines.push(row(" 表情符号: 👨‍👩‍👧‍👦 🇯🇵 🚀 💻 🎉 🔥 😀 🎯 🌟 💡 🎨 🔧 📦 🏆 🌈 🎪 🎭 🎬 🎮 🎲"));
		lines.push(row(""));

		// Menu with inline inputs
		lines.push(row(` ${th.fg("dim", "─── 操作 ───")}`));

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i]!;
			const isSelected = i === this.selected;
			const prefix = isSelected ? " ▶ " : "   ";

			let content: string;
			if (item.hasInput) {
				const label = isSelected ? th.fg("accent", `${item.label}:`) : th.fg("text", `${item.label}:`);

				let inputDisplay = item.text;
				if (isSelected) {
					const before = inputDisplay.slice(0, item.cursor);
					const cursorChar = item.cursor < inputDisplay.length ? inputDisplay[item.cursor] : " ";
					const after = inputDisplay.slice(item.cursor + 1);
					// Emit hardware cursor marker for IME support when focused
					const marker = this.focused ? CURSOR_MARKER : "";
					inputDisplay = `${before}${marker}\x1b[7m${cursorChar}\x1b[27m${after}`;
				}
				content = `${prefix + label} ${inputDisplay}`;
			} else {
				content = prefix + (isSelected ? th.fg("accent", item.label) : th.fg("text", item.label));
			}

			lines.push(row(content));
		}

		lines.push(row(""));
		lines.push(row(` ${th.fg("dim", "↑↓ 导航 • 输入文本 • 回车选择 • Esc 取消")}`));
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));

		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}
