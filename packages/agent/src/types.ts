import type {
	AssistantMessage,
	AssistantMessageEvent,
	ImageContent,
	Message,
	Model,
	SimpleStreamOptions,
	streamSimple,
	TextContent,
	Tool,
	ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";

/**
 * 代理循环使用的流式函数。
 *
 * 约定：
 * - 对于请求/模型/运行时失败，不得抛出异常或返回被拒绝的Promise。
 * - 必须返回一个AssistantMessageEventStream。
 * - 失败必须通过协议事件编码在返回的流中，并以一个stopReason为"error"或"aborted"且带有errorMessage的最终AssistantMessage结束。
 */
export type StreamFn = (
	...args: Parameters<typeof streamSimple>
) => ReturnType<typeof streamSimple> | Promise<ReturnType<typeof streamSimple>>;

/**
 * 单个助手消息的工具调用执行方式配置。
 *
 * - "sequential"：每个工具调用依次准备、执行和完成，然后才开始下一个。
 * - "parallel"：工具调用按顺序准备，然后允许的工具并发执行。
 *   `tool_execution_end` 按照每个工具完成后的顺序发出，
 *   而工具结果消息工件稍后按助手源顺序发出。
 */
export type ToolExecutionMode = "sequential" | "parallel";

/**
 * 控制当代理循环到达队列耗尽点时注入多少排队用户消息。
 *
 * - "all"：在该点耗尽并注入所有排队的消息。
 * - "one-at-a-time"：仅耗尽并注入最旧的一条排队消息，其余消息保留在队列中供后续耗尽点使用。
 */
export type QueueMode = "all" | "one-at-a-time";

/** 助手消息发出的单个工具调用内容块。 */
export type AgentToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;

/**
 * `beforeToolCall` 返回的结果。
 *
 * 返回 `{ block: true }` 可阻止工具执行。循环会改为发出一个错误工具结果。
 * `reason` 成为该错误结果中显示的文本。如果省略，则使用默认的阻止消息。
 */
export interface BeforeToolCallResult {
	block?: boolean;
	reason?: string;
}

/**
 * `afterToolCall` 返回的部分覆盖。
 *
 * 合并语义是逐字段的：
 * - `content`：如果提供，则完全替换工具结果的内容数组
 * - `details`：如果提供，则完全替换工具结果的详细信息值
 * - `isError`：如果提供，则替换工具结果的错误标志
 * - `terminate`：如果提供，则替换提前终止提示
 *
 * 省略的字段保留原始执行的工具结果值。
 * 对于 `content` 或 `details` 不会进行深度合并。
 */
export interface AfterToolCallResult {
	content?: (TextContent | ImageContent)[];
	details?: unknown;
	isError?: boolean;
	/**
	 * 提示代理应在当前工具批次后停止。
	 * 仅当批次中每个最终确定的工具结果都将此项设置为 true 时，才会提前终止。
	 */
	terminate?: boolean;
}

/** 传递给 `beforeToolCall` 的上下文。 */
export interface BeforeToolCallContext {
	/** 请求工具调用的助手消息。 */
	assistantMessage: AssistantMessage;
	/** 来自 `assistantMessage.content` 的原始工具调用块。 */
	toolCall: AgentToolCall;
	/** 经过验证的、针对目标工具模式的工具参数。 */
	args: unknown;
	/** 准备工具调用时的当前代理上下文。 */
	context: AgentContext;
}

/** 传递给 `afterToolCall` 的上下文。 */
export interface AfterToolCallContext {
	/** 请求工具调用的助手消息。 */
	assistantMessage: AssistantMessage;
	/** 来自 `assistantMessage.content` 的原始工具调用块。 */
	toolCall: AgentToolCall;
	/** 经过验证的、针对目标工具模式的工具参数。 */
	args: unknown;
	/** 应用任何 `afterToolCall` 覆盖之前的已执行工具结果。 */
	result: AgentToolResult<any>;
	/** 当前已执行工具结果是否被视为错误。 */
	isError: boolean;
	/** 最终确定工具调用时的当前代理上下文。 */
	context: AgentContext;
}

/** 传递给 `shouldStopAfterTurn` 的上下文。 */
export interface ShouldStopAfterTurnContext {
	/** 完成该轮的助手消息。 */
	message: AssistantMessage;
	/** 传递给前面的 `turn_end` 事件的工具结果消息。 */
	toolResults: ToolResultMessage[];
	/** 在该轮的助手消息和工具结果追加后的当前代理上下文。 */
	context: AgentContext;
	/** 如果循环此时退出将返回的消息。提示运行包括初始提示消息；继续运行不包括已存在的上下文消息。 */
	newMessages: AgentMessage[];
}

/** 代理循环在开始另一个提供者请求之前使用的替换运行时状态。 */
export interface AgentLoopTurnUpdate {
	/** 下一个提供者请求的上下文。 */
	context?: AgentContext;
	/** 下一个提供者请求的模型。 */
	model?: Model<any>;
	/** 下一个提供者请求的思考级别。 */
	thinkingLevel?: ThinkingLevel;
}

export interface PrepareNextTurnContext extends ShouldStopAfterTurnContext {}

export interface AgentLoopConfig extends SimpleStreamOptions {
	model: Model<any>;

	/**
	 * 在每次LLM调用前将 AgentMessage[] 转换为 LLM 兼容的 Message[]。
	 *
	 * 每个 AgentMessage 必须转换为 LLM 能够理解的 UserMessage、AssistantMessage 或 ToolResultMessage。
	 * 无法转换的 AgentMessage（例如仅用于UI的通知、状态消息）应被过滤掉。
	 *
	 * 约定：不得抛出异常或拒绝。应返回一个安全的备用值。
	 * 抛出异常会中断底层代理循环，而不产生正常的事件序列。
	 *
	 * @example
	 * ```typescript
	 * convertToLlm: (messages) => messages.flatMap(m => {
	 *   if (m.role === "custom") {
	 *     // 将自定义消息转换为用户消息
	 *     return [{ role: "user", content: m.content, timestamp: m.timestamp }];
	 *   }
	 *   if (m.role === "notification") {
	 *     // 过滤掉仅用于UI的消息
	 *     return [];
	 *   }
	 *   // 透传标准的LLM消息
	 *   return [m];
	 * })
	 * ```
	 */
	convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;

	/**
	 * 在 `convertToLlm` 之前应用于上下文的可选转换。
	 *
	 * 用于在 AgentMessage 级别进行的操作：
	 * - 上下文窗口管理（裁剪旧消息）
	 * - 从外部来源注入上下文
	 *
	 * 约定：不得抛出异常或拒绝。返回原始消息或其他安全的备用值。
	 *
	 * @example
	 * ```typescript
	 * transformContext: async (messages) => {
	 *   if (estimateTokens(messages) > MAX_TOKENS) {
	 *     return pruneOldMessages(messages);
	 *   }
	 *   return messages;
	 * }
	 * ```
	 */
	transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;

	/**
	 * 为每次LLM调用动态解析API密钥。
	 *
	 * 对于生命周期较短的OAuth令牌（例如GitHub Copilot）很有用，这些令牌可能在长时间运行的工具执行阶段过期。
	 *
	 * 约定：不得抛出异常或拒绝。当没有可用密钥时返回 undefined。
	 */
	getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;

	/**
	 * 在每轮完全完成并发出 `turn_end` 后调用。
	 *
	 * 如果返回 true，则循环发出 `agent_end` 并在轮询引导或后续消息队列之前退出，而不启动另一个LLM调用。
	 * 当前的助手响应和任何工具执行都正常完成。
	 *
	 * 使用此方法在当轮后请求优雅停止，例如在上下文变得过于拥挤之前。
	 *
	 * 约定：不得抛出异常或拒绝。抛出异常会中断底层代理循环，而不产生正常的事件序列。
	 */
	shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>;

	/**
	 * 在 `turn_end` 之后、循环决定是否应开始另一个提供者请求之前调用。
	 * 返回替换的上下文/模型/思考状态，以影响此运行中的下一轮。
	 * 返回 undefined 以继续使用当前的上下文/配置。
	 */
	prepareNextTurn?: (
		context: PrepareNextTurnContext,
	) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>;

	/**
	 * 返回在运行过程中注入到对话中的引导消息。
	 *
	 * 在当前助手轮执行完其工具调用后调用，除非 `shouldStopAfterTurn` 先退出。
	 * 如果返回消息，它们会在下一次LLM调用之前被添加到上下文中。
	 * 当前助手消息中的工具调用不会被跳过。
	 *
	 * 用于在代理工作时“引导”代理。
	 *
	 * 约定：不得抛出异常或拒绝。当没有引导消息可用时返回 []。
	 */
	getSteeringMessages?: () => Promise<AgentMessage[]>;

	/**
	 * 返回在代理本应停止之后需要处理的后续消息。
	 *
	 * 当代理没有更多工具调用且没有引导消息时调用。
	 * 如果返回消息，它们会被添加到上下文中，并且代理
	 * 继续执行另一轮。
	 *
	 * 用于应等到代理完成之后再处理的后续消息。
	 *
	 * 约定：不得抛出异常或拒绝。当没有后续消息可用时返回 []。
	 */
	getFollowUpMessages?: () => Promise<AgentMessage[]>;

	/**
	 * 工具执行模式。
	 * - "sequential"：逐个执行工具调用
	 * - "parallel"：顺序预检工具调用，然后并发执行允许的工具；
	 *   按照每个工具完成后的顺序发出 `tool_execution_end`，
	 *   然后稍后按助手源顺序发出工具结果消息工件。
	 *
	 * 默认值："parallel"
	 */
	toolExecution?: ToolExecutionMode;

	/**
	 * 在参数验证之后、工具执行之前调用。
	 *
	 * 返回 `{ block: true }` 可阻止执行。循环会改为发出一个错误工具结果。
	 * 钩子接收代理的取消信号，并有责任遵守它。
	 */
	beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;

	/**
	 * 在工具完成执行后、`tool_execution_end` 和工具结果消息事件发出之前调用。
	 *
	 * 返回一个 `AfterToolCallResult` 覆盖已执行工具结果的部分内容：
	 * - `content` 替换完整的内容数组
	 * - `details` 替换完整的详细信息载荷
	 * - `isError` 替换错误标志
	 * - `terminate` 替换提前终止提示
	 *
	 * 任何省略的字段都保留其原始值。不执行深度合并。
	 * 钩子接收代理的取消信号，并有责任遵守它。
	 */
	afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
}

/**
 * 支持推理的模型的思考/推理级别。
 * 注意："xhigh" 仅受选定的模型系列支持。使用来自 @earendil-works/pi-ai 的模型思考级别元数据
 * 以检测具体模型的支持情况。
 */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

/**
 * 用于自定义应用消息的可扩展接口。
 * 应用可以通过声明合并进行扩展：
 *
 * @example
 * ```typescript
 * declare module "@mariozechner/agent" {
 *   interface CustomAgentMessages {
 *     artifact: ArtifactMessage;
 *     notification: NotificationMessage;
 *   }
 * }
 * ```
 */
export interface CustomAgentMessages {
	// 默认空 - 应用通过声明合并进行扩展
}

/**
 * AgentMessage：LLM消息与自定义消息的联合。
 * 此抽象允许应用添加自定义消息类型，同时保持
 * 类型安全性和与基础LLM消息的兼容性。
 */
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];

