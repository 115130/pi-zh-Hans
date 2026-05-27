/**
 * 长会话的上下文压缩。
 *
 * 纯函数实现压缩逻辑。会话管理器负责 I/O，
 * 压缩后重新加载会话。
 */

import type { AgentMessage, StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Context, Model, SimpleStreamOptions, Usage } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import {
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../messages.ts";
import { buildSessionContext, type CompactionEntry, type SessionEntry } from "../session-manager.ts";
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
// 文件操作跟踪
// ============================================================================

/** 存储在 CompactionEntry.details 中用于文件跟踪的详细信息 */
export interface CompactionDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

/**
 * 从消息和之前的压缩条目中提取文件操作。
 */
function extractFileOperations(
	messages: AgentMessage[],
	entries: SessionEntry[],
	prevCompactionIndex: number,
): FileOperations {
	const fileOps = createFileOps();

	// 从上一个压缩的详细信息中收集（如果是 pi 生成的）
	if (prevCompactionIndex >= 0) {
		const prevCompaction = entries[prevCompactionIndex] as CompactionEntry;
		if (!prevCompaction.fromHook && prevCompaction.details) {
			// fromHook 字段保留用于会话文件兼容性
			const details = prevCompaction.details as CompactionDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				for (const f of details.modifiedFiles) fileOps.edited.add(f);
			}
		}
	}

	// 从消息中的工具调用中提取
	for (const msg of messages) {
		extractFileOpsFromMessage(msg, fileOps);
	}

	return fileOps;
}

// ============================================================================
// 消息提取
// ============================================================================

/**
 * 如果一个条目能产生 AgentMessage，则从中提取。
 * 对于不贡献给 LLM 上下文的条目返回 undefined。
 */
function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "custom_message") {
		return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);
	}
	if (entry.type === "branch_summary") {
		return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);
	}
	if (entry.type === "compaction") {
		return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
	}
	return undefined;
}

function getMessageFromEntryForCompaction(entry: SessionEntry): AgentMessage | undefined {
	if (entry.type === "compaction") {
		return undefined;
	}
	return getMessageFromEntry(entry);
}

/** compact() 的结果 - SessionManager 在保存时会添加 uuid/parentUuid */
export interface CompactionResult<T = unknown> {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	/** 扩展特定数据（例如 ArtifactIndex、结构化压缩的版本标记） */
	details?: T;
}

// ============================================================================
// 类型
// ============================================================================

export interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

// ============================================================================
// Token 计算
// ============================================================================

/**
 * 从 usage 计算总上下文 token。
 * 优先使用本地的 totalTokens 字段，如果没有则从各组件计算。
 */
export function calculateContextTokens(usage: Usage): number {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

/**
 * 如果可用则从助理消息中获取 usage。
 * 跳过已中止和错误消息，因为它们没有有效的 usage 数据。
 */
function getAssistantUsage(msg: AgentMessage): Usage | undefined {
	if (msg.role === "assistant" && "usage" in msg) {
		const assistantMsg = msg as AssistantMessage;
		if (assistantMsg.stopReason !== "aborted" && assistantMsg.stopReason !== "error" && assistantMsg.usage) {
			return assistantMsg.usage;
		}
	}
	return undefined;
}

/**
 * 从会话条目中找到最后一个非中止的助理消息 usage。
 */
export function getLastAssistantUsage(entries: SessionEntry[]): Usage | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "message") {
			const usage = getAssistantUsage(entry.message);
			if (usage) return usage;
		}
	}
	return undefined;
}

export interface ContextUsageEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
}

function getLastAssistantUsageInfo(messages: AgentMessage[]): { usage: Usage; index: number } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const usage = getAssistantUsage(messages[i]);
		if (usage) return { usage, index: i };
	}
	return undefined;
}

/**
 * 从消息估算上下文 token，优先使用最后一个助理消息的 usage。
 * 如果最后一个 usage 之后还有消息，则用 estimateTokens 估算它们的 token。
 */
