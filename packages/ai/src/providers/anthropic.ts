import Anthropic from "@anthropic-ai/sdk";
import type {
	CacheControlEphemeral,
	ContentBlockParam,
	MessageCreateParamsStreaming,
	MessageParam,
	RawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages.js";
import { getEnvApiKey } from "../env-api-keys.ts";
import { calculateCost } from "../models.ts";
import type {
	AnthropicMessagesCompat,
	Api,
	AssistantMessage,
	CacheRetention,
	Context,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";
import { headersToRecord } from "../utils/headers.ts";
import { parseJsonWithRepair, parseStreamingJson } from "../utils/json-parse.ts";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.ts";

import { resolveCloudflareBaseUrl } from "./cloudflare.ts";
import { buildCopilotDynamicHeaders, hasCopilotVisionInput } from "./github-copilot-headers.ts";
import { adjustMaxTokensForThinking, buildBaseOptions } from "./simple-options.ts";
import { transformMessages } from "./transform-messages.ts";

/**
 * 解析缓存保留偏好。
 * 默认为 "short"，后向兼容使用 PI_CACHE_RETENTION。
 */
function resolveCacheRetention(cacheRetention?: CacheRetention): CacheRetention {
	if (cacheRetention) {
		return cacheRetention;
	}
	if (typeof process !== "undefined" && process.env.PI_CACHE_RETENTION === "long") {
		return "long";
	}
	return "short";
}

function getCacheControl(
	model: Model<"anthropic-messages">,
	cacheRetention?: CacheRetention,
): { retention: CacheRetention; cacheControl?: CacheControlEphemeral } {
	const retention = resolveCacheRetention(cacheRetention);
	if (retention === "none") {
		return { retention };
	}
	const ttl = retention === "long" && getAnthropicCompat(model).supportsLongCacheRetention ? "1h" : undefined;
	return {
		retention,
		cacheControl: { type: "ephemeral", ...(ttl && { ttl }) },
	};
}

// 隐身模式：精确模仿 Claude Code 的工具命名
const claudeCodeVersion = "2.1.75";

// Claude Code 2.x 工具名称（规范大小写）
// 来源：https://cchistory.mariozechner.at/data/prompts-2.1.11.md
// 更新：https://github.com/badlogic/cchistory
const claudeCodeTools = [
	"Read",
	"Write",
	"Edit",
	"Bash",
	"Grep",
	"Glob",
	"AskUserQuestion",
	"EnterPlanMode",
	"ExitPlanMode",
	"KillShell",
	"NotebookEdit",
	"Skill",
	"Task",
	"TaskOutput",
	"TodoWrite",
	"WebFetch",
	"WebSearch",
];

const ccToolLookup = new Map(claudeCodeTools.map((t) => [t.toLowerCase(), t]));

// 将工具名称转换为 CC 规范大小写（如果匹配，不区分大小写）
const toClaudeCodeName = (name: string) => ccToolLookup.get(name.toLowerCase()) ?? name;
const fromClaudeCodeName = (name: string, tools?: Tool[]) => {
	if (tools && tools.length > 0) {
		const lowerName = name.toLowerCase();
		const matchedTool = tools.find((tool) => tool.name.toLowerCase() === lowerName);
		if (matchedTool) return matchedTool.name;
	}
	return name;
};

/**
 * 将内容块转换为 Anthropic API 格式
 */
function convertContentBlocks(content: (TextContent | ImageContent)[]):
	| string
	| Array<
			| { type: "text"; text: string }
			| {
					type: "image";
					source: {
						type: "base64";
						media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
						data: string;
					};
			  }
	  > {
	// 如果只有文本块，为简单起见返回拼接字符串
	const hasImages = content.some((c) => c.type === "image");
	if (!hasImages) {
		return sanitizeSurrogates(content.map((c) => (c as TextContent).text).join("\n"));
	}

	// 如果有图片，转换为内容块数组
	const blocks = content.map((block) => {
		if (block.type === "text") {
			return {
				type: "text" as const,
				text: sanitizeSurrogates(block.text),
			};
		}
		return {
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: block.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
				data: block.data,
			},
		};
	});

	// 如果只有图片（无文本），添加占位文本块
	const hasText = blocks.some((b) => b.type === "text");
	if (!hasText) {
		blocks.unshift({
			type: "text" as const,
			text: "（见附图）",
		});
	}

	return blocks;
}

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AnthropicThinkingDisplay = "summarized" | "omitted";

const FINE_GRAINED_TOOL_STREAMING_BETA = "fine-grained-tool-streaming-2025-05-14";
const INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";

function getAnthropicCompat(
	model: Model<"anthropic-messages">,
): Required<Omit<AnthropicMessagesCompat, "forceAdaptiveThinking">> {
	// 自动检测提供商的会话亲和性和缓存控制支持
	const isFireworks = model.provider === "fireworks";
	const isCloudflareAiGatewayAnthropic =
		model.provider === "cloudflare-ai-gateway" && model.baseUrl.includes("anthropic");
	return {
		supportsEagerToolInputStreaming: model.compat?.supportsEagerToolInputStreaming ?? !isFireworks,
		supportsLongCacheRetention: model.compat?.supportsLongCacheRetention ?? !isFireworks,
		sendSessionAffinityHeaders:
			model.compat?.sendSessionAffinityHeaders ?? !!(isFireworks || isCloudflareAiGatewayAnthropic),
		supportsCacheControlOnTools: model.compat?.supportsCacheControlOnTools ?? !isFireworks,
	};
}

export interface AnthropicOptions extends StreamOptions {
	/**
	 * 启用扩展思考。
	 * 对于自适应思考模型：模型自行决定何时/思考多少。
	 * 对于旧模型：使用基于预算的思考，配合 thinkingBudgetTokens。
	 * 默认值：undefined（不启用思考，除非 streamSimpleAnthropic() 将简单推理级别映射到此选项，或调用者明确设置）。
	 */
	thinkingEnabled?: boolean;
	/**
	 * 扩展思考的令牌预算（仅旧模型）。
	 * 自适应思考模型忽略此参数。
	 * 默认值：当 thinkingEnabled 为 true 且未提供预算时为 1024。
	 */
	thinkingBudgetTokens?: number;
	/**
	 * 自适应思考模型的努力级别。
	 * 控制 Claude 分配多少思考：
	 * - "max": 总是思考，无限制（仅 Opus 4.6）
	 * - "xhigh": 最高推理级别（Opus 4.7）
	 * - "high": 总是思考，深度推理
	 * - "medium": 适度思考，可能跳过简单查询
	 * - "low": 最小思考，跳过简单任务
	 * 旧模型忽略此参数。
	 * 默认值：省略，除非 streamSimpleAnthropic() 将简单推理级别映射到此选项。
	 */
	effort?: AnthropicEffort;
	/**
	 * 控制 API 响应中思考内容的返回方式。
	 * - "summarized": 思考块包含总结后的思考文本。
	 * - "omitted": 思考块返回空的思考字段；加密签名仍会回传以支持多轮对话连续性。当你的 UI 不展示思考时，用于更快获得第一个文本令牌。
	 *
	 * 注意：Anthropic 对 Claude Opus 4.7 和 Claude Mythos Preview 的 API 默认值是 "omitted"。
	 * 我们在此处默认使用 "summarized" 以保持与旧版 Claude 4 模型行为一致。显式设置为 "omitted" 以选择加入。
	 * 默认值：启用思考时为 "summarized"。
	 */
	thinkingDisplay?: AnthropicThinkingDisplay;
	/**
	 * 是否对非自适应思考模型请求交错的思考 beta 头部。
	 * 自适应思考模型内置交错思考，因此无论此设置如何，都会跳过该头部。
	 * 默认值：true。
	 */
	interleavedThinking?: boolean;
	/**
	 * Anthropic 工具选择行为。字符串值映射到 Anthropic 内置选项；
	 * `{ type: "tool", name }` 强制使用特定工具。
	 * 默认值：省略（Anthropic 默认行为，目前等同于 auto）。
	 */
	toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string };
	/**
	 * 预构建的 Anthropic 客户端实例。提供时完全跳过内部客户端构建。
	 * 使用此选项注入共享相同消息 API 的替代 SDK 客户端（如 AnthropicVertex）。
	 */
	client?: Anthropic;
}

