/**
 * Reload Runtime Extension
 *
 * Demonstrates ctx.reload() from ExtensionCommandContext and an LLM-callable
 * tool that queues a follow-up command to trigger reload.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	// Command entrypoint for reload.
	// Treat reload as terminal for this handler.
	pi.registerCommand("reload-runtime", {
		description: "重新加载扩展、技能、提示和主题",
		handler: async (_args, ctx) => {
			await ctx.reload();
			return;
		},
	});

	// LLM-callable tool. Tools get ExtensionContext, so they cannot call ctx.reload() directly.
	// Instead, queue a follow-up user command that executes the command above.
	pi.registerTool({
		name: "reload_runtime",
		label: "重新加载运行时",
		description: "重新加载扩展、技能、提示和主题",
		parameters: Type.Object({}),
		async execute() {
			pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });
			return {
				content: [{ type: "text", text: "已将对 /reload-runtime 的命令排队作为后续命令。" }],
				details: {},
			};
		},
	});
}
