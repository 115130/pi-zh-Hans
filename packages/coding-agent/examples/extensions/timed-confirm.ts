/**
 * Example extension demonstrating timed dialogs with live countdown.
 *
 * Commands:
 * - /timed - Shows confirm dialog that auto-cancels after 5 seconds with countdown
 * - /timed-select - Shows select dialog that auto-cancels after 10 seconds with countdown
 * - /timed-signal - Shows confirm using AbortSignal (manual approach)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// Simple approach: use timeout option (recommended)
	pi.registerCommand("timed", {
		description: "显示一个带计时器的确认对话框（5秒后自动取消并显示倒计时）",
		handler: async (_args, ctx) => {
			const confirmed = await ctx.ui.confirm("定时确认", "此对话框将在5秒后自动取消。确认吗？", { timeout: 5000 });

			if (confirmed) {
				ctx.ui.notify("已由用户确认！", "info");
			} else {
				ctx.ui.notify("已取消或超时", "info");
			}
		},
	});

	pi.registerCommand("timed-select", {
		description: "显示一个带计时器的选择对话框（10秒后自动取消并显示倒计时）",
		handler: async (_args, ctx) => {
			const choice = await ctx.ui.select("选择一个选项", ["选项 A", "选项 B", "选项 C"], { timeout: 10000 });

			if (choice) {
				ctx.ui.notify(`已选择：${choice}`, "info");
			} else {
				ctx.ui.notify("选择已取消或超时", "info");
			}
		},
	});

	// Manual approach: use AbortSignal for more control
	pi.registerCommand("timed-signal", {
		description: "使用 AbortSignal 显示定时确认（手动方式）",
		handler: async (_args, ctx) => {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			ctx.ui.notify("对话框将在5秒后自动取消...", "info");

			const confirmed = await ctx.ui.confirm("定时确认", "此对话框将在5秒后自动取消。确认吗？", {
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (confirmed) {
				ctx.ui.notify("已由用户确认！", "info");
			} else if (controller.signal.aborted) {
				ctx.ui.notify("对话框超时（自动取消）", "warning");
			} else {
				ctx.ui.notify("用户已取消", "info");
			}
		},
	});
}