function mergeHeaders(...headerSources: (Record<string, string | null> | undefined)[]): Record<string, string | null> {
	const merged: Record<string, string | null> = {};
	for (const headers of headerSources) {
		if (headers) {
			Object.assign(merged, headers);
		}
	}
	return merged;
}

interface ServerSentEvent {
	event: string | null;
	data: string;
	raw: string[];
}

interface SseDecoderState {
	event: string | null;
	data: string[];
	raw: string[];
}

const ANTHROPIC_MESSAGE_EVENTS: ReadonlySet<string> = new Set([
	"message_start",
	"message_delta",
	"message_stop",
	"content_block_start",
	"content_block_delta",
	"content_block_stop",
]);

function flushSseEvent(state: SseDecoderState): ServerSentEvent | null {
	if (!state.event && state.data.length === 0) {
		return null;
	}

	const event: ServerSentEvent = {
		event: state.event,
		data: state.data.join("\n"),
		raw: [...state.raw],
	};
	state.event = null;
	state.data = [];
	state.raw = [];
	return event;
}

function decodeSseLine(line: string, state: SseDecoderState): ServerSentEvent | null {
	if (line === "") {
		return flushSseEvent(state);
	}

	state.raw.push(line);
	if (line.startsWith(":")) {
		return null;
	}

	const delimiterIndex = line.indexOf(":");
	const fieldName = delimiterIndex === -1 ? line : line.slice(0, delimiterIndex);
	let value = delimiterIndex === -1 ? "" : line.slice(delimiterIndex + 1);
	if (value.startsWith(" ")) {
		value = value.slice(1);
	}

	if (fieldName === "event") {
		state.event = value;
	} else if (fieldName === "data") {
		state.data.push(value);
	}

	return null;
}

