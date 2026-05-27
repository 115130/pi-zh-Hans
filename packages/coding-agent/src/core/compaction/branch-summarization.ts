/**
 * 分支摘要，用于树导航。
 *
 * 当导航到会话树中的不同点时，生成离开分支的摘要，以便上下文不会丢失。
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import {
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../messages.ts";
import type { ReadonlySessionManager, SessionEntry } from "../session-manager.ts";
import { estimateTokens } from "./compaction.ts";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	type FileOperations,
	formatFileOperations,
	SUMMARIZATION_SYSTEM_PROMPT,
	serializeConversation,
} from "./utils.ts";

// ============================================================================
// 类型
// ============================================================================

export interface BranchSummaryResult {
	summary?: string;
	readFiles?: string[];
	modifiedFiles?: string[];
	aborted?: boolean;
	error?: string;
}

/** 存储在 BranchSummaryEntry.details 中用于文件跟踪的详细信息 */
export interface BranchSummaryDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export type { FileOperations } from "./utils.ts";

export interface BranchPreparation {
	/** 提取用于摘要的消息（按时间顺序） */
	messages: AgentMessage[];
	/** 从工具调用中提取的文件操作 */
	fileOps: FileOperations;
	/** 消息中的估计总 token 数 */
	totalTokens: number;
}

export interface CollectEntriesResult {
	/** 要摘要的条目（按时间顺序） */
	entries: SessionEntry[];
	/** 新旧位置之间的共同祖先（如果有） */
	commonAncestorId: string | null;
}

export interface GenerateBranchSummaryOptions {
	/** 用于摘要的模型 */
	model: Model<any>;
	/** 模型的 API 密钥 */
	apiKey: string;
	/** 模型的请求头 */
	headers?: Record<string, string>;
	/** 用于取消的中止信号 */
	signal: AbortSignal;
	/** 摘要的自定义指令（可选） */
	customInstructions?: string;
	/** 如果为 true，customInstructions 替换默认提示而非附加 */
	replaceInstructions?: boolean;
	/** 为提示和 LLM 响应保留的 token 数（默认 16384） */
	reserveTokens?: number;
}

// ============================================================================
// 条目收集
// ============================================================================

/**
 * 当从一个位置导航到另一个位置时收集需要摘要的条目。
 *
 * 从 oldLeafId 开始往回走，直到与 targetId 的共同祖先，沿途收集条目。
 * 不会在压缩边界停止 - 这些边界会被包含，其摘要成为上下文。
 *
 * @param session - 会话管理器（只读访问）
 * @param oldLeafId - 当前位置（从哪导航）
 * @param targetId - 目标位置（导航到哪）
 * @returns 要摘要的条目和共同祖先
 */
export function collectEntriesForBranchSummary(
	session: ReadonlySessionManager,
	oldLeafId: string | null,
	targetId: string,
): CollectEntriesResult {
	// 如果没有旧位置，则无需摘要
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}

	// 找到共同祖先（两条路径上最深的节点）
	const oldPath = new Set(session.getBranch(oldLeafId).map((e) => e.id));
	const targetPath = session.getBranch(targetId);

	// targetPath 是根优先的，所以反向迭代以找到最深的共同祖先
	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}

	// 从旧叶子节点往回收集条目直到共同祖先
	const entries: SessionEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = session.getEntry(current);
		if (!entry) break;
		entries.push(entry);
		current = entry.parentId;
	}

	// 反转以得到时间顺序
	entries.reverse();

	return { entries, commonAncestorId };
}

// ============================================================================
// 条目到消息转换
// ============================================================================

/**
 * 从会话条目中提取 AgentMessage。
 * 类似于 compaction.ts 中的 getMessageFromEntry，但也处理压缩条目。
 */
function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
	switch (entry.type) {
		case "message":
			// 跳过工具结果 - 上下文在助手的工具调用中
			if (entry.message.role === "toolResult") return undefined;
			return entry.message;

		case "custom_message":
			return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);

		case "branch_summary":
			return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);

		case "compaction":
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);

		// 这些不会对会话内容有贡献
		case "thinking_level_change":
		case "model_change":
		case "custom":
		case "label":
		case "session_info":
			return undefined;
	}
}