export function estimateContextTokens(messages: AgentMessage[]): ContextUsageEstimate {
	const usageInfo = getLastAssistantUsageInfo(messages);

	if (!usageInfo) {
		let estimated = 0;
		for (const message of messages) {
			estimated += estimateTokens(message);
		}
		return {
			tokens: estimated,
			usageTokens: 0,
			trailingTokens: estimated,
			lastUsageIndex: null,
		};
	}

	const usageTokens = calculateContextTokens(usageInfo.usage);
	let trailingTokens = 0;
	for (let i = usageInfo.index + 1; i < messages.length; i++) {
		trailingTokens += estimateTokens(messages[i]);
	}

	return {
		tokens: usageTokens + trailingTokens,
		usageTokens,
		trailingTokens,
		lastUsageIndex: usageInfo.index,
	};
}

/**
 * 检查是否应基于上下文使用量触发压缩。
 */
export function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
	if (!settings.enabled) return false;
	return contextTokens > contextWindow - settings.reserveTokens;
}

// ============================================================================
// 切割点检测
// ============================================================================

const ESTIMATED_IMAGE_CHARS = 4800;

function estimateTextAndImageContentChars(content: string | Array<{ type: string; text?: string }>): number {
	if (typeof content === "string") {
		return content.length;
	}

	let chars = 0;
	for (const block of content) {
		if (block.type === "text" && block.text) {
			chars += block.text.length;
		} else if (block.type === "image") {
			chars += ESTIMATED_IMAGE_CHARS;
		}
	}
	return chars;
}

/**
 * 使用 chars/4 启发式方法估算消息的 token 数量。
 * 这是保守估算（高估 token 数）。
 */
export function estimateTokens(message: AgentMessage): number {
	let chars = 0;

	switch (message.role) {
		case "user": {
			chars = estimateTextAndImageContentChars(
				(message as { content: string | Array<{ type: string; text?: string }> }).content,
			);
			return Math.ceil(chars / 4);
		}
		case "assistant": {
			const assistant = message as AssistantMessage;
			for (const block of assistant.content) {
				if (block.type === "text") {
					chars += block.text.length;
				} else if (block.type === "thinking") {
					chars += block.thinking.length;
				} else if (block.type === "toolCall") {
					chars += block.name.length + JSON.stringify(block.arguments).length;
				}
			}
			return Math.ceil(chars / 4);
		}
		case "custom":
		case "toolResult": {
			chars = estimateTextAndImageContentChars(message.content);
			return Math.ceil(chars / 4);
		}
		case "bashExecution": {
			chars = message.command.length + message.output.length;
			return Math.ceil(chars / 4);
		}
		case "branchSummary":
		case "compactionSummary": {
			chars = message.summary.length;
			return Math.ceil(chars / 4);
		}
	}

	return 0;
}

/**
 * 查找有效的切割点：user、assistant、custom 或 bashExecution 消息的索引。
 * 绝不在 tool result 处切割（它们必须跟在工具调用之后）。
 * 如果在带工具调用的 assistant 消息处切割，其工具结果会跟在后面并保留。
 * BashExecutionMessage 被视为用户消息（用户启动的上下文）。
 */
function findValidCutPoints(entries: SessionEntry[], startIndex: number, endIndex: number): number[] {
	const cutPoints: number[] = [];
	for (let i = startIndex; i < endIndex; i++) {
		const entry = entries[i];
		switch (entry.type) {
			case "message": {
				const role = entry.message.role;
				switch (role) {
					case "bashExecution":
					case "custom":
					case "branchSummary":
					case "compactionSummary":
					case "user":
					case "assistant":
						cutPoints.push(i);
						break;
					case "toolResult":
						break;
				}
				break;
			}
			case "thinking_level_change":
			case "model_change":
			case "compaction":
			case "branch_summary":
			case "custom":
			case "custom_message":
			case "label":
			case "session_info":
				break;
		}

		// branch_summary 和 custom_message 是用户角色的消息，是有效的切割点
		if (entry.type === "branch_summary" || entry.type === "custom_message") {
			cutPoints.push(i);
		}
	}
	return cutPoints;
}

