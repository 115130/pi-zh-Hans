import type { Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import type { AgentMessage } from "../../types.ts";
import {
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../messages.ts";
import type { BranchSummaryResult, Session, SessionTreeEntry } from "../types.ts";
import { BranchSummaryError, err, ok, type Result, SessionError } from "../types.ts";
import { estimateTokens, SUMMARIZATION_SYSTEM_PROMPT } from "./compaction.ts";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	type FileOperations,
	formatFileOperations,
	serializeConversation,
} from "./utils.ts";

/** File-operation details stored on generated branch summary entries. */
export interface BranchSummaryDetails {
	/** Files read while exploring the summarized branch. */
	readFiles: string[];
	/** Files modified while exploring the summarized branch. */
	modifiedFiles: string[];
}

export type { FileOperations } from "./utils.ts";

/** Prepared branch content for summarization. */
export interface BranchPreparation {
	/** Messages selected for the branch summary. */
	messages: AgentMessage[];
	/** File operations extracted from the branch. */
	fileOps: FileOperations;
	/** Estimated token count for selected messages. */
	totalTokens: number;
}

/** Entries selected for branch summarization. */
export interface CollectEntriesResult {
	/** Entries to summarize in chronological order. */
	entries: SessionTreeEntry[];
	/** Deepest common ancestor between the previous leaf and target entry. */
	commonAncestorId: string | null;
}

/** Options for generating a branch summary. */
export interface GenerateBranchSummaryOptions {
	/** Model used for summarization. */
	model: Model<any>;
	/** API key forwarded to the provider. */
	apiKey: string;
	/** Optional request headers forwarded to the provider. */
	headers?: Record<string, string>;
	/** Abort signal for the summarization request. */
	signal: AbortSignal;
	/** Optional instructions appended to or replacing the default prompt. */
	customInstructions?: string;
	/** Replace the default prompt with custom instructions instead of appending them. */
	replaceInstructions?: boolean;
	/** Tokens reserved for prompt and model output. Defaults to 16384. */
	reserveTokens?: number;
}

/** Collect entries that should be summarized before navigating to a different session tree entry. */
export async function collectEntriesForBranchSummary(
	session: Session,
	oldLeafId: string | null,
	targetId: string,
): Promise<CollectEntriesResult> {
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}
	const oldPath = new Set((await session.getBranch(oldLeafId)).map((e) => e.id));
	const targetPath = await session.getBranch(targetId);
	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}
	const entries: SessionTreeEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = await session.getEntry(current);
		if (!entry) throw new SessionError("invalid_session", `条目 ${current} 未找到`);
		entries.push(entry as SessionTreeEntry);
		current = entry.parentId;
	}
	entries.reverse();

	return { entries, commonAncestorId };
}
function getMessageFromEntry(entry: SessionTreeEntry): AgentMessage | undefined {
	switch (entry.type) {
		case "message":
			if (entry.message.role === "toolResult") return undefined;
			return entry.message;

		case "custom_message":
			return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);

		case "branch_summary":
			return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);

		case "compaction":
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
		case "thinking_level_change":
		case "model_change":
		case "active_tools_change":
		case "custom":
		case "label":
		case "session_info":
		case "leaf":
			return undefined;
	}
}

/** Prepare branch entries for summarization within an optional token budget. */
export function prepareBranchEntries(entries: SessionTreeEntry[], tokenBudget: number = 0): BranchPreparation {
	const messages: AgentMessage[] = [];
	const fileOps = createFileOps();
	let totalTokens = 0;
	for (const entry of entries) {
		if (entry.type === "branch_summary" && !entry.fromHook && entry.details) {
			const details = entry.details as BranchSummaryDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				for (const f of details.modifiedFiles) {
					fileOps.edited.add(f);
				}
			}
		}
	}
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const message = getMessageFromEntry(entry);
		if (!message) continue;
		extractFileOpsFromMessage(message, fileOps);

		const tokens = estimateTokens(message);
		if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
			if (entry.type === "compaction" || entry.type === "branch_summary") {
				if (totalTokens < tokenBudget * 0.9) {
					messages.unshift(message);
					totalTokens += tokens;
				}
			}
			break;
		}

		messages.unshift(message);
		totalTokens += tokens;
	}

	return { messages, fileOps, totalTokens };
}

const BRANCH_SUMMARY_PREAMBLE = `用户在返回此处之前探索了一个不同的对话分支。
该探索的总结：

`;

const BRANCH_SUMMARY_PROMPT = `创建一个此对话分支的结构化总结，以便稍后返回时提供上下文。

使用以下精确格式：

## 目标
[用户在此分支中试图完成什么？]

## 约束与偏好
- [提到的任何约束、偏好或要求]
- [如果没有提到，使用"(无)"]

## 进度
### 已完成
- [x] [已完成的任务/更改]

### 进行中
- [ ] [已开始但未完成的工作]

### 受阻
- [阻止进度的问题（如果有）]

## 关键决策
- **[决策]**：[简要理由]

## 下一步
1. [接下来应该做什么以继续此工作]

保持每个部分简洁。保留精确的文件路径、函数名和错误消息。`;

/** Generate a summary for abandoned branch entries. */
export async function generateBranchSummary(
	entries: SessionTreeEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<Result<BranchSummaryResult, BranchSummaryError>> {
	const { model, apiKey, headers, signal, customInstructions, replaceInstructions, reserveTokens = 16384 } = options;
	const contextWindow = model.contextWindow || 128000;
	const tokenBudget = contextWindow - reserveTokens;

	const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget);

	if (messages.length === 0) {
		return ok({ summary: "无内容可总结", readFiles: [], modifiedFiles: [] });
	}
	const llmMessages = convertToLlm(messages);
	const conversationText = serializeConversation(llmMessages);
	let instructions: string;
	if (replaceInstructions && customInstructions) {
		instructions = customInstructions;
	} else if (customInstructions) {
		instructions = `${BRANCH_SUMMARY_PROMPT}\n\n额外关注：${customInstructions}`;
	} else {
		instructions = BRANCH_SUMMARY_PROMPT;
	}
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${instructions}`;

	const summarizationMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];
	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		{ apiKey, headers, signal, maxTokens: 2048 },
	);
	if (response.stopReason === "aborted") {
		return err(new BranchSummaryError("aborted", response.errorMessage || "分支总结已中止"));
	}
	if (response.stopReason === "error") {
		return err(
			new BranchSummaryError("summarization_failed", `分支总结失败：${response.errorMessage || "未知错误"}`),
		);
	}

	let summary = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
	summary = BRANCH_SUMMARY_PREAMBLE + summary;
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return ok({
		summary: summary || "未生成总结",
		readFiles,
		modifiedFiles,
	});
}
