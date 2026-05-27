/**
 * Send User Message Example
 *
 * Demonstrates pi.sendUserMessage() for sending user messages from extensions.
 * Unlike pi.sendMessage() which sends custom messages, sendUserMessage() sends
 * actual user messages that appear in the conversation as if typed by the user.
 *
 * Usage:
 *   /ask What is 2+2?     - Sends a user message (always triggers a turn)
 *   /steer Focus on X     - Sends while streaming with steer delivery
 *   /followup And then?   - Sends while streaming with followUp delivery
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// Simple command that sends a user message
	pi.registerCommand("ask", {
		description: "向智能体发送一条用户消息",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("用法：/ask <消息>", "warning");
				return;
			}

			// sendUserMessage always triggers a turn when not streaming
			// If streaming, it will throw (no deliverAs specified)
			if (!ctx.isIdle()) {
				ctx.ui.notify("智能体正忙，请使用 /steer 或 /followup 代替。", "warning");
				return;
			}

			pi.sendUserMessage(args);
		},
	});

	// Command that steers the agent mid-conversation
	pi.registerCommand("steer", {
		description: "发送一条引导消息（中断当前处理）",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("用法：/steer <消息>", "warning");
				return;
			}

			if (ctx.isIdle()) {
				// Not streaming, just send normally
				pi.sendUserMessage(args);
			} else {
				// Streaming - use steer to interrupt
				pi.sendUserMessage(args, { deliverAs: "steer" });
			}
		},
	});

	// Command that queues a follow-up message
	pi.registerCommand("followup", {
		description: "排队一条后续消息（等待当前处理完成）",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("用法：/followup <消息>", "warning");
				return;
			}

			if (ctx.isIdle()) {
				// Not streaming, just send normally
				pi.sendUserMessage(args);
			} else {
				// Streaming - queue as follow-up
				pi.sendUserMessage(args, { deliverAs: "followUp" });
				ctx.ui.notify("后续消息已排队", "info");
			}
		},
	});

	// Example with content array (text + images would go here)
	pi.registerCommand("askwith", {
		description: "发送一条包含结构化内容的用户消息",
		handler: async (args, ctx) => {
			if (!args.trim()) {
				ctx.ui.notify("用法：/askwith <消息>", "warning");
				return;
			}

			if (!ctx.isIdle()) {
				ctx.ui.notify("智能体正忙", "warning");
				return;
			}

			// sendUserMessage accepts string or (TextContent | ImageContent)[]
			pi.sendUserMessage([
				{ type: "text", text: `用户请求：${args}` },
				{ type: "text", text: "请简明扼要地回复。" },
			]);
		},
	});
}