/**
 * 找到包含给定条目索引的回合开始的用户消息（或 bashExecution）。
 * 如果在索引前没有找到回合开始，返回 -1。
 * BashExecutionMessage 被视为用户消息以确定回合边界。
 */
export function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, startIndex: number): number {
	for (let i = entryIndex; i >= startIndex; i--) {
		const entry = entries[i];
		// branch_summary 和 custom_message 是用户角色的消息，可以开始一个回合
		if (entry.type === "branch_summary" || entry.type === "custom_message") {
			return i;
		}
		if (entry.type === "message") {
			const role = entry.message.role;
			if (role === "user" || role === "bashExecution") {
				return i;
			}
		}
	}
	return -1;
}

export interface CutPointResult {
	/** 要保留的第一个条目的索引 */
	firstKeptEntryIndex: number;
	/** 被分割回合的用户消息索引，如果没有分割则为 -1 */
	turnStartIndex: number;
	/** 此切割是否分割了一个回合（切割点不是用户消息） */
	isSplitTurn: boolean;
}

/**
 * 在会话条目中找到切割点，保留大约 `keepRecentTokens` 个 token。
 *
 * 算法：从最新的消息向后遍历，累加估算的消息大小。
 * 当累加 >= keepRecentTokens 时停止。在该点切割。
 *
 * 可以在用户或助理消息处切割（永远不在 tool result 处）。当在带工具调用的助理消息处切割时，
 * 其工具结果在后面，会被保留。
 *
 * 返回 CutPointResult：
 * - firstKeptEntryIndex：开始保留的条目索引
 * - turnStartIndex：如果在回合中间切割，该回合开始的用户消息索引
 * - isSplitTurn：是否在回合中间切割
 *
 * 只考虑 `startIndex` 和 `endIndex`（不包含）之间的条目。
 */
export function findCutPoint(
	entries: SessionEntry[],
	startIndex: number,
	endIndex: number,
	keepRecentTokens: number,
): CutPointResult {
	const cutPoints = findValidCutPoints(entries, startIndex, endIndex);

	if (cutPoints.length === 0) {
		return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
	}

	// 从最新的向后遍历，累加估算的消息大小
	let accumulatedTokens = 0;
	let cutIndex = cutPoints[0]; // 默认：从第一条消息开始保留（不是头部）

	for (let i = endIndex - 1; i >= startIndex; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;

		// 估算此消息的大小
		const messageTokens = estimateTokens(entry.message);
		accumulatedTokens += messageTokens;

		// 检查是否超出预算
		if (accumulatedTokens >= keepRecentTokens) {
			// 找到在此条目或之后最近的有效切割点
			for (let c = 0; c < cutPoints.length; c++) {
				if (cutPoints[c] >= i) {
					cutIndex = cutPoints[c];
					break;
				}
			}
			break;
		}
	}

	// 从 cutIndex 向后扫描，包含任何非消息条目（bash、设置等）
	while (cutIndex > startIndex) {
		const prevEntry = entries[cutIndex - 1];
		// 在会话头部或压缩边界处停止
		if (prevEntry.type === "compaction") {
			break;
		}
		if (prevEntry.type === "message") {
			// 如果遇到任何消息就停止
			break;
		}
		// 包含此非消息条目（bash、设置更改等）
		cutIndex--;
	}

	// 判断是否是分割回合
	const cutEntry = entries[cutIndex];
	const isUserMessage = cutEntry.type === "message" && cutEntry.message.role === "user";
	const turnStartIndex = isUserMessage ? -1 : findTurnStartIndex(entries, cutIndex, startIndex);

	return {
		firstKeptEntryIndex: cutIndex,
		turnStartIndex,
		isSplitTurn: !isUserMessage && turnStartIndex !== -1,
	};
}

