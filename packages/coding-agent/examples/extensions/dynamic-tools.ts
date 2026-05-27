/**
 * Dynamic Tools Extension
 *
 * Demonstrates registering tools after session initialization.
 *
 * - Registers one tool during session_start
 * - Registers additional tools at runtime via /add-echo-tool <name>
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const ECHO_PARAMS = Type.Object({
	message: Type.String({ description: "要回显的消息" }),
});

function normalizeToolName(input: string): string | undefined {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed) return undefined;
	if (!/^[a-z0-9_]+$/.test(trimmed)) return undefined;
	return trimmed;
}

export default function dynamicToolsExtension(pi: ExtensionAPI) {
	const registeredToolNames = new Set<string>();

	const registerEchoTool = (name: string, label: string, prefix: string): boolean => {
		if (registeredToolNames.has(name)) {
			return false;
		}

		registeredToolNames.add(name);
		pi.registerTool({
			name,
			label,
			description: `使用前缀回显消息：${prefix}`,
			promptSnippet: `用 ${prefix.trim()} 前缀回显用户提供的文本`,
			promptGuidelines: ["当用户要求精确回显输出时，使用 echo_session。"],
			parameters: ECHO_PARAMS,
			async execute(_toolCallId, params) {
				return {
					content: [{ type: "text", text: `${prefix}${params.message}` }],
					details: { tool: name, prefix },
				};
			},
		});

		return true;
	};

	pi.on("session_start", (_event, ctx) => {
		registerEchoTool("echo_session", "回显会话", "[session] ");
		ctx.ui.notify("已注册动态工具：echo_session", "info");
	});

	pi.registerCommand("add-echo-tool", {
		description: "动态注册新的回显工具：/add-echo-tool <tool_name>",
		handler: async (args, ctx) => {
			const toolName = normalizeToolName(args);
			if (!toolName) {
				ctx.ui.notify("用法：/add-echo-tool <tool_name>（小写字母、数字、下划线）", "warning");
				return;
			}

			const created = registerEchoTool(toolName, `回显 ${toolName}`, `[${toolName}] `);
			if (!created) {
				ctx.ui.notify(`工具已注册：${toolName}`, "warning");
				return;
			}

			ctx.ui.notify(`已注册动态工具：${toolName}`, "info");
		},
	});
}
