import type { Component } from "@earendil-works/pi-tui";
import { theme } from "../theme/theme.ts";

/**
 * 随视口宽度动态调整的边框组件。
 *
 * 注意：当从通过 jiti 加载的扩展中使用时，全局 `theme` 可能未定义，
 * 因为 jiti 会创建单独的模块缓存。在导出用于扩展的组件中使用
 * DynamicBorder 时，请始终传递显式的颜色函数。
 */
export class DynamicBorder implements Component {
	private color: (str: string) => string;

	constructor(color: (str: string) => string = (str) => theme.fg("border", str)) {
		this.color = color;
	}

	invalidate(): void {
		// 当前没有需要失效的缓存状态。
	}

	render(width: number): string[] {
		return [this.color("─".repeat(Math.max(1, width)))];
	}
}
