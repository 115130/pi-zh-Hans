/**
 * Shutdown Command Extension
 *
 * Adds a /quit command that allows extensions to trigger clean shutdown.
 * Demonstrates how extensions can use ctx.shutdown() to exit pi cleanly.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	// Register a /quit command that cleanly exits pi
	pi.registerCommand("quit", {
		description: "干净地退出 pi",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	// You can also create a tool that shuts down after completing work
	pi.registerTool({
		name: "finish_and_exit",
		label: "完成并退出",
		description: "完成任务后退出 pi",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			// Do any final work here...
			// Request graceful shutdown (deferred until agent is idle)
			ctx.shutdown();

			// This return is sent to the LLM before shutdown occurs
			return {
				content: [{ type: "text", text: "已请求关闭，响应后退出。" }],
				details: {},
			};
		},
	});

	// You could also create a more complex tool with parameters
	pi.registerTool({
		name: "deploy_and_exit",
		label: "部署并退出",
		description: "部署应用程序后退出 pi",
		parameters: Type.Object({
			environment: Type.String({ description: "目标环境（如 production、staging）" }),
		}),
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			onUpdate?.({ content: [{ type: "text", text: `正在部署到 ${params.environment}...` }], details: {} });

			// Example deployment logic
			// const result = await pi.exec("npm", ["run", "deploy", params.environment], { signal });

			// On success, request graceful shutdown
			onUpdate?.({ content: [{ type: "text", text: "部署完成，正在退出..." }], details: {} });
			ctx.shutdown();

			return {
				content: [{ type: "text", text: "完成！已请求关闭。" }],
				details: { environment: params.environment },
			};
		},
	});
}