/**
 * 准备用于摘要的条目，并考虑 token 预算。
 *
 * 从 NEWEST 到 OLDEST 遍历条目，添加消息直到达到 token 预算。
 * 这确保当分支太长时，我们保留最近的上下文。
 *
 * 同时还从以下来源收集文件操作：
 * - 助手消息中的工具调用
 * - 现有 branch_summary 条目的 details（用于累积跟踪）
 *
 * @param entries - 按时间顺序的条目
 * @param tokenBudget - 包含的最大 token 数（0 = 无限制）
 */
export function prepareBranchEntries(entries: SessionEntry[], tokenBudget: number = 0): BranchPreparation {
	const messages: AgentMessage[] = [];
	const fileOps = createFileOps();
	let totalTokens = 0;

	// 第一遍：从所有条目中收集文件操作（即使它们不适合 token 预算）
	// 这确保我们从嵌套分支摘要中捕获累积的文件跟踪
	// 仅从 pi 生成的摘要（fromHook !== true）中提取，而不是扩展生成的
	for (const entry of entries) {
		if (entry.type === "branch_summary" && !entry.fromHook && entry.details) {
			const details = entry.details as BranchSummaryDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				// 修改过的文件同时添加到 edited 和 written 中，以便正确去重
				for (const f of details.modifiedFiles) {
					fileOps.edited.add(f);
				}
			}
		}
	}

	// 第二遍：从最新到最旧遍历，添加消息直到 token 预算
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const message = getMessageFromEntry(entry);
		if (!message) continue;

		// 从助手消息（工具调用）中提取文件操作
		extractFileOpsFromMessage(message, fileOps);

		const tokens = estimateTokens(message);

		// 在添加之前检查预算
		if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
			// 如果这是摘要条目，则尝试无论如何将其放入，因为它是重要的上下文
			if (entry.type === "compaction" || entry.type === "branch_summary") {
				if (totalTokens < tokenBudget * 0.9) {
					messages.unshift(message);
					totalTokens += tokens;
				}
			}
			// 停止 - 已达到预算
			break;
		}

		messages.unshift(message);
		totalTokens += tokens;
	}

	return { messages, fileOps, totalTokens };
}

// ============================================================================
// 摘要生成
// ============================================================================

const BRANCH_SUMMARY_PREAMBLE = `用户之前探索了另一个对话分支，然后返回了这里。
该探索的摘要：

`;

const BRANCH_SUMMARY_PROMPT = `为此对话分支创建一个结构化的摘要，以便以后返回时提供上下文。

请使用以下精确格式：

## 目标
[用户在此分支中试图完成什么？]

## 约束与偏好
- [提到的任何约束、偏好或要求]
- [如果没有提到，则写"(无)"]

## 进展
### 已完成
- [x] [已完成的任务/更改]

### 进行中
- [ ] [已开始但未完成的工作]

### 受阻
- [阻碍进展的问题，如果有的话]

## 关键决策
- **[决策]**：[简要理由]

## 下一步
1. [接下来应该做什么才能继续这项工作]

保持每个部分简洁。保留确切的文件路径、函数名和错误消息。`;

/**
 * 生成废弃分支条目的摘要。
 *
 * @param entries - 要摘要的会话条目（时间顺序）
 * @param options - 生成选项
 */
export async function generateBranchSummary(
	entries: SessionEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<BranchSummaryResult> {
	const { model, apiKey, headers, signal, customInstructions, replaceInstructions, reserveTokens = 16384 } = options;

	// token 预算 = 上下文窗口减去为提示和响应保留的空间
	const contextWindow = model.contextWindow || 128000;
	const tokenBudget = contextWindow - reserveTokens;

	const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget);

	if (messages.length === 0) {
		return { summary: "没有需要摘要的内容" };
	}

	// 转换为 LLM 兼容的消息，然后序列化为文本
	// 序列化防止模型将其视为要继续的对话
	const llmMessages = convertToLlm(messages);
	const conversationText = serializeConversation(llmMessages);

	// 构建提示
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

	// 调用 LLM 进行摘要
	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		{ apiKey, headers, signal, maxTokens: 2048 },
	);

	// 检查是否中止或出错
	if (response.stopReason === "aborted") {
		return { aborted: true };
	}
	if (response.stopReason === "error") {
		return { error: response.errorMessage || "摘要失败" };
	}

	let summary = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	// 添加前言以为分支摘要提供上下文
	summary = BRANCH_SUMMARY_PREAMBLE + summary;

	// 计算文件列表并附加到摘要
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return {
		summary: summary || "未生成摘要",
		readFiles,
		modifiedFiles,
	};
}