function nextLineBreakIndex(text: string): number {
	const carriageReturnIndex = text.indexOf("\r");
	const newlineIndex = text.indexOf("\n");
	if (carriageReturnIndex === -1) {
		return newlineIndex;
	}
	if (newlineIndex === -1) {
		return carriageReturnIndex;
	}
	return Math.min(carriageReturnIndex, newlineIndex);
}

function consumeLine(text: string): { line: string; rest: string } | null {
	const lineBreakIndex = nextLineBreakIndex(text);
	if (lineBreakIndex === -1) {
		return null;
	}

	let nextIndex = lineBreakIndex + 1;
	if (text[lineBreakIndex] === "\r" && text[nextIndex] === "\n") {
		nextIndex += 1;
	}

	return {
		line: text.slice(0, lineBreakIndex),
		rest: text.slice(nextIndex),
	};
}

async function* iterateSseMessages(
	body: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncGenerator<ServerSentEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const state: SseDecoderState = { event: null, data: [], raw: [] };
	let buffer = "";

	try {
		while (true) {
			if (signal?.aborted) {
				throw new Error("请求已被中止");
			}

			const { value, done } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			let consumed = consumeLine(buffer);
			while (consumed) {
				buffer = consumed.rest;
				const event = decodeSseLine(consumed.line, state);
				if (event) {
					yield event;
				}
				consumed = consumeLine(buffer);
			}
		}

		buffer += decoder.decode();
		let consumed = consumeLine(buffer);
		while (consumed) {
			buffer = consumed.rest;
			const event = decodeSseLine(consumed.line, state);
			if (event) {
				yield event;
			}
			consumed = consumeLine(buffer);
		}

		if (buffer.length > 0) {
			const event = decodeSseLine(buffer, state);
			if (event) {
				yield event;
			}
		}

		const trailingEvent = flushSseEvent(state);
		if (trailingEvent) {
			yield trailingEvent;
		}
	} finally {
		reader.releaseLock();
	}
}

async function* iterateAnthropicEvents(
	response: Response,
	signal?: AbortSignal,
): AsyncGenerator<RawMessageStreamEvent> {
	if (!response.body) {
		throw new Error("尝试遍历无响应体的 Anthropic 响应");
	}

	let sawMessageStart = false;
	let sawMessageEnd = false;

	for await (const sse of iterateSseMessages(response.body, signal)) {
		if (sse.event === "error") {
			throw new Error(sse.data);
		}

		if (!ANTHROPIC_MESSAGE_EVENTS.has(sse.event ?? "")) {
			continue;
		}

		try {
			const event = parseJsonWithRepair<RawMessageStreamEvent>(sse.data);
			if (event.type === "message_start") {
				sawMessageStart = true;
			} else if (event.type === "message_stop") {
				sawMessageEnd = true;
			}
			yield event;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`无法解析 Anthropic SSE 事件 ${sse.event}: ${message}; data=${sse.data}; raw=${sse.raw.join("\\n")}`,
			);
		}
	}

	if (sawMessageStart && !sawMessageEnd) {
		throw new Error("Anthropic 数据流在收到 message_stop 前结束");
	}
}