// ============================================================================
// 摘要生成
// ============================================================================

const SUMMARIZATION_PROMPT = `上面的消息是一个需要总结的对话。创建一个结构化的上下文检查点摘要，供另一个 LLM 继续工作。

请使用以下精确格式：

## 目标
[用户试图完成什么目标？如果会话涵盖不同任务，可以有多项。]

## 约束与偏好
- [用户提到的任何约束、偏好或要求]
- [如果没有提到则写"(无)"]

## 进度
### 已完成
- [x] [已完成的任务/更改]

### 进行中
- [ ] [当前工作]

### 受阻
- [阻碍进度的任何问题，如果有的话]

## 关键决策
- **[决策]**：**[简要理由]**

## 下一步
1. [接下来应发生的有序列表]

## 关键上下文
- [任何需要继续的数据、示例或引用]
- [如果不适用则写"(无)"]

保持每个部分简洁。保留确切的文件路径、函数名称和错误消息。`;

const UPDATE_SUMMARIZATION_PROMPT = `上面的消息是新的对话消息，需要整合到 <previous-summary> 标签中提供的现有摘要中。

用新信息更新现有的结构化摘要。规则：
- 保留之前摘要中的所有现有信息
- 添加新消息中的新进度、决策和上下文
- 更新"进度"部分：将"进行中"的项目在完成后移动到"已完成"
- 根据完成情况更新"下一步"
- 保留确切的文件路径、函数名称和错误消息
- 如果某些内容不再相关，可以移除

请使用以下精确格式：

## 目标
[保留现有目标，如果任务扩展则添加新的]

## 约束与偏好
- [保留现有的，添加新发现的]

## 进度
### 已完成
- [x] [包括之前完成的项目和新完成的项目]

### 进行中
- [ ] [当前工作 - 根据进度更新]

### 受阻
- [当前阻塞项 - 如果已解决则移除]

## 关键决策
- **[决策]**：**[简要理由]**（保留所有之前的，添加新的）

## 下一步
1. [根据当前状态更新]

## 关键上下文
- [保留重要上下文，必要时添加新的]

保持每个部分简洁。保留确切的文件路径、函数名称和错误消息。`;

function createSummarizationOptions(
	model: Model<any>,
	maxTokens: number,
	apiKey: string | undefined,
	headers: Record<string, string> | undefined,
	signal: AbortSignal | undefined,
	thinkingLevel: ThinkingLevel | undefined,
): SimpleStreamOptions {
	const options: SimpleStreamOptions = { maxTokens, signal, apiKey, headers };
	if (model.reasoning && thinkingLevel && thinkingLevel !== "off") {
		options.reasoning = thinkingLevel;
	}
	return options;
}

async function completeSummarization(
	model: Model<any>,
	context: Context,
	options: SimpleStreamOptions,
	streamFn?: StreamFn,
): Promise<AssistantMessage> {
	if (!streamFn) {
		return completeSimple(model, context, options);
	}
	const stream = await streamFn(model, context, options);
	return stream.result();
}

/**
 * 使用 LLM 生成对话摘要。
 * 如果提供了 previousSummary，则使用更新提示进行合并。
 */
export async function generateSummary(
	currentMessages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string | undefined,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	customInstructions?: string,
	previousSummary?: string,
	thinkingLevel?: ThinkingLevel,
	streamFn?: StreamFn,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.8 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);

	// 如果有之前的摘要则使用更新提示，否则使用初始提示
	let basePrompt = previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
	if (customInstructions) {
		basePrompt = `${basePrompt}\n\n额外关注：${customInstructions}`;
	}

	// 将对话序列化为文本，以便模型不尝试继续它
	// 先转换为 LLM 消息（处理 bashExecution、custom 等自定义类型）
	const llmMessages = convertToLlm(currentMessages);
	const conversationText = serializeConversation(llmMessages);

	// 构建包含在标签中的对话提示
	let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
	if (previousSummary) {
		promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
	}
	promptText += basePrompt;

	const summarizationMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];

	const completionOptions = createSummarizationOptions(model, maxTokens, apiKey, headers, signal, thinkingLevel);

	const response = await completeSummarization(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		completionOptions,
		streamFn,
	);

	if (response.stopReason === "error") {
		throw new Error(`摘要生成失败: ${response.errorMessage || "未知错误"}`);
	}

	const textContent = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	return textContent;
}

