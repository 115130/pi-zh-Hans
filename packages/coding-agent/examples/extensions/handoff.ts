/**
 * Handoff extension - transfer context to a new focused session
 *
 * Instead of compacting (which is lossy), handoff extracts what matters
 * for your next task and creates a new session with a generated prompt.
 *
 * Usage:
 *   /handoff now implement this for teams as well
 *   /handoff execute phase one of the plan
 *   /handoff check other places that need this fix
 *
 * The generated prompt appears as a draft in the editor for review/editing.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, SessionEntry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

const SYSTEM_PROMPT = `You are a context transfer assistant. Given a conversation history and the user's goal for a new thread, generate a focused prompt that:

1. Summarizes relevant context from the conversation (decisions made, approaches taken, key findings)
2. Lists any relevant files that were discussed or modified
3. Clearly states the next task based on the user's goal
4. Is self-contained - the new thread should be able to proceed without the old conversation

Format your response as a prompt the user can send to start the new thread. Be concise but include all necessary context. Do not include any preamble like "Here's the prompt" - just output the prompt itself.

Example output format:
## Context
We've been working on X. Key decisions:
- Decision 1
- Decision 2

Files involved:
- path/to/file1.ts
- path/to/file2.ts

## Task
[Clear description of what to do next based on user's goal]`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: new Date(entry.timestamp).getTime(),
		};
	}
	return undefined;
}

function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
	let compactionIndex = -1;
	for (let i = branch.length - 1; i >= 0; i--) {
		if (branch[i].type === "compaction") {
			compactionIndex = i;
			break;
		}
	}
	if (compactionIndex < 0) {
		return branch.map(entryToMessage).filter((message) => message !== undefined);
	}

	const compaction = branch[compactionIndex];
	const firstKeptIndex =
		compaction.type === "compaction" ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId) : -1;
	const compactedBranch = [
		compaction,
		...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
		...branch.slice(compactionIndex + 1),
	];
	return compactedBranch.map(entryToMessage).filter((message) => message !== undefined);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("handoff", {
		description: "将上下文移交到新的专注会话",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("handoff 需要交互模式", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("未选择模型", "error");
				return;
			}

			const goal = args.trim();
			if (!goal) {
				ctx.ui.notify("用法：/handoff <新线程的目标>", "error");
				return;
			}

			// Gather conversation context from current branch. If the branch was compacted,
			// include the compaction summary plus entries from firstKeptEntryId onward.
			const messages = getHandoffMessages(ctx.sessionManager.getBranch());

			if (messages.length === 0) {
				ctx.ui.notify("没有可移交的对话", "error");
				return;
			}

			// Convert to LLM format and serialize
			const llmMessages = convertToLlm(messages);
			const conversationText = serializeConversation(llmMessages);
			const currentSessionFile = ctx.sessionManager.getSessionFile();

			// Generate the handoff prompt with loader UI
			const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
				const loader = new BorderedLoader(tui, theme, `正在生成移交提示...`);
				loader.onAbort = () => done(null);

				const doGenerate = async () => {
					const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
					if (!auth.ok || !auth.apiKey) {
						throw new Error(auth.ok ? `无 ${ctx.model!.provider} 的 API 密钥` : auth.error);
					}

					const userMessage: Message = {
						role: "user",
						content: [
							{
								type: "text",
								text: `## 对话历史\n\n${conversationText}\n\n## 用户新线程的目标\n\n${goal}`,
							},
						],
						timestamp: Date.now(),
					};

					const response = await complete(
						ctx.model!,
						{ systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
						{ apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
					);

					if (response.stopReason === "aborted") {
						return null;
					}

					return response.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
				};

				doGenerate()
					.then(done)
					.catch((err) => {
						console.error("移交生成失败:", err);
						done(null);
					});

				return loader;
			});

			if (result === null) {
				ctx.ui.notify("已取消", "info");
				return;
			}

			// Let user edit the generated prompt
			const editedPrompt = await ctx.ui.editor("编辑移交提示", result);

			if (editedPrompt === undefined) {
				ctx.ui.notify("已取消", "info");
				return;
			}

			// Create new session with parent tracking. Use the replacement-session
			// context for post-switch UI work; the original ctx is stale after a
			// successful session replacement.
			const newSessionResult = await ctx.newSession({
				parentSession: currentSessionFile,
				withSession: async (replacementCtx) => {
					replacementCtx.ui.setEditorText(editedPrompt);
					replacementCtx.ui.notify("移交就绪。准备就绪后提交。", "info");
				},
			});

			if (newSessionResult.cancelled) {
				ctx.ui.notify("新会话已取消", "info");
			}
		},
	});
}