/**
 * 公共代理状态。
 *
 * `tools` 和 `messages` 使用访问器属性，以便实现可以在存储前
 * 复制分配的数组。
 */
export interface AgentState {
	/** 每次模型请求发送的系统提示。 */
	systemPrompt: string;
	/** 用于未来轮的活跃模型。 */
	model: Model<any>;
	/** 未来轮的请求推理级别。 */
	thinkingLevel: ThinkingLevel;
	/** 可用工具。分配新数组会复制顶层数组。 */
	set tools(tools: AgentTool<any>[]);
	get tools(): AgentTool<any>[];
	/** 对话记录。分配新数组会复制顶层数组。 */
	set messages(messages: AgentMessage[]);
	get messages(): AgentMessage[];
	/**
	 * 当代理正在处理提示或继续时返回 true。
	 *
	 * 在等待的 `agent_end` 监听器稳定之前，此值保持为 true。
	 */
	readonly isStreaming: boolean;
	/** 当前流式响应的部分助手消息（如果有）。 */
	readonly streamingMessage?: AgentMessage;
	/** 当前正在执行的工具调用ID。 */
	readonly pendingToolCalls: ReadonlySet<string>;
	/** 最近一次失败或中止的助手轮的错误消息（如果有）。 */
	readonly errorMessage?: string;
}