export const streamAnthropic: StreamFunction<"anthropic-messages", AnthropicOptions> = (
	model: Model<"anthropic-messages">,
	context: Context,
	options?: AnthropicOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api as Api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			let client: Anthropic;
			let isOAuth: boolean;

			if (options?.client) {
				client = options.client;
				isOAuth = false;
			} else {
				const apiKey = options?.apiKey ?? getEnvApiKey(model.provider) ?? "";

				let copilotDynamicHeaders: Record<string, string> | undefined;
				if (model.provider === "github-copilot") {
					const hasImages = hasCopilotVisionInput(context.messages);
					copilotDynamicHeaders = buildCopilotDynamicHeaders({
						messages: context.messages,
						hasImages,
					});
				}

				const cacheRetention = options?.cacheRetention ?? resolveCacheRetention();
				const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;

				const created = createClient(
					model,
					apiKey,
					options?.interleavedThinking ?? true,
					shouldUseFineGrainedToolStreamingBeta(model, context),
					options?.headers,
					copilotDynamicHeaders,
					cacheSessionId,
				);
				client = created.client;
				isOAuth = created.isOAuthToken;
			}
			let params = buildParams(model, context, isOAuth, options);
			const nextParams = await options?.onPayload?.(params, model);
			if (nextParams !== undefined) {
				params = nextParams as MessageCreateParamsStreaming;
			}
			const requestOptions = {
				...(options?.signal ? { signal: options.signal } : {}),
				...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
				maxRetries: options?.maxRetries ?? 0,
			};
			const response = await client.messages.create({ ...params, stream: true }, requestOptions).asResponse();
			await options?.onResponse?.({ status: response.status, headers: headersToRecord(response.headers) }, model);
			stream.push({ type: "start", partial: output });

			type Block = (ThinkingContent | TextContent | (ToolCall & { partialJson: string })) & { index: number };
			const blocks = output.content as Block[];

			for await (const event of iterateAnthropicEvents(response, options?.signal)) {
				if (event.type === "message_start") {
					output.responseId = event.message.id;
					// 从 message_start 事件捕获初始令牌用量
					// 这确保即使流提前中止，我们也有输入令牌计数
					output.usage.input = event.message.usage.input_tokens || 0;
					output.usage.output = event.message.usage.output_tokens || 0;
					output.usage.cacheRead = event.message.usage.cache_read_input_tokens || 0;
					output.usage.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
					// Anthropic 不提供 total_tokens，从各分量计算
					output.usage.totalTokens =
						output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
					calculateCost(model, output.usage);
				} else if (event.type === "content_block_start") {
					if (event.content_block.type === "text") {
						const block: Block = {
							type: "text",
							text: "",
							index: event.index,
						};
						output.content.push(block);
						stream.push({ type: "text_start", contentIndex: output.content.length - 1, partial: output });
					} else if (event.content_block.type === "thinking") {
						const block: Block = {
							type: "thinking",
							thinking: "",
							thinkingSignature: "",
							index: event.index,
						};
						output.content.push(block);
						stream.push({ type: "thinking_start", contentIndex: output.content.length - 1, partial: output });
					} else if (event.content_block.type === "redacted_thinking") {
						const block: Block = {
							type: "thinking",
							thinking: "[Reasoning redacted]",
							thinkingSignature: event.content_block.data,
							redacted: true,
							index: event.index,
						};
						output.content.push(block);
						stream.push({ type: "thinking_start", contentIndex: output.content.length - 1, partial: output });
					} else if (event.content_block.type === "tool_use") {
						const block: Block = {
							type: "toolCall",
							id: event.content_block.id,
							name: isOAuth
								? fromClaudeCodeName(event.content_block.name, context.tools)
								: event.content_block.name,
							arguments: (event.content_block.input as Record<string, any>) ?? {},
							partialJson: "",
							index: event.index,
						};
						output.content.push(block);
						stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });
					}
				} else if (event.type === "content_block_delta") {
					if (event.delta.type === "text_delta") {
						const index = blocks.findIndex((b) => b.index === event.index);
						const block = blocks[index];
						if (block && block.type === "text") {
							block.text += event.delta.text;
							stream.push({
								type: "text_delta",
								contentIndex: index,
								delta: event.delta.text,
								partial: output,
							});
						}
					} else if (event.delta.type === "thinking_delta") {
						const index = blocks.findIndex((b) => b.index === event.index);
						const block = blocks[index];
						if (block && block.type === "thinking") {
							block.thinking += event.delta.thinking;
							stream.push({
								type: "thinking_delta",
								contentIndex: index,
								delta: event.delta.thinking,
								partial: output,
							});
						}
					} else if (event.delta.type === "input_json_delta") {
						const index = blocks.findIndex((b) => b.index === event.index);
						const block = blocks[index];
						if (block && block.type === "toolCall") {
							block.partialJson += event.delta.partial_json;
							block.arguments = parseStreamingJson(block.partialJson);
							stream.push({
								type: "toolcall_delta",
								contentIndex: index,
								delta: event.delta.partial_json,
								partial: output,
							});
						}
					} else if (event.delta.type === "signature_delta") {
						const index = blocks.findIndex((b) => b.index === event.index);
						const block = blocks[index];
						if (block && block.type === "thinking") {
							block.thinkingSignature = block.thinkingSignature || "";
							block.thinkingSignature += event.delta.signature;
						}
					}
				} else if (event.type === "content_block_stop") {
					const index = blocks.findIndex((b) => b.index === event.index);
					const block = blocks[index];
					if (block) {
						delete (block as any).index;
						if (block.type === "text") {
							stream.push({
								type: "text_end",
								contentIndex: index,
								content: block.text,
								partial: output,
							});
						} else if (block.type === "thinking") {
							stream.push({
								type: "thinking_end",
								contentIndex: index,
								content: block.thinking,
								partial: output,
							});
						} else if (block.type === "toolCall") {
							block.arguments = parseStreamingJson(block.partialJson);
							// 就地完成并删除临时缓冲区，以便重播仅携带解析后的参数
							delete (block as { partialJson?: string }).partialJson;
							stream.push({
								type: "toolcall_end",
								contentIndex: index,
								toolCall: block,
								partial: output,
							});
						}
					}
				} else if (event.type === "message_delta") {
					if (event.delta.stop_reason) {
						output.stopReason = mapStopReason(event.delta.stop_reason);
					}
					// 仅在用量字段存在（非 null）时更新。
					// 当代理在 message_delta 中省略 input_tokens 时，保留来自 message_start 的 input_tokens。
					if (event.usage.input_tokens != null) {
						output.usage.input = event.usage.input_tokens;
					}
					if (event.usage.output_tokens != null) {
						output.usage.output = event.usage.output_tokens;
					}
					if (event.usage.cache_read_input_tokens != null) {
						output.usage.cacheRead = event.usage.cache_read_input_tokens;
					}
					if (event.usage.cache_creation_input_tokens != null) {
						output.usage.cacheWrite = event.usage.cache_creation_input_tokens;
					}
					// Anthropic 不提供 total_tokens，从各分量计算
					output.usage.totalTokens =
						output.usage.input + output.usage.output + output.usage.cacheRead + output.usage.cacheWrite;
					calculateCost(model, output.usage);
				}
			}

			if (options?.signal?.aborted) {
				throw new Error("请求已被中止");
			}

			if (output.stopReason === "aborted" || output.stopReason === "error") {
				throw new Error("发生未知错误");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				delete (block as { index?: number }).index;
				// partialJson 仅为流式临时缓冲区；绝不持久化
				delete (block as { partialJson?: string }).partialJson;
			}
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

