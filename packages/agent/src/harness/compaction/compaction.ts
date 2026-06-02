import type { AssistantMessage, ImageContent, Model, TextContent, Usage } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import type { AgentMessage, ThinkingLevel } from "../../types.ts";
import {
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../messages.ts";
import { buildSessionContext } from "../session/session.ts";
import { type CompactionEntry, CompactionError, err, ok, type Result, type SessionTreeEntry } from "../types.ts";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	type FileOperations,
	formatFileOperations,
	serializeConversation,
} from "./utils.ts";

/** 压缩条目上存储的文件操作细节。 */
export interface CompactionDetails {
	/** 压缩历史中读取的文件。 */
	readFiles: string[];
	/** 压缩历史中修改的文件。 */
	modifiedFiles: string[];
}
function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		return "[unserializable]";
	}
}

function extractFileOperations(
	messages: AgentMessage[],
	entries: SessionTreeEntry[],
	prevCompactionIndex: number,
): FileOperations {
	const fileOps = createFileOps();
	if (prevCompactionIndex >= 0) {
		const prevCompaction = entries[prevCompactionIndex] as CompactionEntry;
		if (!prevCompaction.fromHook && prevCompaction.details) {
			const details = prevCompaction.details as CompactionDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				for (const f of details.modifiedFiles) fileOps.edited.add(f);
			}
		}
	}
	for (const msg of messages) {
		extractFileOpsFromMessage(msg, fileOps);
	}

	return fileOps;
}
function getMessageFromEntry(entry: SessionTreeEntry): AgentMessage | undefined {
	if (entry.type === "message") {
		return entry.message as AgentMessage;
	}
	if (entry.type === "custom_message") {
		return createCustomMessage(
			entry.customType,
			entry.content as string | (TextContent | ImageContent)[],
			entry.display,
			entry.details,
			entry.timestamp,
		);
	}
	if (entry.type === "branch_summary") {
		return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);
	}
	if (entry.type === "compaction") {
		return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
	}
	return undefined;
}

function getMessageFromEntryForCompaction(entry: SessionTreeEntry): AgentMessage | undefined {
	if (entry.type === "compaction") {
		return undefined;
	}
	return getMessageFromEntry(entry);
}

/** 生成的压缩数据，准备持久化为一个压缩条目。 */
export interface CompactionResult<T = unknown> {
	/** 替换压缩历史在将来上下文中使用的摘要文本。 */
	summary: string;
	/** 保留历史开始处的条目ID。 */
	firstKeptEntryId: string;
	/** 压缩前的估计上下文令牌数。 */
	tokensBefore: number;
	/** 可选的实现特定细节，与压缩条目一起存储。 */
	details?: T;
}

/** 压缩阈值和保留设置。 */
export interface CompactionSettings {
	/** 启用自动压缩决策。 */
	enabled: boolean;
	/** 为摘要提示和输出预留的令牌数。 */
	reserveTokens: number;
	/** 压缩后保留的近似最近上下文令牌数。 */
	keepRecentTokens: number;
}

/** 测试框架使用的默认压缩设置。 */
export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

/** 根据提供者的使用情况计算总上下文令牌数。 */
export function calculateContextTokens(usage: Usage): number {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
function getAssistantUsage(msg: AgentMessage): Usage | undefined {
	if (msg.role === "assistant" && "usage" in msg) {
		const assistantMsg = msg as AssistantMessage;
		if (assistantMsg.stopReason !== "aborted" && assistantMsg.stopReason !== "error" && assistantMsg.usage) {
			return assistantMsg.usage;
		}
	}
	return undefined;
}

/** 从会话条目中返回最后一个成功的助手消息的使用情况。 */
export function getLastAssistantUsage(entries: SessionTreeEntry[]): Usage | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "message") {
			const usage = getAssistantUsage(entry.message as AgentMessage);
			if (usage) return usage;
		}
	}
	return undefined;
}

/** 消息列表的估计上下文令牌使用情况。 */
export interface ContextUsageEstimate {
	/** 估计的总上下文令牌数。 */
	tokens: number;
	/** 最近的助手使用块报告的令牌数。 */
	usageTokens: number;
	/** 最近的助手使用块之后的估计令牌数。 */
	trailingTokens: number;
	/** 提供使用情况的消息索引，不存在时为null。 */
	lastUsageIndex: number | null;
}

