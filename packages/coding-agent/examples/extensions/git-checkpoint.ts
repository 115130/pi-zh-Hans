/**
 * Git Checkpoint 扩展
 *
 * 在每次对话轮次创建 git stash 检查点，以便 /fork 可以恢复代码状态。
 * 当分支时，提供将代码恢复至历史相应点的选项。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const checkpoints = new Map<string, string>();
	let currentEntryId: string | undefined;

	// 当用户消息被保存时，跟踪当前条目 ID
	pi.on("tool_result", async (_event, ctx) => {
		const leaf = ctx.sessionManager.getLeafEntry();
		if (leaf) currentEntryId = leaf.id;
	});

	pi.on("turn_start", async () => {
		// 在 LLM 进行修改之前创建一个 git stash 条目
		const { stdout } = await pi.exec("git", ["stash", "create"]);
		const ref = stdout.trim();
		if (ref && currentEntryId) {
			checkpoints.set(currentEntryId, ref);
		}
	});

	pi.on("session_before_fork", async (event, ctx) => {
		const ref = checkpoints.get(event.entryId);
		if (!ref) return;

		if (!ctx.hasUI) {
			// 在非交互模式下，不自动恢复
			return;
		}

		const choice = await ctx.ui.select("恢复代码状态？", ["是的，将代码恢复到那一点", "不，保留当前代码"]);

		if (choice?.startsWith("是的")) {
			await pi.exec("git", ["stash", "apply", ref]);
			ctx.ui.notify("代码已恢复到检查点", "info");
		}
	});

	pi.on("agent_end", async () => {
		// 代理完成后清除检查点
		checkpoints.clear();
	});
}