/**
 * 将 ThinkingLevel 映射到自适应思考的 Anthropic 努力级别。
 * 注意：努力级别 "max" 仅适用于 Opus 4.6，而 Opus 4.7 支持 "xhigh"。
 */
function mapThinkingLevelToEffort(
	model: Model<"anthropic-messages">,
	level: SimpleStreamOptions["reasoning"],
): AnthropicEffort {
	const mapped = level ? model.thinkingLevelMap?.[level] : undefined;
	if (typeof mapped === "string") return mapped as AnthropicEffort;

	switch (level) {
		case "minimal":
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
			return "high";
		default:
			return "high";
	}
}

export const streamSimpleAnthropic: StreamFunction<"anthropic-messages", SimpleStreamOptions> = (
	model: Model<"anthropic-messages">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`没有提供商 ${model.provider} 的 API 密钥`);
	}

	const base = buildBaseOptions(model, options, apiKey);
	if (!options?.reasoning) {
		return streamAnthropic(model, context, { ...base, thinkingEnabled: false } satisfies AnthropicOptions);
	}

	// 对于自适应思考模型：使用努力级别。
	// 对于旧模型：使用基于预算的思考。
	if (model.compat?.forceAdaptiveThinking === true) {
		const effort = mapThinkingLevelToEffort(model, options.reasoning);
		return streamAnthropic(model, context, {
			...base,
			thinkingEnabled: true,
			effort,
		} satisfies AnthropicOptions);
	}

	// undefined 表示调用者未请求输出上限；让辅助函数使用模型上限。
	// 不要此处强制为 0，否则思考预算将变为整个 max_tokens 值。
	const adjusted = adjustMaxTokensForThinking(
		base.maxTokens,
		model.maxTokens,
		options.reasoning,
		options.thinkingBudgets,
	);

	return streamAnthropic(model, context, {
		...base,
		maxTokens: adjusted.maxTokens,
		thinkingEnabled: true,
		thinkingBudgetTokens: adjusted.thinkingBudget,
	} satisfies AnthropicOptions);
};