function getLastAssistantUsageInfo(messages: AgentMessage[]): { usage: Usage; index: number } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const usage = getAssistantUsage(messages[i]);
		if (usage) return { usage, index: i };
	}
	return undefined;
}

/** 在使用可用时，使用提供者的使用情况估计消息的上下文令牌数。 */
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

/** 返回上下文使用是否超过配置的压缩阈值。 */
export function shouldCompact(contextTokens: number, contextWindow: number, settings: CompactionSettings): boolean {
	if (!settings.enabled) return false;
	return contextTokens > contextWindow - settings.reserveTokens;
}

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

/** 使用保守的字符启发式估计一条消息的令牌数。 */
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
					chars += block.name.length + safeJsonStringify(block.arguments).length;
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
function findValidCutPoints(entries: SessionTreeEntry[], startIndex: number, endIndex: number): number[] {
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
			case "active_tools_change":
			case "compaction":
			case "branch_summary":
			case "custom":
			case "custom_message":
			case "label":
			case "session_info":
			case "leaf":
				break;
		}
		if (entry.type === "branch_summary" || entry.type === "custom_message") {
			cutPoints.push(i);
		}
	}
	return cutPoints;
}

/** 查找包含条目的回合开始的用户可见消息。 */
export function findTurnStartIndex(entries: SessionTreeEntry[], entryIndex: number, startIndex: number): number {
	for (let i = entryIndex; i >= startIndex; i--) {
		const entry = entries[i];
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

/** 为压缩选择的切割点。 */
export interface CutPointResult {
	/** 压缩后保留的第一个条目的索引。 */
	firstKeptEntryIndex: number;
	/** 当切割分割一个回合时，回合起始条目的索引，否则为-1。 */
	turnStartIndex: number;
	/** 选定的切割点是否分割了一个正在进行的回合。 */
	isSplitTurn: boolean;
}

/** 找到压缩切割点，保留大约请求的近期令牌预算。 */
export function findCutPoint(
	entries: SessionTreeEntry[],
	startIndex: number,
	endIndex: number,
	keepRecentTokens: number,
): CutPointResult {
	const cutPoints = findValidCutPoints(entries, startIndex, endIndex);

	if (cutPoints.length === 0) {
		return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
	}
	let accumulatedTokens = 0;
	let cutIndex = cutPoints[0];

	for (let i = endIndex - 1; i >= startIndex; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;
		const messageTokens = estimateTokens(entry.message as AgentMessage);
		accumulatedTokens += messageTokens;
		if (accumulatedTokens >= keepRecentTokens) {
			for (let c = 0; c < cutPoints.length; c++) {
				if (cutPoints[c] >= i) {
					cutIndex = cutPoints[c];
					break;
				}
			}
			break;
		}
	}
	while (cutIndex > startIndex) {
		const prevEntry = entries[cutIndex - 1];
		if (prevEntry.type === "compaction") {
			break;
		}
		if (prevEntry.type === "message") {
			break;
		}
		cutIndex--;
	}
	const cutEntry = entries[cutIndex];
	const isUserMessage = cutEntry.type === "message" && cutEntry.message.role === "user";
	const turnStartIndex = isUserMessage ? -1 : findTurnStartIndex(entries, cutIndex, startIndex);

	return {
		firstKeptEntryIndex: cutIndex,
		turnStartIndex,
		isSplitTurn: !isUserMessage && turnStartIndex !== -1,
	};
}

export const SUMMARIZATION_SYSTEM_PROMPT = `你是一个上下文摘要助手。你的任务是阅读用户与AI编码助手之间的对话，然后按照指定的精确格式生成结构化摘要。

不要继续对话。不要回复对话中的任何问题。只输出结构化摘要。`;

const SUMMARIZATION_PROMPT = `上述消息是需要摘要的对话。创建一个结构化的上下文检查点摘要，供另一个LLM用来继续工作。

使用以下精确格式：

## 目标
[用户试图实现什么？如果会话涵盖不同任务，可以是多个条目。]

## 约束与偏好
- [用户提到的任何约束、偏好或要求]
- [如果没有提到，则为"(无)"]

## 进展
### 已完成
- [x] [已完成的任务/更改]

### 进行中
- [ ] [当前工作]

### 受阻
- [阻碍进展的问题（如果有）]

## 关键决策
- **[决策]**：[简要理由]

## 后续步骤
1. [接下来应该发生什么的有序列表]

## 关键上下文
- [继续所需的数据、示例或引用]
- [如果不适用，则为"(无)"]

保持每个部分简洁。保留确切的文件路径、函数名称和错误消息。`;

const UPDATE_SUMMARIZATION_PROMPT = `上述消息是需要纳入现有摘要的新对话消息，现有摘要位于<previous-summary>标签中。

用新信息更新现有的结构化摘要。规则：
- 保留现有摘要中的所有信息
- 添加新消息中的新进展、决策和上下文
- 更新"进展"部分：当项目完成时，从"进行中"移到"已完成"
- 根据已完成的工作更新"后续步骤"
- 保留确切的文件路径、函数名称和错误消息
- 如果某些内容不再相关，可以删除

使用以下精确格式：

## 目标
[保留现有目标，如果任务扩展，添加新目标]

## 约束与偏好
- [保留现有项，添加新发现的项]

## 进展
### 已完成
- [x] [包括之前完成的项目和新完成的项目]

### 进行中
- [ ] [当前工作 - 根据进展更新]

### 受阻
- [当前障碍 - 如果已解决则删除]

## 关键决策
- **[决策]**：[简要理由]（保留所有之前的，添加新的）

## 后续步骤
1. [根据当前状态更新]

## 关键上下文
- [保留重要上下文，如果需要则添加新的]

保持每个部分简洁。保留确切的文件路径、函数名称和错误消息。`;

/** 生成或更新用于压缩的对话摘要。 */
export async function generateSummary(
	currentMessages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	customInstructions?: string,
	previousSummary?: string,
	thinkingLevel?: ThinkingLevel,
): Promise<Result<string, CompactionError>> {
	const maxTokens = Math.min(
		Math.floor(0.8 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
	let basePrompt = previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
	if (customInstructions) {
		basePrompt = `${basePrompt}\n\n额外关注：${customInstructions}`;
	}
	const llmMessages = convertToLlm(currentMessages);
	const conversationText = serializeConversation(llmMessages);
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

	const completionOptions =
		model.reasoning && thinkingLevel && thinkingLevel !== "off"
			? { maxTokens, signal, apiKey, headers, reasoning: thinkingLevel }
			: { maxTokens, signal, apiKey, headers };

	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		completionOptions,
	);
	if (response.stopReason === "aborted") {
		return err(new CompactionError("aborted", response.errorMessage || "摘要已中止"));
	}
	if (response.stopReason === "error") {
		return err(new CompactionError("summarization_failed", `摘要失败：${response.errorMessage || "未知错误"}`));
	}

	const textContent = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");

	return ok(textContent);
}

/** 为压缩运行准备的输入。 */
export interface CompactionPreparation {
	/** 保留历史开始处的条目ID。 */
	firstKeptEntryId: string;
	/** 被摘要到历史摘要中的消息。 */
	messagesToSummarize: AgentMessage[];
	/** 当压缩分割一个回合时，单独摘要的前缀消息。 */
	turnPrefixMessages: AgentMessage[];
	/** 压缩是否分割一个回合。 */
	isSplitTurn: boolean;
	/** 压缩前的估计上下文令牌数。 */
	tokensBefore: number;
	/** 用于迭代更新的先前压缩摘要。 */
	previousSummary?: string;
	/** 从摘要历史中提取的文件操作。 */
	fileOps: FileOperations;
	/** 用于准备压缩的设置。 */
	settings: CompactionSettings;
}

/** 准备会话条目以进行压缩，如果压缩不适用则返回undefined。 */
export function prepareCompaction(
	pathEntries: SessionTreeEntry[],
	settings: CompactionSettings,
): Result<CompactionPreparation | undefined, CompactionError> {
	if (pathEntries.length === 0 || pathEntries[pathEntries.length - 1].type === "compaction") {
		return ok(undefined);
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
	const firstKeptEntry = pathEntries[cutPoint.firstKeptEntryIndex];
	if (!firstKeptEntry?.id) {
		return err(new CompactionError("invalid_session", "第一个保留的条目没有UUID - 会话可能需要迁移"));
	}
	const firstKeptEntryId = firstKeptEntry.id;

	const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;
	const messagesToSummarize: AgentMessage[] = [];
	for (let i = boundaryStart; i < historyEnd; i++) {
		const msg = getMessageFromEntryForCompaction(pathEntries[i]);
		if (msg) messagesToSummarize.push(msg);
	}
	const turnPrefixMessages: AgentMessage[] = [];
	if (cutPoint.isSplitTurn) {
		for (let i = cutPoint.turnStartIndex; i < cutPoint.firstKeptEntryIndex; i++) {
			const msg = getMessageFromEntryForCompaction(pathEntries[i]);
			if (msg) turnPrefixMessages.push(msg);
		}
	}
	const fileOps = extractFileOperations(messagesToSummarize, pathEntries, prevCompactionIndex);
	if (cutPoint.isSplitTurn) {
		for (const msg of turnPrefixMessages) {
			extractFileOpsFromMessage(msg, fileOps);
		}
	}

	return ok({
		firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn: cutPoint.isSplitTurn,
		tokensBefore,
		previousSummary,
		fileOps,
		settings,
	});
}

const TURN_PREFIX_SUMMARIZATION_PROMPT = `这是一个回合的前缀部分，该回合太大而无法保留。其后缀（近期工作）被保留。

摘要前缀以为保留的后缀提供上下文：

## 原始请求
[用户在这个回合中要求什么？]

## 早期进展
- [前缀中的关键决策和完成的工作]

## 后缀上下文
- [理解保留的近期工作所需的信息]

保持简洁。重点放在理解保留的后缀所需的内容上。`;

export { serializeConversation } from "./utils.ts";

/** 从准备好的会话历史生成压缩摘要数据。 */
export async function compact(
	preparation: CompactionPreparation,
	model: Model<any>,
	apiKey: string,
	headers?: Record<string, string>,
	customInstructions?: string,
	signal?: AbortSignal,
	thinkingLevel?: ThinkingLevel,
): Promise<Result<CompactionResult, CompactionError>> {
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

	if (!firstKeptEntryId) {
		return err(new CompactionError("invalid_session", "第一个保留的条目没有UUID - 会话可能需要迁移"));
	}

	let summary: string;

	if (isSplitTurn && turnPrefixMessages.length > 0) {
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
					)
				: Promise.resolve(ok<string, CompactionError>("无先前历史。")),
			generateTurnPrefixSummary(
				turnPrefixMessages,
				model,
				settings.reserveTokens,
				apiKey,
				headers,
				signal,
				thinkingLevel,
			),
		]);
		if (!historyResult.ok) return err(historyResult.error);
		if (!turnPrefixResult.ok) return err(turnPrefixResult.error);
		summary = `${historyResult.value}\n\n---\n\n**回合上下文（拆分回合）：**\n\n${turnPrefixResult.value}`;
	} else {
		const summaryResult = await generateSummary(
			messagesToSummarize,
			model,
			settings.reserveTokens,
			apiKey,
			headers,
			signal,
			customInstructions,
			previousSummary,
			thinkingLevel,
		);
		if (!summaryResult.ok) return err(summaryResult.error);
		summary = summaryResult.value;
	}

	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return ok({
		summary,
		firstKeptEntryId,
		tokensBefore,
		details: { readFiles, modifiedFiles } as CompactionDetails,
	});
}
async function generateTurnPrefixSummary(
	messages: AgentMessage[],
	model: Model<any>,
	reserveTokens: number,
	apiKey: string,
	headers?: Record<string, string>,
	signal?: AbortSignal,
	thinkingLevel?: ThinkingLevel,
): Promise<Result<string, CompactionError>> {
	const maxTokens = Math.min(
		Math.floor(0.5 * reserveTokens),
		model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY,
	);
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

	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		model.reasoning && thinkingLevel && thinkingLevel !== "off"
			? { maxTokens, signal, apiKey, headers, reasoning: thinkingLevel }
			: { maxTokens, signal, apiKey, headers },
	);
	if (response.stopReason === "aborted") {
		return err(new CompactionError("aborted", response.errorMessage || "回合前缀摘要已中止"));
	}
	if (response.stopReason === "error") {
		return err(
			new CompactionError("summarization_failed", `回合前缀摘要失败：${response.errorMessage || "未知错误"}`),
		);
	}

	return ok(
		response.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join("\n"),
	);
}