/** 工具产生的最终或部分结果。 */
export interface AgentToolResult<T> {
	/** 返回给模型的文本或图像内容。 */
	content: (TextContent | ImageContent)[];
	/** 用于日志或UI渲染的任意结构化详细信息。 */
	details: T;
	/**
	 * 提示代理应在当前工具批次后停止。
	 * 仅当批次中每个最终确定的工具结果都将此项设置为 true 时，才会提前终止。
	 */
	terminate?: boolean;
}

/** 工具用于流式传输部分执行更新的回调。 */
export type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;

/** 代理运行时使用的工具定义。 */
export interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> extends Tool<TParameters> {
	/** 用于UI显示的人类可读标签。 */
	label: string;
	/**
	 * 可选的兼容性垫片，用于在模式验证前处理原始工具调用参数。
	 * 必须返回一个匹配 `TParameters` 的对象。
	 */
	prepareArguments?: (args: unknown) => Static<TParameters>;
	/** 执行工具调用。失败时抛出异常，而不是将错误编码到 `content` 中。 */
	execute: (
		toolCallId: string,
		params: Static<TParameters>,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TDetails>,
	) => Promise<AgentToolResult<TDetails>>;
	/**
	 * 每个工具的执行模式覆盖。
	 * - "sequential"：此工具必须与其他工具调用逐一执行。
	 * - "parallel"：此工具可以与其他工具调用并发执行。
	 *
	 * 如果省略，则应用默认执行模式。
	 */
	executionMode?: ToolExecutionMode;
}

/** 传入底层代理循环的上下文快照。 */
export interface AgentContext {
	/** 包含在请求中的系统提示。 */
	systemPrompt: string;
	/** 模型可见的记录。 */
	messages: AgentMessage[];
	/** 此运行可用的工具。 */
	tools?: AgentTool<any>[];
}

/**
 * 代理发出的事件，用于UI更新。
 *
 * `agent_end` 是运行发出的最后一个事件，但被等待的 `Agent.subscribe()`
 * 监听器仍然是运行结算的一部分。代理只有在这些监听器完成后
 * 才会变为空闲状态。
 */
export type AgentEvent =
	// 代理生命周期
	| { type: "agent_start" }
	| { type: "agent_end"; messages: AgentMessage[] }
	// 轮生命周期 - 一轮包含一个助手响应 + 任何工具调用/结果
	| { type: "turn_start" }
	| { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
	// 消息生命周期 - 为用户、助手和工具结果消息发出
	| { type: "message_start"; message: AgentMessage }
	// 仅流式传输期间为助手消息发出
	| { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
	| { type: "message_end"; message: AgentMessage }
	// 工具执行生命周期
	| { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
	| { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
	| { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
