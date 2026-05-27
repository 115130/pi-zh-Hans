/**
 * Session naming example.
 *
 * Shows setSessionName/getSessionName to give sessions friendly names
 * that appear in the session selector instead of the first message.
 *
 * Usage: /session-name [name] - set or show session name
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("session-name", {
		description: "设置或显示会话名称（用法：/session-name [新名称]）",
		handler: async (args, ctx) => {
			const name = args.trim();

			if (name) {
				pi.setSessionName(name);
				ctx.ui.notify(`会话已命名: ${name}`, "info");
			} else {
				const current = pi.getSessionName();
				ctx.ui.notify(current ? `当前会话: ${current}` : "尚未设置会话名称", "info");
			}
		},
	});
}