// ============================================================================
// 压缩准备（供扩展使用）
// ============================================================================

export interface CompactionPreparation {
	/** 要保留的第一个条目的 UUID */
	firstKeptEntryId: string;
	/** 将摘要并丢弃的消息 */
	messagesToSummarize: AgentMessage[];
	/** 将转换为回合前缀摘要的消息（如果分割回合） */
	turnPrefixMessages: AgentMessage[];
	/** 是否分割了回合（在回合中间切割） */
	isSplitTurn: boolean;
	tokensBefore: number;
	/** 上一个压缩的摘要，用于增量更新 */
	previousSummary?: string;
	/** 从 messagesToSummarize 中提取的文件操作 */
	fileOps: FileOperations;
	/** 来自 settings.jsonl 的压缩设置 */
	settings: CompactionSettings;
}

export function prepareCompaction(
	pathEntries: SessionEntry[],
	settings: CompactionSettings,
): CompactionPreparation | undefined {
	if (pathEntries.length > 0 && pathEntries[pathEntries.length - 1].type === "compaction") {
		return undefined;
	}

	let prevCompactionIndex = -1;
	for (let i = pathEntries.length - 1; i >= 0; i--) {
		if (pathEntries[i].type === "compaction") {
			prevCompactionIndex = i;
			break;
		}
	}

	let previousSummary: string | undefined;
	let boundaryStart = 0;
	if (prevCompactionIndex >= 0) {
		const prevCompaction = pathEntries[prevCompactionIndex] as CompactionEntry;
		previousSummary = prevCompaction.summary;
		const firstKeptEntryIndex = pathEntries.findIndex((entry) => entry.id === prevCompaction.firstKeptEntryId);
		boundaryStart = firstKeptEntryIndex >= 0 ? firstKeptEntryIndex : prevCompactionIndex + 1;
	}
	const boundaryEnd = pathEntries.length;

	const tokensBefore = estimateContextTokens(buildSessionContext(pathEntries).messages).tokens;

	const cutPoint = findCutPoint(pathEntries, boundaryStart, boundaryEnd, settings.keepRecentTokens);

	// 获取第一个保留条目的 UUID
	const firstKeptEntry = pathEntries[cutPoint.firstKeptEntryIndex];
	if (!firstKeptEntry?.id) {
		return undefined; // 会话需要迁移
	}
	const firstKeptEntryId = firstKeptEntry.id;

	const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;

	// 要摘要的消息（摘要后将丢弃）
	const messagesToSummarize: AgentMessage[] = [];
	for (let i = boundaryStart; i < historyEnd; i++) {
		const msg = getMessageFromEntryForCompaction(pathEntries[i]);
		if (msg) messagesToSummarize.push(msg);
	}

	// 用于回合前缀摘要的消息（如果分割回合）
	const turnPrefixMessages: AgentMessage[] = [];
	if (cutPoint.isSplitTurn) {
		for (let i = cutPoint.turnStartIndex; i < cutPoint.firstKeptEntryIndex; i++) {
			const msg = getMessageFromEntryForCompaction(pathEntries[i]);
			if (msg) turnPrefixMessages.push(msg);
		}
	}

	// 从消息和之前的压缩中提取文件操作
	const fileOps = extractFileOperations(messagesToSummarize, pathEntries, prevCompactionIndex);

	// 如果分割回合，也从回合前缀提取文件操作
	if (cutPoint.isSplitTurn) {
		for (const msg of turnPrefixMessages) {
			extractFileOpsFromMessage(msg, fileOps);
		}
	}

	return {
		firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn: cutPoint.isSplitTurn,
		tokensBefore,
		previousSummary,
		fileOps,
		settings,
	};
}

