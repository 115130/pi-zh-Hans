/**
 * 用于将文本截断为可视行（考虑换行）的共享工具。
 * 由 tool-execution.ts 和 bash-execution.ts 使用，以保证行为一致性。
 */

import { Text } from "@earendil-works/pi-tui";

export interface VisualTruncateResult {
	/** 要显示的可视行 */
	visualLines: string[];
	/** 被跳过（隐藏）的可视行数 */
	skippedCount: number;
}

/**
 * 从末尾将文本截断为最多指定的可视行数。
 * 该函数会考虑基于终端宽度的自动换行。
 *
 * @param text - 文本内容（可能包含换行符）
 * @param maxVisualLines - 要显示的最大可视行数
 * @param width - 终端/渲染宽度
 * @param paddingX - Text 组件的水平内边距（默认 0）。
 *                   如果结果将放入 Box 中，请使用 0（Box 自带内边距）。
 *                   如果结果将放入纯 Container 中，请使用 1。
 * @returns 截断后的可视行及跳过的行数
 */
export function truncateToVisualLines(
	text: string,
	maxVisualLines: number,
	width: number,
	paddingX: number = 0,
): VisualTruncateResult {
	if (!text) {
		return { visualLines: [], skippedCount: 0 };
	}

	// 创建一个临时的 Text 组件来渲染并获取可视行
	const tempText = new Text(text, paddingX, 0);
	const allVisualLines = tempText.render(width);

	if (allVisualLines.length <= maxVisualLines) {
		return { visualLines: allVisualLines, skippedCount: 0 };
	}

	// 取最后的 N 个可视行
	const truncatedLines = allVisualLines.slice(-maxVisualLines);
	const skippedCount = allVisualLines.length - maxVisualLines;

	return { visualLines: truncatedLines, skippedCount };
}
