import {
	BedrockRuntimeClient,
	type BedrockRuntimeClientConfig,
	BedrockRuntimeServiceException,
	StopReason as BedrockStopReason,
	type Tool as BedrockTool,
	CachePointType,
	CacheTTL,
	type ContentBlock,
	type ContentBlockDeltaEvent,
	type ContentBlockStartEvent,
	type ContentBlockStopEvent,
	ConversationRole,
	ConverseStreamCommand,
	type ConverseStreamMetadataEvent,
	ImageFormat,
	type Message,
	type SystemContentBlock,
	type ToolChoice,
	type ToolConfiguration,
	ToolResultStatus,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type { DocumentType } from "@smithy/types";
import { calculateCost } from "../models.ts";
import type {
	Api,
	AssistantMessage,
	CacheRetention,
	Context,
	Model,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingBudgets,
	ThinkingContent,
	ThinkingLevel,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "../types.ts";
import { AssistantMessageEventStream } from "../utils/event-stream.ts";
import { parseStreamingJson } from "../utils/json-parse.ts";
import { createHttpProxyAgentsForTarget } from "../utils/node-http-proxy.ts";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.ts";
import { adjustMaxTokensForThinking, buildBaseOptions, clampReasoning } from "./simple-options.ts";
import { transformMessages } from "./transform-messages.ts";

export type BedrockThinkingDisplay = "summarized" | "omitted";

export interface BedrockOptions extends StreamOptions {
	region?: string;
	profile?: string;
	toolChoice?: "auto" | "any" | "none" | { type: "tool"; name: string };
	/* 参见 https://docs.aws.amazon.com/bedrock/latest/userguide/inference-reasoning.html 获取支持的模型列表。 */
	reasoning?: ThinkingLevel;
	/* 每个思考等级的定制 token 预算。覆盖默认预算。 */
	thinkingBudgets?: ThinkingBudgets;
	/* 仅 Claude 4.x 模型支持，参见 https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-extended-thinking.html#claude-messages-extended-thinking-tool-use-interleaved */
	interleavedThinking?: boolean;
	/**
	 * 控制响应中如何返回 Claude 的思考内容。
	 * - "summarized": 思考块包含汇总后的思考文本（此处为默认值）。
	 * - "omitted": 思考内容被省略，但签名仍会返回以实现多轮连续性，从而减少到第一个文本 token 的时间。
	 *
	 * 注意：Anthropic 的 API 对于 Claude Opus 4.7 和 Mythos Preview 默认为 "omitted"。此处我们默认为 "summarized" 以保持与旧版 Claude 4 模型的行为一致。仅适用于 Bedrock 上的 Claude 模型。
	 */
	thinkingDisplay?: BedrockThinkingDisplay;
	/** 附加到推理请求的键值对，用于成本分配标记。
	 * 键：最多 64 个字符，不能以 `aws:` 开头。值：最多 256 个字符。最多 50 对。
	 * 标签会出现在 AWS Cost Explorer 的分摊成本分配数据中。
	 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ConverseStream.html */
	requestMetadata?: Record<string, string>;
	/** Bedrock API 密钥认证的 Bearer token。
	 * 设置后，跳过 SigV4 签名，改为发送 Authorization: Bearer <token>。
	 * 需要在 token 的身份上拥有 `bedrock:CallWithBearerToken` IAM 权限。
	 * 通过 AWS_BEARER_TOKEN_BEDROCK 环境变量设置或直接传入。
	 * @see https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazonbedrock.html */
	bearerToken?: string;
}

type Block = (TextContent | ThinkingContent | ToolCall) & { index?: number; partialJson?: string };

export const streamBedrock: StreamFunction<"bedrock-converse-stream", BedrockOptions> = (
	model: Model<"bedrock-converse-stream">,
	context: Context,
	options: BedrockOptions = {},
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: "bedrock-converse-stream" as Api,
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

		const blocks = output.content as Block[];

		const config: BedrockRuntimeClientConfig = {
			profile: options.profile,
		};
		const configuredRegion = getConfiguredBedrockRegion(options);
		const hasConfiguredProfile = hasConfiguredBedrockProfile();
		const endpointRegion = getStandardBedrockEndpointRegion(model.baseUrl);
		const useExplicitEndpoint = shouldUseExplicitBedrockEndpoint(
			model.baseUrl,
			configuredRegion,
			hasConfiguredProfile,
		);

		// 仅在未配置 region/profile 时固定标准 AWS Bedrock runtime 端点。
		// 这样可以保留 #3402 中的自定义端点（VPC/代理），而不会强制内置目录默认值（如 us-east-1）覆盖 AWS_REGION/AWS_PROFILE。
		if (useExplicitEndpoint) {
			config.endpoint = model.baseUrl;
		}

		// 解析 Bedrock API 密钥认证的 bearer token。
		const bearerToken = options.bearerToken || process.env.AWS_BEARER_TOKEN_BEDROCK || undefined;
		const useBearerToken = bearerToken !== undefined && process.env.AWS_BEDROCK_SKIP_AUTH !== "1";

		// 仅在 Node.js/Bun 环境中
		if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
			// Region 解析：显式选项 > 环境变量 > SDK 默认链。
			// 当设置了 AWS_PROFILE 时，将 region 留空以便 SDK 从 aws 配置文件中解析。
			// 否则回退到 us-east-1。
			if (configuredRegion) {
				config.region = configuredRegion;
			} else if (endpointRegion && useExplicitEndpoint) {
				config.region = endpointRegion;
			} else if (!hasConfiguredProfile) {
				config.region = "us-east-1";
			}

			// 支持无需认证的代理
			if (process.env.AWS_BEDROCK_SKIP_AUTH === "1") {
				config.credentials = {
					accessKeyId: "dummy-access-key",
					secretAccessKey: "dummy-secret-key",
				};
			}

			const proxyAgents = createHttpProxyAgentsForTarget(model.baseUrl);
			if (proxyAgents) {
				// Bedrock runtime 从 v3.798.0 开始默认使用 NodeHttp2Handler，后者基于 `http2` 模块，不支持 http agent。
				// 使用 NodeHttpHandler 来支持 HTTP(S) 代理 agent。
				config.requestHandler = new NodeHttpHandler(proxyAgents);
			} else if (process.env.AWS_BEDROCK_FORCE_HTTP1 === "1") {
				// 某些自定义端点需要 HTTP/1.1 而非 HTTP/2
				config.requestHandler = new NodeHttpHandler();
			}
		} else {
			// 非 Node 环境（浏览器）：回退到 us-east-1，因为没有可用的配置文件解析。
			config.region =
				configuredRegion || (endpointRegion && useExplicitEndpoint ? endpointRegion : undefined) || "us-east-1";
		}

		if (useBearerToken) {
			config.token = { token: bearerToken };
			config.authSchemePreference = ["httpBearerAuth"];
		}

		try {
			const client = new BedrockRuntimeClient(config);
			const cacheRetention = resolveCacheRetention(options.cacheRetention);
			const inferenceMaxTokens = options.maxTokens ?? (isAnthropicClaudeModel(model) ? model.maxTokens : undefined);
			let commandInput = {
				modelId: model.id,
				messages: convertMessages(context, model, cacheRetention),
				system: buildSystemPrompt(context.systemPrompt, model, cacheRetention),
				inferenceConfig: {
					...(inferenceMaxTokens !== undefined && { maxTokens: inferenceMaxTokens }),
					...(options.temperature !== undefined && { temperature: options.temperature }),
				},
				toolConfig: convertToolConfig(context.tools, options.toolChoice),
				additionalModelRequestFields: buildAdditionalModelRequestFields(model, options),
				...(options.requestMetadata !== undefined && { requestMetadata: options.requestMetadata }),
			};
			const nextCommandInput = await options?.onPayload?.(commandInput, model);
			if (nextCommandInput !== undefined) {
				commandInput = nextCommandInput as typeof commandInput;
			}
			const command = new ConverseStreamCommand(commandInput);

			const response = await client.send(command, { abortSignal: options.signal });
			if (response.$metadata.httpStatusCode !== undefined) {
				const responseHeaders: Record<string, string> = {};
				if (response.$metadata.requestId) {
					responseHeaders["x-amzn-requestid"] = response.$metadata.requestId;
				}
				await options?.onResponse?.({ status: response.$metadata.httpStatusCode, headers: responseHeaders }, model);
			}

			for await (const item of response.stream!) {
				if (item.messageStart) {
					if (item.messageStart.role !== ConversationRole.ASSISTANT) {
						throw new Error("意料之外的助手消息开始，但收到了用户消息开始");
					}
					stream.push({ type: "start", partial: output });
				} else if (item.contentBlockStart) {
					handleContentBlockStart(item.contentBlockStart, blocks, output, stream);
				} else if (item.contentBlockDelta) {
					handleContentBlockDelta(item.contentBlockDelta, blocks, output, stream);
				} else if (item.contentBlockStop) {
					handleContentBlockStop(item.contentBlockStop, blocks, output, stream);
				} else if (item.messageStop) {
					output.stopReason = mapStopReason(item.messageStop.stopReason);
				} else if (item.metadata) {
					handleMetadata(item.metadata, model, output);
				} else if (item.internalServerException) {
					throw item.internalServerException;
				} else if (item.modelStreamErrorException) {
					throw item.modelStreamErrorException;
				} else if (item.validationException) {
					throw item.validationException;
				} else if (item.throttlingException) {
					throw item.throttlingException;
				} else if (item.serviceUnavailableException) {
					throw item.serviceUnavailableException;
				}
			}

			if (options.signal?.aborted) {
				throw new Error("请求已中止");
			}

			if (output.stopReason === "error" || output.stopReason === "aborted") {
				throw new Error("发生未知错误");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				delete (block as Block).index;
				// partialJson 只是流式处理的临时缓冲区，不会持久化。
				delete (block as Block).partialJson;
			}
			output.stopReason = options.signal?.aborted ? "aborted" : "error";
			output.errorMessage = formatBedrockError(error);
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

/**
 * Bedrock SDK 异常名称的人类可读前缀。
 * 下游的 agent-session 重试逻辑会匹配 `server.?error` 和 `service.?unavailable` 这样的模式，
 * 因此我们保留传统的错误前缀格式，而不使用原始的 SDK 异常名称。
 */
const BEDROCK_ERROR_PREFIXES: Record<string, string> = {
	InternalServerException: "内部服务器错误",
	ModelStreamErrorException: "模型流错误",
	ValidationException: "验证错误",
	ThrottlingException: "限流错误",
	ServiceUnavailableException: "服务不可用",
};

/**
 * 使用人类可读前缀格式化 Bedrock 错误。
 * AWS SDK 异常（来自 `client.send()` 以及流事件项）都继承自 BedrockRuntimeServiceException。
 * 我们将 `.name` 映射到稳定的人类可读前缀，以便下游消费者（重试逻辑、上下文溢出检测）可以通过简单的字符串匹配来区分错误类别。
 */
function formatBedrockError(error: unknown): string {
	const message = error instanceof Error ? error.message : JSON.stringify(error);
	if (error instanceof BedrockRuntimeServiceException) {
		const prefix = BEDROCK_ERROR_PREFIXES[error.name] ?? error.name;
		return `${prefix}: ${message}`;
	}
	return message;
}

export const streamSimpleBedrock: StreamFunction<"bedrock-converse-stream", SimpleStreamOptions> = (
	model: Model<"bedrock-converse-stream">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const base = buildBaseOptions(model, options, undefined);
	if (!options?.reasoning) {
		return streamBedrock(model, context, { ...base, reasoning: undefined } satisfies BedrockOptions);
	}

	if (isAnthropicClaudeModel(model)) {
		if (supportsAdaptiveThinking(model.id, model.name)) {
			return streamBedrock(model, context, {
				...base,
				reasoning: options.reasoning,
				thinkingBudgets: options.thinkingBudgets,
			} satisfies BedrockOptions);
		}

		// Undefined 表示调用者没有请求输出上限；让辅助函数使用模型上限。
		// 不要强制设为 0，否则思考预算将占用整个 maxTokens 值。
		const adjusted = adjustMaxTokensForThinking(
			base.maxTokens,
			model.maxTokens,
			options.reasoning,
			options.thinkingBudgets,
		);

		return streamBedrock(model, context, {
			...base,
			maxTokens: adjusted.maxTokens,
			reasoning: options.reasoning,
			thinkingBudgets: {
				...(options.thinkingBudgets || {}),
				[clampReasoning(options.reasoning)!]: adjusted.thinkingBudget,
			},
		} satisfies BedrockOptions);
	}

	return streamBedrock(model, context, {
		...base,
		reasoning: options.reasoning,
		thinkingBudgets: options.thinkingBudgets,
	} satisfies BedrockOptions);
};

function handleContentBlockStart(
	event: ContentBlockStartEvent,
	blocks: Block[],
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
): void {
	const index = event.contentBlockIndex!;
	const start = event.start;

	if (start?.toolUse) {
		const block: Block = {
			type: "toolCall",
			id: start.toolUse.toolUseId || "",
			name: start.toolUse.name || "",
			arguments: {},
			partialJson: "",
			index,
		};
		output.content.push(block);
		stream.push({ type: "toolcall_start", contentIndex: blocks.length - 1, partial: output });
	}
}

function handleContentBlockDelta(
	event: ContentBlockDeltaEvent,
	blocks: Block[],
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
): void {
	const contentBlockIndex = event.contentBlockIndex!;
	const delta = event.delta;
	let index = blocks.findIndex((b) => b.index === contentBlockIndex);
	let block = blocks[index];

	if (delta?.text !== undefined) {
		// 如果还不存在文本块，则创建一个，因为 `handleContentBlockStart` 不会为文本块发送
		if (!block) {
			const newBlock: Block = { type: "text", text: "", index: contentBlockIndex };
			output.content.push(newBlock);
			index = blocks.length - 1;
			block = blocks[index];
			stream.push({ type: "text_start", contentIndex: index, partial: output });
		}
		if (block.type === "text") {
			block.text += delta.text;
			stream.push({ type: "text_delta", contentIndex: index, delta: delta.text, partial: output });
		}
	} else if (delta?.toolUse && block?.type === "toolCall") {
		block.partialJson = (block.partialJson || "") + (delta.toolUse.input || "");
		block.arguments = parseStreamingJson(block.partialJson);
		stream.push({ type: "toolcall_delta", contentIndex: index, delta: delta.toolUse.input || "", partial: output });
	} else if (delta?.reasoningContent) {
		let thinkingBlock = block;
		let thinkingIndex = index;

		if (!thinkingBlock) {
			const newBlock: Block = { type: "thinking", thinking: "", thinkingSignature: "", index: contentBlockIndex };
			output.content.push(newBlock);
			thinkingIndex = blocks.length - 1;
			thinkingBlock = blocks[thinkingIndex];
			stream.push({ type: "thinking_start", contentIndex: thinkingIndex, partial: output });
		}

		if (thinkingBlock?.type === "thinking") {
			if (delta.reasoningContent.text) {
				thinkingBlock.thinking += delta.reasoningContent.text;
				stream.push({
					type: "thinking_delta",
					contentIndex: thinkingIndex,
					delta: delta.reasoningContent.text,
					partial: output,
				});
			}
			if (delta.reasoningContent.signature) {
				thinkingBlock.thinkingSignature =
					(thinkingBlock.thinkingSignature || "") + delta.reasoningContent.signature;
			}
		}
	}
}

function handleMetadata(
	event: ConverseStreamMetadataEvent,
	model: Model<"bedrock-converse-stream">,
	output: AssistantMessage,
): void {
	if (event.usage) {
		output.usage.input = event.usage.inputTokens || 0;
		output.usage.output = event.usage.outputTokens || 0;
		output.usage.cacheRead = event.usage.cacheReadInputTokens || 0;
		output.usage.cacheWrite = event.usage.cacheWriteInputTokens || 0;
		output.usage.totalTokens = event.usage.totalTokens || output.usage.input + output.usage.output;
		calculateCost(model, output.usage);
	}
}

function handleContentBlockStop(
	event: ContentBlockStopEvent,
	blocks: Block[],
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
): void {
	const index = blocks.findIndex((b) => b.index === event.contentBlockIndex);
	const block = blocks[index];
	if (!block) return;
	delete (block as Block).index;

	switch (block.type) {
		case "text":
			stream.push({ type: "text_end", contentIndex: index, content: block.text, partial: output });
			break;
		case "thinking":
			stream.push({ type: "thinking_end", contentIndex: index, content: block.thinking, partial: output });
			break;
		case "toolCall":
			block.arguments = parseStreamingJson(block.partialJson);
			// 就地完成并清除临时缓冲区，以便重放时只携带解析后的参数。
			delete (block as Block).partialJson;
			stream.push({ type: "toolcall_end", contentIndex: index, toolCall: block, partial: output });
			break;
	}
}

/**
 * 检查模型是否支持自适应思考（Opus 4.6+, Sonnet 4.6）。
 * 同时检查 model ID 和 model name，以支持其 ARN 不包含模型名称的应用程序推理配置文件。
 */
function getModelMatchCandidates(modelId: string, modelName?: string): string[] {
	const values = modelName ? [modelId, modelName] : [modelId];
	return values.flatMap((value) => {
		const lower = value.toLowerCase();
		return [lower, lower.replace(/[\s_.:]+/g, "-")];
	});
}

function supportsAdaptiveThinking(modelId: string, modelName?: string): boolean {
	const candidates = getModelMatchCandidates(modelId, modelName);
	return candidates.some((s) => s.includes("opus-4-6") || s.includes("opus-4-7") || s.includes("sonnet-4-6"));
}

function supportsNativeXhighEffort(model: Model<"bedrock-converse-stream">): boolean {
	const candidates = getModelMatchCandidates(model.id, model.name);
	return candidates.some((s) => s.includes("opus-4-7"));
}

function mapThinkingLevelToEffort(
	model: Model<"bedrock-converse-stream">,
	level: SimpleStreamOptions["reasoning"],
): "low" | "medium" | "high" | "xhigh" | "max" {
	if (level === "xhigh" && supportsNativeXhighEffort(model)) return "xhigh";

	const mapped = level ? model.thinkingLevelMap?.[level] : undefined;
	if (typeof mapped === "string") return mapped as "low" | "medium" | "high" | "xhigh" | "max";

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

/**
 * 解析缓存保留偏好。
 * 默认值为 "short"，并出于向后兼容性使用 PI_CACHE_RETENTION。
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

/**
 * 检查模型是否为 Bedrock 上的 Anthropic Claude 模型。
 * 同时检查 model ID 和 model name，以支持其 ARN 不包含模型名称的应用程序推理配置文件。
 */
function isAnthropicClaudeModel(model: Model<"bedrock-converse-stream">): boolean {
	const id = model.id.toLowerCase();
	const name = model.name?.toLowerCase() ?? "";
	return (
		id.includes("anthropic.claude") ||
		id.includes("anthropic/claude") ||
		name.includes("anthropic.claude") ||
		name.includes("anthropic/claude") ||
		name.includes("claude")
	);
}

/**
 * 检查模型是否支持提示缓存。
 * 支持：Claude 3.5 Haiku、Claude 3.7 Sonnet、Claude 4.x 模型
 *
 * 对于基础模型和系统定义的推理配置文件，模型 ID/ARN 包含模型名称，因此我们可以在本地判断。
 *
 * 对于应用程序推理配置文件（其 ARN 不包含模型名称），也会检查 model.name（通过 models.json 或 registerProvider 由用户控制）。
 * 作为最后手段，设置 AWS_BEDROCK_FORCE_CACHE=1 以启用缓存点。
 * Amazon Nova 模型具有自动缓存功能，不需要显式缓存点。
 */
function supportsPromptCaching(model: Model<"bedrock-converse-stream">): boolean {
	const candidates = getModelMatchCandidates(model.id, model.name);

	const hasClaudeRef = candidates.some((s) => s.includes("claude"));
	if (!hasClaudeRef) {
		// 应用程序推理配置文件的 ARN 不包含模型名称。
		// 允许用户通过环境变量强制启用缓存点。
		if (typeof process !== "undefined" && process.env.AWS_BEDROCK_FORCE_CACHE === "1") return true;
		return false;
	}
	// Claude 4.x 模型（opus-4, sonnet-4, haiku-4）
	if (candidates.some((s) => s.includes("-4-"))) return true;
	// Claude 3.7 Sonnet
	if (candidates.some((s) => s.includes("claude-3-7-sonnet"))) return true;
	// Claude 3.5 Haiku
	if (candidates.some((s) => s.includes("claude-3-5-haiku"))) return true;
	return false;
}

/**
 * 检查模型是否支持 reasoningContent 中的思考签名。
 * 只有 Anthropic Claude 模型支持签名字段。
 * 其他模型（OpenAI、Qwen、Minimax、Moonshot 等）会拒绝它并返回错误：
 * "This model doesn't support the reasoningContent.reasoningText.signature field"
 *
 * 同时检查 model ID 和 model name，以支持应用程序推理配置文件。
 */
function supportsThinkingSignature(model: Model<"bedrock-converse-stream">): boolean {
	return isAnthropicClaudeModel(model);
}

function buildSystemPrompt(
	systemPrompt: string | undefined,
	model: Model<"bedrock-converse-stream">,
	cacheRetention: CacheRetention,
): SystemContentBlock[] | undefined {
	if (!systemPrompt) return undefined;

	const blocks: SystemContentBlock[] = [{ text: sanitizeSurrogates(systemPrompt) }];

	// 当缓存启用时，为支持的 Claude 模型添加缓存点
	if (cacheRetention !== "none" && supportsPromptCaching(model)) {
		blocks.push({
			cachePoint: { type: CachePointType.DEFAULT, ...(cacheRetention === "long" ? { ttl: CacheTTL.ONE_HOUR } : {}) },
		});
	}

	return blocks;
}

function normalizeToolCallId(id: string): string {
	const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_");
	return sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
}

function convertMessages(
	context: Context,
	model: Model<"bedrock-converse-stream">,
	cacheRetention: CacheRetention,
): Message[] {
	const result: Message[] = [];
	const transformedMessages = transformMessages(context.messages, model, normalizeToolCallId);

	for (let i = 0; i < transformedMessages.length; i++) {
		const m = transformedMessages[i];

		switch (m.role) {
			case "user": {
				const content: ContentBlock[] = [];
				if (typeof m.content === "string") {
					content.push({ text: sanitizeSurrogates(m.content) });
				} else {
					for (const c of m.content) {
						switch (c.type) {
							case "text":
								content.push({ text: sanitizeSurrogates(c.text) });
								break;
							case "image":
								content.push({ image: createImageBlock(c.mimeType, c.data) });
								break;
							default:
								continue;
						}
					}
				}
				if (content.length === 0) continue;
				result.push({
					role: ConversationRole.USER,
					content,
				});
				break;
			}
			case "assistant": {
				// 跳过内容为空的助手消息（例如来自中止的请求）
				// Bedrock 拒绝内容数组为空的消息
				if (m.content.length === 0) {
					continue;
				}
				const contentBlocks: ContentBlock[] = [];
				for (const c of m.content) {
					switch (c.type) {
						case "text":
							// 跳过空文本块
							if (c.text.trim().length === 0) continue;
							contentBlocks.push({ text: sanitizeSurrogates(c.text) });
							break;
						case "toolCall":
							contentBlocks.push({
								toolUse: { toolUseId: c.id, name: c.name, input: c.arguments },
							});
							break;
						case "thinking":
							// 跳过空思考块
							if (c.thinking.trim().length === 0) continue;
							// 只有 Anthropic 模型支持 reasoningText 中的签名字段。
							// 对于其他模型，我们省略签名以避免出现以下错误：
							// "This model doesn't support the reasoningContent.reasoningText.signature field"
							if (supportsThinkingSignature(model)) {
								// 签名在思考增量之后到达。如果部分或外部
								// 持久化的消息缺少签名，Bedrock 会拒绝重放的
								// 推理块。回退到纯文本，与 Anthropic 一致。
								if (!c.thinkingSignature || c.thinkingSignature.trim().length === 0) {
									contentBlocks.push({ text: sanitizeSurrogates(c.thinking) });
								} else {
									contentBlocks.push({
										reasoningContent: {
											reasoningText: {
												text: sanitizeSurrogates(c.thinking),
												signature: c.thinkingSignature,
											},
										},
									});
								}
							} else {
								contentBlocks.push({
									reasoningContent: {
										reasoningText: { text: sanitizeSurrogates(c.thinking) },
									},
								});
							}
							break;
						default:
							continue;
					}
				}
				// 如果所有内容块都被过滤掉则跳过
				if (contentBlocks.length === 0) {
					continue;
				}
				result.push({
					role: ConversationRole.ASSISTANT,
					content: contentBlocks,
				});
				break;
			}
			case "toolResult": {
				// 将所有连续的 toolResult 消息合并为一条用户消息
				// Bedrock 要求所有工具结果都在一条消息中
				const toolResults: ContentBlock.ToolResultMember[] = [];

				// 添加当前工具结果，包含所有内容块
				toolResults.push({
					toolResult: {
						toolUseId: m.toolCallId,
						content: m.content.map((c) =>
							c.type === "image"
								? { image: createImageBlock(c.mimeType, c.data) }
								: { text: sanitizeSurrogates(c.text) },
						),
						status: m.isError ? ToolResultStatus.ERROR : ToolResultStatus.SUCCESS,
					},
				});

				// 向前查找连续的 toolResult 消息
				let j = i + 1;
				while (j < transformedMessages.length && transformedMessages[j].role === "toolResult") {
					const nextMsg = transformedMessages[j] as ToolResultMessage;
					toolResults.push({
						toolResult: {
							toolUseId: nextMsg.toolCallId,
							content: nextMsg.content.map((c) =>
								c.type === "image"
									? { image: createImageBlock(c.mimeType, c.data) }
									: { text: sanitizeSurrogates(c.text) },
							),
							status: nextMsg.isError ? ToolResultStatus.ERROR : ToolResultStatus.SUCCESS,
						},
					});
					j++;
				}

				// 跳过已处理的消息
				i = j - 1;

				result.push({
					role: ConversationRole.USER,
					content: toolResults,
				});
				break;
			}
			default:
				continue;
		}
	}

	// 当缓存启用时，为支持的 Claude 模型的最后一条用户消息添加缓存点
	if (cacheRetention !== "none" && supportsPromptCaching(model) && result.length > 0) {
		const lastMessage = result[result.length - 1];
		if (lastMessage.role === ConversationRole.USER && lastMessage.content) {
			(lastMessage.content as ContentBlock[]).push({
				cachePoint: {
					type: CachePointType.DEFAULT,
					...(cacheRetention === "long" ? { ttl: CacheTTL.ONE_HOUR } : {}),
				},
			});
		}
	}

	return result;
}

function convertToolConfig(
	tools: Tool[] | undefined,
	toolChoice: BedrockOptions["toolChoice"],
): ToolConfiguration | undefined {
	if (!tools?.length || toolChoice === "none") return undefined;

	const bedrockTools: BedrockTool[] = tools.map((tool) => ({
		toolSpec: {
			name: tool.name,
			description: tool.description,
			inputSchema: { json: tool.parameters as unknown as DocumentType },
		},
	}));

	let bedrockToolChoice: ToolChoice | undefined;
	switch (toolChoice) {
		case "auto":
			bedrockToolChoice = { auto: {} };
			break;
		case "any":
			bedrockToolChoice = { any: {} };
			break;
		default:
			if (toolChoice?.type === "tool") {
				bedrockToolChoice = { tool: { name: toolChoice.name } };
			}
	}

	return { tools: bedrockTools, toolChoice: bedrockToolChoice };
}

function mapStopReason(reason: string | undefined): StopReason {
	switch (reason) {
		case BedrockStopReason.END_TURN:
		case BedrockStopReason.STOP_SEQUENCE:
			return "stop";
		case BedrockStopReason.MAX_TOKENS:
		case BedrockStopReason.MODEL_CONTEXT_WINDOW_EXCEEDED:
			return "length";
		case BedrockStopReason.TOOL_USE:
			return "toolUse";
		default:
			return "error";
	}
}

function getConfiguredBedrockRegion(options: BedrockOptions): string | undefined {
	if (typeof process === "undefined") {
		return options.region;
	}

	return options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || undefined;
}

function hasConfiguredBedrockProfile(): boolean {
	if (typeof process === "undefined") {
		return false;
	}

	return Boolean(process.env.AWS_PROFILE);
}

function getStandardBedrockEndpointRegion(baseUrl: string | undefined): string | undefined {
	if (!baseUrl) {
		return undefined;
	}

	try {
		const { hostname } = new URL(baseUrl);
		const match = hostname.toLowerCase().match(/^bedrock-runtime(?:-fips)?\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?$/);
		return match?.[1];
	} catch {
		return undefined;
	}
}

function shouldUseExplicitBedrockEndpoint(
	baseUrl: string,
	configuredRegion: string | undefined,
	hasConfiguredProfile: boolean,
): boolean {
	const endpointRegion = getStandardBedrockEndpointRegion(baseUrl);
	if (!endpointRegion) {
		return true;
	}

	return !configuredRegion && !hasConfiguredProfile;
}

function isGovCloudBedrockTarget(model: Model<"bedrock-converse-stream">, options: BedrockOptions): boolean {
	const region = getConfiguredBedrockRegion(options);
	if (region?.toLowerCase().startsWith("us-gov-")) {
		return true;
	}

	const modelId = model.id.toLowerCase();
	return modelId.startsWith("us-gov.") || modelId.startsWith("arn:aws-us-gov:");
}

function buildAdditionalModelRequestFields(
	model: Model<"bedrock-converse-stream">,
	options: BedrockOptions,
): Record<string, any> | undefined {
	if (!options.reasoning || !model.reasoning) {
		return undefined;
	}

	if (isAnthropicClaudeModel(model)) {
		// GovCloud Bedrock 目前拒绝 Claude thinking.display 字段。
		// 在 GovCloud Converse 架构更新前，在此场景下省略该字段。
		const display = isGovCloudBedrockTarget(model, options) ? undefined : (options.thinkingDisplay ?? "summarized");
		const result: Record<string, any> = supportsAdaptiveThinking(model.id, model.name)
			? {
					thinking: { type: "adaptive", ...(display !== undefined ? { display } : {}) },
					output_config: { effort: mapThinkingLevelToEffort(model, options.reasoning) },
				}
			: (() => {
					const defaultBudgets: Record<ThinkingLevel, number> = {
						minimal: 1024,
						low: 2048,
						medium: 8192,
						high: 16384,
						xhigh: 16384, // Claude 不支持 xhigh，限制为 high
					};

					// 自定义预算覆盖默认值（xhigh 不在 ThinkingBudgets 中，使用 high）
					const level = options.reasoning === "xhigh" ? "high" : options.reasoning;
					const budget = options.thinkingBudgets?.[level] ?? defaultBudgets[options.reasoning];

					return {
						thinking: {
							type: "enabled",
							budget_tokens: budget,
							...(display !== undefined ? { display } : {}),
						},
					};
				})();

		if (!supportsAdaptiveThinking(model.id, model.name) && (options.interleavedThinking ?? true)) {
			result.anthropic_beta = ["interleaved-thinking-2025-05-14"];
		}

		return result;
	}

	return undefined;
}

function createImageBlock(mimeType: string, data: string) {
	let format: ImageFormat;
	switch (mimeType) {
		case "image/jpeg":
		case "image/jpg":
			format = ImageFormat.JPEG;
			break;
		case "image/png":
			format = ImageFormat.PNG;
			break;
		case "image/gif":
			format = ImageFormat.GIF;
			break;
		case "image/webp":
			format = ImageFormat.WEBP;
			break;
		default:
			throw new Error(`未知图片类型：${mimeType}`);
	}

	const binaryString = atob(data);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	return { source: { bytes }, format };
}