function isOAuthToken(apiKey: string): boolean {
	return apiKey.includes("sk-ant-oat");
}

function createClient(
	model: Model<"anthropic-messages">,
	apiKey: string,
	interleavedThinking: boolean,
	useFineGrainedToolStreamingBeta: boolean,
	optionsHeaders?: Record<string, string>,
	dynamicHeaders?: Record<string, string>,
	sessionId?: string,
): { client: Anthropic; isOAuthToken: boolean } {
	// 自适应思考模型内置交错思考，因此跳过 beta 头部。
	const needsInterleavedBeta = interleavedThinking && model.compat?.forceAdaptiveThinking !== true;
	const betaFeatures: string[] = [];
	if (useFineGrainedToolStreamingBeta) {
		betaFeatures.push(FINE_GRAINED_TOOL_STREAMING_BETA);
	}
	if (needsInterleavedBeta) {
		betaFeatures.push(INTERLEAVED_THINKING_BETA);
	}

	if (model.provider === "cloudflare-ai-gateway") {
		const client = new Anthropic({
			apiKey: null,
			authToken: null,
			baseURL: resolveCloudflareBaseUrl(model),
			dangerouslyAllowBrowser: true,
			defaultHeaders: mergeHeaders(
				{
					accept: "application/json",
					"anthropic-dangerous-direct-browser-access": "true",
					"cf-aig-authorization": `Bearer ${apiKey}`,
					"x-api-key": null,
					Authorization: null,
					...(betaFeatures.length > 0 ? { "anthropic-beta": betaFeatures.join(",") } : {}),
				},
				model.headers,
				optionsHeaders,
			),
		});

		return { client, isOAuthToken: false };
	}

	// Copilot：Bearer 认证，选择性 beta 功能。
	if (model.provider === "github-copilot") {
		const client = new Anthropic({
			apiKey: null,
			authToken: apiKey,
			baseURL: model.baseUrl,
			dangerouslyAllowBrowser: true,
			defaultHeaders: mergeHeaders(
				{
					accept: "application/json",
					"anthropic-dangerous-direct-browser-access": "true",
					...(betaFeatures.length > 0 ? { "anthropic-beta": betaFeatures.join(",") } : {}),
				},
				model.headers,
				dynamicHeaders,
				optionsHeaders,
			),
		});

		return { client, isOAuthToken: false };
	}

	// OAuth：Bearer 认证，Claude Code 身份头部
	if (isOAuthToken(apiKey)) {
		const client = new Anthropic({
			apiKey: null,
			authToken: apiKey,
			baseURL: model.baseUrl,
			dangerouslyAllowBrowser: true,
			defaultHeaders: mergeHeaders(
				{
					accept: "application/json",
					"anthropic-dangerous-direct-browser-access": "true",
					"anthropic-beta": ["claude-code-20250219", "oauth-2025-04-20", ...betaFeatures].join(","),
					"user-agent": `claude-cli/${claudeCodeVersion}`,
					"x-app": "cli",
				},
				model.headers,
				optionsHeaders,
			),
		});

		return { client, isOAuthToken: true };
	}

	// API 密钥认证
	const sessionAffinityHeaders: Record<string, string | null> =
		sessionId && getAnthropicCompat(model).sendSessionAffinityHeaders ? { "x-session-affinity": sessionId } : {};
	const client = new Anthropic({
		apiKey,
		authToken: null,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders: mergeHeaders(
			{
				accept: "application/json",
				"anthropic-dangerous-direct-browser-access": "true",
				...(betaFeatures.length > 0 ? { "anthropic-beta": betaFeatures.join(",") } : {}),
			},
			sessionAffinityHeaders,
			model.headers,
			optionsHeaders,
		),
	});

	return { client, isOAuthToken: false };
}

