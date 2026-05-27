/**
 * Confirm Destructive Actions Extension
 *
 * Prompts for confirmation before destructive session actions (clear, switch, branch).
 * Demonstrates how to cancel session events using the before_* events.
 */

import type { ExtensionAPI, SessionBeforeSwitchEvent, SessionMessageEntry } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_before_switch", async (event: SessionBeforeSwitchEvent, ctx) => {
		if (!ctx.hasUI) return;

		if (event.reason === "new") {
			const confirmed = await ctx.ui.confirm("清除会话？", "这将删除当前会话中的所有消息。");

			if (!confirmed) {
				ctx.ui.notify("清除已取消", "info");
				return { cancel: true };
			}
			return;
		}

		// reason === "resume" - check if there are unsaved changes (messages since last assistant response)
		const entries = ctx.sessionManager.getEntries();
		const hasUnsavedWork = entries.some(
			(e): e is SessionMessageEntry => e.type === "message" && e.message.role === "user",
		);

		if (hasUnsavedWork) {
			const confirmed = await ctx.ui.confirm("切换会话？", "当前会话中有未保存的消息。仍要切换吗？");

			if (!confirmed) {
				ctx.ui.notify("切换已取消", "info");
				return { cancel: true };
			}
		}
	});

	pi.on("session_before_fork", async (event, ctx) => {
		if (!ctx.hasUI) return;

		const choice = await ctx.ui.select(`从条目 ${event.entryId.slice(0, 8)} 分叉？`, [
			"是，创建分叉",
			"否，留在当前会话",
		]);

		if (choice !== "Yes, create fork") {
			ctx.ui.notify("分叉已取消", "info");
			return { cancel: true };
		}
	});
}
