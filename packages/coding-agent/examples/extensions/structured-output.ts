/**
 * Structured Output Tool
 *
 * Demonstrates `terminate: true` so the agent can end on a tool call
 * without paying for an extra follow-up LLM turn.
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

interface StructuredOutputDetails {
	headline: string;
	summary: string;
	actionItems: string[];
}

const structuredOutputTool = defineTool({
	name: "structured_output",
	label: "结构化输出",
	description: "返回最终的结构化答案。当用户要求结构化输出或机器可读摘要时，请将此作为您的最后操作。",
	promptSnippet: "以工具终止结果的形式发出最终的结构化答案",
	promptGuidelines: [
		"当用户要求结构化输出、类似 JSON 的输出或机器可读摘要时，请使用 structured_output 作为您的最终操作。",
		"调用 structured_output 后，请勿在同一轮中发出另一个助手响应。",
	],
	parameters: Type.Object({
		headline: Type.String({ description: "结果的简短标题" }),
		summary: Type.String({ description: "一段摘要" }),
		actionItems: Type.Array(Type.String(), { description: "具体的后续步骤或关键要点" }),
	}),

	async execute(_toolCallId, params) {
		return {
			content: [{ type: "text", text: `已保存结构化输出：${params.headline}` }],
			details: {
				headline: params.headline,
				summary: params.summary,
				actionItems: params.actionItems,
			} satisfies StructuredOutputDetails,
			terminate: true,
		};
	},

	renderResult(result, _options, theme) {
		const details = result.details as StructuredOutputDetails | undefined;
		if (!details) {
			const text = result.content[0];
			return new Text(text?.type === "text" ? text.text : "", 0, 0);
		}

		const lines = [
			theme.fg("toolTitle", theme.bold(details.headline)),
			theme.fg("text", details.summary),
			"",
			...details.actionItems.map((item, index) => theme.fg("muted", `${index + 1}. ${item}`)),
		];
		return new Text(lines.join("\n"), 0, 0);
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(structuredOutputTool);
}
