/**
 * Custom Compaction Extension
 *
 * Replaces the default compaction behavior with a full summary of the entire context.
 * Instead of keeping the last 20k tokens of conversation turns, this extension:
 * 1. Summarizes ALL messages (messagesToSummarize + turnPrefixMessages)
 * 2. Discards all old turns completely, keeping only the summary
 *
 * This example also demonstrates using a different model (Gemini Flash) for summarization,
 * which can be cheaper/faster than the main conversation model.
 *
 * Usage:
 *   pi --extension examples/extensions/custom-compaction.ts
 */

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_before_compact", async (event, ctx) => {
		ctx.ui.notify("自定义压缩扩展已触发", "info");

		const { preparation, branchEntries: _, signal } = event;
		const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary } = preparation;

		// Use Gemini Flash for summarization (cheaper/faster than most conversation models)
		const model = ctx.modelRegistry.find("google", "gemini-2.5-flash");
		if (!model) {
			ctx.ui.notify("找不到Gemini Flash模型，使用默认压缩", "warning");
			return;
		}

		// Resolve request auth for the summarization model
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			ctx.ui.notify(`压缩认证失败：${auth.error}`, "warning");
			return;
		}
		if (!auth.apiKey) {
			ctx.ui.notify(`${model.provider}没有API密钥，使用默认压缩`, "warning");
			return;
		}

		// Combine all messages for full summary
		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];

		ctx.ui.notify(
			`自定义压缩：正在使用${model.id}总结${allMessages.length}条消息（${tokensBefore.toLocaleString()} tokens）...`,
			"info",
		);

		// Convert messages to readable text format
		const conversationText = serializeConversation(convertToLlm(allMessages));

		// Include previous summary context if available
		const previousContext = previousSummary ? `\n\nPrevious session summary for context:\n${previousSummary}` : "";

		// Build messages that ask for a comprehensive summary
		const summaryMessages = [
			{
				role: "user" as const,
				content: [
					{
						type: "text" as const,
						text: `You are a conversation summarizer. Create a comprehensive summary of this conversation that captures:${previousContext}

1. The main goals and objectives discussed
2. Key decisions made and their rationale
3. Important code changes, file modifications, or technical details
4. Current state of any ongoing work
5. Any blockers, issues, or open questions
6. Next steps that were planned or suggested

Be thorough but concise. The summary will replace the ENTIRE conversation history, so include all information needed to continue the work effectively.

Format the summary as structured markdown with clear sections.

<conversation>
${conversationText}
</conversation>`,
					},
				],
				timestamp: Date.now(),
			},
		];

		try {
			// Pass signal to honor abort requests (e.g., user cancels compaction)
			const response = await complete(
				model,
				{ messages: summaryMessages },
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens: 8192,
					signal,
				},
			);

			const summary = response.content
				.filter((c): c is { type: "text"; text: string } => c.type === "text")
				.map((c) => c.text)
				.join("\n");

			if (!summary.trim()) {
				if (!signal.aborted) ctx.ui.notify("压缩摘要为空，使用默认压缩", "warning");
				return;
			}

			// Return compaction content - SessionManager adds id/parentId
			// Use firstKeptEntryId from preparation to keep recent messages
			return {
				compaction: {
					summary,
					firstKeptEntryId,
					tokensBefore,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`压缩失败：${message}`, "error");
			// Fall back to default compaction on error
			return;
		}
	});
}
