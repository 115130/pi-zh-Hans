/**
 * Dirty Repo Guard Extension
 *
 * Prevents session changes when there are uncommitted git changes.
 * Useful to ensure work is committed before switching context.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

async function checkDirtyRepo(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	action: string,
): Promise<{ cancel: boolean } | undefined> {
	// Check for uncommitted changes
	const { stdout, code } = await pi.exec("git", ["status", "--porcelain"]);

	if (code !== 0) {
		// Not a git repo, allow the action
		return;
	}

	const hasChanges = stdout.trim().length > 0;
	if (!hasChanges) {
		return;
	}

	if (!ctx.hasUI) {
		// In non-interactive mode, block by default
		return { cancel: true };
	}

	// Count changed files
	const changedFiles = stdout.trim().split("\n").filter(Boolean).length;

	const choice = await ctx.ui.select(`您有 ${changedFiles} 个未提交的文件。仍要${action}吗？`, [
		"是，继续执行",
		"不，让我先提交",
	]);

	if (choice !== "是，继续执行") {
		ctx.ui.notify("请先提交您的更改", "warning");
		return { cancel: true };
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_before_switch", async (event, ctx) => {
		const action = event.reason === "new" ? "新会话" : "切换会话";
		return checkDirtyRepo(pi, ctx, action);
	});

	pi.on("session_before_fork", async (_event, ctx) => {
		return checkDirtyRepo(pi, ctx, "分支");
	});
}