// ============================================================================
// 主压缩函数
// ============================================================================

const TURN_PREFIX_SUMMARIZATION_PROMPT = `这是一个回合的前缀，因为太大而无法保留。后缀（最近的工作）被保留。

总结前缀为保留的后缀提供上下文：

## 原始请求
[用户在此回合中要求了什么？]

## 早期进度
- [前缀中的关键决策和已完成工作]

## 后缀所需上下文
- [理解保留的最近工作所需的信息]

保持简洁。专注于理解保留的后缀所需的信息。`;

/**
 * 使用准备好的数据为压缩生成摘要。
 * 返回 CompactionResult - SessionManager 在保存时会添加 uuid/parentUuid。
 *
 * @param preparation - 来自 prepareCompaction() 的预先计算准备
 * @param customInstructions - 摘要的可选额外关注点
 */
export async function compact(
	preparation: CompactionPreparation,
	model: Model<any>,
	apiKey: string | undefined,
	headers?: Record<string, string>,
	customInstructions?: string,
	signal?: AbortSignal,
	thinkingLevel?: ThinkingLevel,
	streamFn?: StreamFn,
): Promise<CompactionResult> {
	const {
		firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn,
		tokensBefore,
		previousSummary,
		fileOps,
		settings,
	} = preparation;

	// 生成摘要（如果需要可并行生成）然后合并
	let summary: string;

	if (isSplitTurn && turnPrefixMessages.length > 0) {
		// 并行生成两个摘要
		const [historyResult, turnPrefixResult] = await Promise.all([
			messagesToSummarize.length > 0
				? generateSummary(
						messagesToSummarize,
						model,
						settings.reserveTokens,
						apiKey,
						headers,
						signal,
						customInstructions,
						previousSummary,
						thinkingLevel,
						streamFn,
					)
				: Promise.resolve("无先前历史。"),
			generateTurnPrefixSummary(
				turnPrefixMessages,
				model,
				settings.reserveTokens,
				apiKey,
				headers,
				signal,
				thinkingLevel,
				streamFn,
			),
		]);
		// 合并为单个摘要
		summary = `${historyResult}\n\n---\n\n**回合上下文（分割回合）：**\n\n${turnPrefixResult}`;
	} else {
		// 只生成历史摘要
		summary = await generateSummary(
			messagesToSummarize,
			model,
			settings.reserveTokens,
			apiKey,
			headers,
			signal,
			customInstructions,
			previousSummary,
			thinkingLevel,
			streamFn,
		);
	}

	// 计算文件列表并附加到摘要
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	if (!firstKeptEntryId) {
		throw new Error("保留的第一个条目没有 UUID - 会话可能需要迁移");
	}

	return {
		summary,
		firstKeptEntryId,
		tokensBefore,
		details: { readFiles, modifiedFiles } as CompactionDetails,
	};
}

/**
 * 为回合前缀生成摘要（当分割回合时）。
 */
async function generateTurnPrefixSummary(
	messages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string | undefined,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	thinkingLevel?: ThinkingLevel,
	streamFn?: StreamFn,
): Promise<string> {
	const maxTokens = Math.min(
		Math.floor(0.5 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	); // 回合前缀预算较小
	const llmMessages = convertToLlm(messages);
	const conversationText = serializeConversation(llmMessages);
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${TURN_PREFIX_SUMMARIZATION_PROMPT}`;
	const summarizationMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];

	const response = await completeSummarization(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		createSummarizationOptions(model, maxTokens, apiKey, headers, signal, thinkingLevel),
		streamFn,
	);

	if (response.stopReason === "error") {
		throw new Error(`轮次前缀摘要生成失败: ${response.errorMessage || "未知错误"}`);
	}

	return response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}