function buildParams(
	model: Model<"anthropic-messages">,
	context: Context,
	isOAuthToken: boolean,
	options?: AnthropicOptions,
): MessageCreateParamsStreaming {
	const { cacheControl } = getCacheControl(model, options?.cacheRetention);
	const params: MessageCreateParamsStreaming = {
		model: model.id,
		messages: convertMessages(context.messages, model, isOAuthToken, cacheControl),
		max_tokens: options?.maxTokens ?? model.maxTokens,
		stream: true,
	};

	// 对于 OAuth 令牌，必须包含 Claude Code 身份
	if (isOAuthToken) {
		params.system = [
			{
				type: "text",
				text: "你是 Claude Code，Anthropic 官方 Claude 命令行工具。",
				...(cacheControl ? { cache_control: cacheControl } : {}),
			},
		];
		if (context.systemPrompt) {
			params.system.push({
				type: "text",
				text: sanitizeSurrogates(context.systemPrompt),
				...(cacheControl ? { cache_control: cacheControl } : {}),
			});
		}
	} else if (context.systemPrompt) {
		// 为非 OAuth 令牌的系统提示添加缓存控制
		params.system = [
			{
				type: "text",
				text: sanitizeSurrogates(context.systemPrompt),
				...(cacheControl ? { cache_control: cacheControl } : {}),
			},
		];
	}

	// 温度与扩展思考不兼容（自适应或基于预算）
	if (options?.temperature !== undefined && !options?.thinkingEnabled) {
		params.temperature = options.temperature;
	}

	if (context.tools && context.tools.length > 0) {
		const compat = getAnthropicCompat(model);
		params.tools = convertTools(
			context.tools,
			isOAuthToken,
			compat.supportsEagerToolInputStreaming,
			compat.supportsCacheControlOnTools ? cacheControl : undefined,
		);
	}

	// 配置思考模式：自适应、基于预算或显式禁用
	if (model.reasoning) {
		if (options?.thinkingEnabled) {
			// 默认使用 "summarized" 以使 Opus 4.7 和 Mythos Preview 的行为
			// 与旧版 Claude 4 模型一致（其 API 默认值也是 "summarized"）
			const display: AnthropicThinkingDisplay = options.thinkingDisplay ?? "summarized";
			if (model.compat?.forceAdaptiveThinking === true) {
				// 自适应思考：Claude 自行决定何时以及思考多少
				params.thinking = { type: "adaptive", display };
				if (options.effort) {
					// Anthropic SDK 类型可能滞后于新支持的努力值，如 "xhigh"
					params.output_config =
						options.effort === "xhigh"
							? ({ effort: options.effort } as unknown as NonNullable<
									MessageCreateParamsStreaming["output_config"]
								>)
							: { effort: options.effort };
				}
			} else {
				// 基于预算的思考（旧模型）
				params.thinking = {
					type: "enabled",
					budget_tokens: options.thinkingBudgetTokens || 1024,
					display,
				};
			}
		} else if (options?.thinkingEnabled === false) {
			params.thinking = { type: "disabled" };
		}
	}

	if (options?.metadata) {
		const userId = options.metadata.user_id;
		if (typeof userId === "string") {
			params.metadata = { user_id: userId };
		}
	}

	if (options?.toolChoice) {
		if (typeof options.toolChoice === "string") {
			params.tool_choice = { type: options.toolChoice };
		} else {
			params.tool_choice = options.toolChoice;
		}
	}

	return params;
}

