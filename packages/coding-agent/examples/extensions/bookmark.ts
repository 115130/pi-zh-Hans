/**
 * Entry bookmarking example.
 *
 * Shows setLabel to mark entries with labels for easy navigation in /tree.
 * Labels appear in the tree view and help you find important points.
 *
 * Usage: /bookmark [label] - bookmark the last assistant message
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("bookmark", {
		description: "为最后一条消息添加书签（用法：/bookmark [标签]）",
		handler: async (args, ctx) => {
			const label = args.trim() || `bookmark-${Date.now()}`;

			// Find the last assistant message entry
			const entries = ctx.sessionManager.getEntries();
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				if (entry.type === "message" && entry.message.role === "assistant") {
					pi.setLabel(entry.id, label);
					ctx.ui.notify(`已添加书签：${label}`, "info");
					return;
				}
			}

			ctx.ui.notify("没有可添加书签的助手消息", "warning");
		},
	});

	// Remove bookmark
	pi.registerCommand("unbookmark", {
		description: "移除最后一条带标签条目的书签",
		handler: async (_args, ctx) => {
			const entries = ctx.sessionManager.getEntries();
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				const label = ctx.sessionManager.getLabel(entry.id);
				if (label) {
					pi.setLabel(entry.id, undefined);
					ctx.ui.notify(`已移除书签：${label}`, "info");
					return;
				}
			}
			ctx.ui.notify("未找到带书签的条目", "warning");
		},
	});
}