// 规范化工具调用 ID 以匹配 Anthropic 要求的模式和长度
function normalizeToolCallId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function convertMessages(
	messages: Message[],
	model: Model<"anthropic-messages">,
	isOAuthToken: boolean,
	cacheControl?: CacheControlEphemeral,
): MessageParam[] {
	const params: MessageParam[] = [];

	// 为跨提供商兼容性转换消息
	const transformedMessages = transformMessages(messages, model, normalizeToolCallId);

	for (let i = 0; i < transformedMessages.length; i++) {
		const msg = transformedMessages[i];

		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				if (msg.content.trim().length > 0) {
					params.push({
						role: "user",
						content: sanitizeSurrogates(msg.content),
					});
				}
			} else {
				const blocks: ContentBlockParam[] = msg.content.map((item) => {
					if (item.type === "text") {
						return {
							type: "text",
							text: sanitizeSurrogates(item.text),
						};
					} else {
						return {
							type: "image",
							source: {
								type: "base64",
								media_type: item.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
								data: item.data,
							},
						};
					}
				});
				const filteredBlocks = blocks.filter((b) => {
					if (b.type === "text") {
						return b.text.trim().length > 0;
					}
					return true;
				});
				if (filteredBlocks.length === 0) continue;
				params.push({
					role: "user",
					content: filteredBlocks,
				});
			}
		} else if (msg.role === "assistant") {
			const blocks: ContentBlockParam[] = [];

			for (const block of msg.content) {
				if (block.type === "text") {
					if (block.text.trim().length === 0) continue;
					blocks.push({
						type: "text",
						text: sanitizeSurrogates(block.text),
					});
				} else if (block.type === "thinking") {
					// 已编辑的思考：将不透明负载作为 redacted_thinking 传递
					if (block.redacted) {
						blocks.push({
							type: "redacted_thinking",
							data: block.thinkingSignature!,
						});
						continue;
					}
					if (block.thinking.trim().length === 0) continue;
					// 如果思考签名缺失/为空（例如来自中止的流），
					// 转换为纯文本块，不带 <thinking> 标签以避免 API 拒绝
					// 并防止 Claude 在响应中模仿该标签
					if (!block.thinkingSignature || block.thinkingSignature.trim().length === 0) {
						blocks.push({
							type: "text",
							text: sanitizeSurrogates(block.thinking),
						});
					} else {
						blocks.push({
							type: "thinking",
							thinking: sanitizeSurrogates(block.thinking),
							signature: block.thinkingSignature,
						});
					}
				} else if (block.type === "toolCall") {
					blocks.push({
						type: "tool_use",
						id: block.id,
						name: isOAuthToken ? toClaudeCodeName(block.name) : block.name,
						input: block.arguments ?? {},
					});
				}
			}
			if (blocks.length === 0) continue;
			params.push({
				role: "assistant",
				content: blocks,
			});
		} else if (msg.role === "toolResult") {
			// 收集所有连续的 toolResult 消息，用于 z.ai Anthropic 端点
			const toolResults: ContentBlockParam[] = [];

			// 添加当前工具结果
			toolResults.push({
				type: "tool_result",
				tool_use_id: msg.toolCallId,
				content: convertContentBlocks(msg.content),
				is_error: msg.isError,
			});

			// 向前查找连续的 toolResult 消息
			let j = i + 1;
			while (j < transformedMessages.length && transformedMessages[j].role === "toolResult") {
				const nextMsg = transformedMessages[j] as ToolResultMessage; // 我们知道是 toolResult
				toolResults.push({
					type: "tool_result",
					tool_use_id: nextMsg.toolCallId,
					content: convertContentBlocks(nextMsg.content),
					is_error: nextMsg.isError,
				});
				j++;
			}

			// 跳过已处理的消息
			i = j - 1;

			// 添加包含所有工具结果的单条用户消息
			params.push({
				role: "user",
				content: toolResults,
			});
		}
	}

	// 为最后一条用户消息添加缓存控制以缓存对话历史
	if (cacheControl && params.length > 0) {
		const lastMessage = params[params.length - 1];
		if (lastMessage.role === "user") {
			if (Array.isArray(lastMessage.content)) {
				const lastBlock = lastMessage.content[lastMessage.content.length - 1];
				if (
					lastBlock &&
					(lastBlock.type === "text" || lastBlock.type === "image" || lastBlock.type === "tool_result")
				) {
					(lastBlock as any).cache_control = cacheControl;
				}
			} else if (typeof lastMessage.content === "string") {
				lastMessage.content = [
					{
						type: "text",
						text: lastMessage.content,
						cache_control: cacheControl,
					},
				] as any;
			}
		}
	}

	return params;
}

function shouldUseFineGrainedToolStreamingBeta(model: Model<"anthropic-messages">, context: Context): boolean {
	return !!context.tools?.length && !getAnthropicCompat(model).supportsEagerToolInputStreaming;
}

function convertTools(
	tools: Tool[],
	isOAuthToken: boolean,
	supportsEagerToolInputStreaming: boolean,
	cacheControl?: CacheControlEphemeral,
): Anthropic.Messages.Tool[] {
	if (!tools) return [];

	return tools.map((tool, index) => {
		const schema = tool.parameters as { properties?: unknown; required?: string[] };

		return {
			name: isOAuthToken ? toClaudeCodeName(tool.name) : tool.name,
			description: tool.description,
			...(supportsEagerToolInputStreaming ? { eager_input_streaming: true } : {}),
			input_schema: {
				type: "object",
				properties: schema.properties ?? {},
				required: schema.required ?? [],
			},
			...(cacheControl && index === tools.length - 1 ? { cache_control: cacheControl } : {}),
		};
	});
}

function mapStopReason(reason: Anthropic.Messages.StopReason | string): StopReason {
	switch (reason) {
		case "end_turn":
			return "stop";
		case "max_tokens":
			return "length";
		case "tool_use":
			return "toolUse";
		case "refusal":
			return "error";
		case "pause_turn": // Stop 足够 -> 重新提交
			return "stop";
		case "stop_sequence":
			return "stop"; // 我们不会提供停止序列，因此不应发生
		case "sensitive": // 内容被安全过滤器标记（尚未在 SDK 类型中）
			return "error";
		default:
			// 优雅处理未知停止原因（API 可能添加新值）
			throw new Error(`未处理的停止原因: ${reason}`);
	}
}
