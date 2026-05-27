/**
 * 扩展系统类型。
 *
 * 扩展是 TypeScript 模块，可以：
 * - 订阅代理生命周期事件
 * - 注册 LLM 可调用的工具
 * - 注册命令、键盘快捷键和 CLI 标志
 * - 通过 UI 原语与用户交互
 */

import type {
	AgentMessage,
	AgentToolResult,
	AgentToolUpdateCallback,
	ThinkingLevel,
	ToolExecutionMode,
} from "@earendil-works/pi-agent-core";
import type {
	Api,
	AssistantMessageEvent,
	AssistantMessageEventStream,
	Context,
	ImageContent,
	Model,
	OAuthCredentials,
	OAuthLoginCallbacks,
	SimpleStreamOptions,
	TextContent,
	ToolResultMessage,
} from "@earendil-works/pi-ai";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	Component,
	EditorComponent,
	EditorTheme,
	KeyId,
	OverlayHandle,
	OverlayOptions,
	TUI,
} from "@earendil-works/pi-tui";
import type { Static, TSchema } from "typebox";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import type { BashResult } from "../bash-executor.ts";
import type { CompactionPreparation, CompactionResult } from "../compaction/index.ts";
import type { EventBus } from "../event-bus.ts";
import type { ExecOptions, ExecResult } from "../exec.ts";
import type { ReadonlyFooterDataProvider } from "../footer-data-provider.ts";
import type { KeybindingsManager } from "../keybindings.ts";
import type { CustomMessage } from "../messages.ts";
import type { ModelRegistry } from "../model-registry.ts";
import type {
	BranchSummaryEntry,
	CompactionEntry,
	ReadonlySessionManager,
	SessionEntry,
	SessionManager,
} from "../session-manager.ts";
import type { SlashCommandInfo } from "../slash-commands.ts";
import type { SourceInfo } from "../source-info.ts";
import type { BuildSystemPromptOptions } from "../system-prompt.ts";
import type { BashOperations } from "../tools/bash.ts";
import type { EditToolDetails } from "../tools/edit.ts";
import type {
	BashToolDetails,
	BashToolInput,
	EditToolInput,
	FindToolDetails,
	FindToolInput,
	GrepToolDetails,
	GrepToolInput,
	LsToolDetails,
	LsToolInput,
	ReadToolDetails,
	ReadToolInput,
	WriteToolInput,
} from "../tools/index.ts";

export type { ExecOptions, ExecResult } from "../exec.ts";
export type { BuildSystemPromptOptions } from "../system-prompt.ts";
export type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode };
export type { AppKeybinding, KeybindingsManager } from "../keybindings.ts";

// ============================================================================
// UI 上下文
// ============================================================================

/** 扩展 UI 对话框的选项。 */
export interface ExtensionUIDialogOptions {
	/** 用于以编程方式关闭对话框的 AbortSignal。 */
	signal?: AbortSignal;
	/** 超时时间（毫秒）。对话框自动关闭并显示实时倒计时。 */
	timeout?: number;
}

/** 扩展小部件的放置位置。 */
export type WidgetPlacement = "aboveEditor" | "belowEditor";

/** 扩展小部件的选项。 */
export interface ExtensionWidgetOptions {
	/** 小部件的渲染位置。默认为 "aboveEditor"。 */
	placement?: WidgetPlacement;
}

/** 扩展的原始终端输入监听器。 */
export type TerminalInputHandler = (data: string) => { consume?: boolean; data?: string } | undefined;

/** 交互式流式加载器的忙碌指示器配置。 */
export interface WorkingIndicatorOptions {
	/** 动画帧。使用空数组完全隐藏指示器。自定义帧将原样渲染。 */
	frames?: string[];
	/** 动画指示器的帧间隔（毫秒）。 */
	intervalMs?: number;
}

/** 用额外行为包装当前的自动完成提供者。 */
export type AutocompleteProviderFactory = (current: AutocompleteProvider) => AutocompleteProvider;
export type EditorFactory = (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) => EditorComponent;

/**
 * 扩展用于请求交互式 UI 的 UI 上下文。
 * 每种模式（交互式、RPC、打印）提供自己的实现。
 */
export interface ExtensionUIContext {
	/** 显示选择器并返回用户的选择。 */
	select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined>;

	/** 显示确认对话框。 */
	confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean>;

	/** 显示文本输入对话框。 */
	input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined>;

	/** 向用户显示通知。 */
	notify(message: string, type?: "info" | "warning" | "error"): void;

	/** 监听原始终端输入（仅交互模式）。返回一个取消订阅函数。 */
	onTerminalInput(handler: TerminalInputHandler): () => void;

	/** 在底部栏/状态栏中设置状态文本。传入 undefined 清除。 */
	setStatus(key: string, text: string | undefined): void;

	/** 设置流式传输期间显示的忙碌/加载消息。不传参数则恢复默认。 */
	setWorkingMessage(message?: string): void;

	/** 显示或隐藏流式传输期间内置的交互式忙碌加载行。 */
	setWorkingVisible(visible: boolean): void;

	/**
	 * 配置流式传输期间显示的交互式忙碌指示器。
	 *
	 * - 省略参数以恢复默认的动画旋转圆点。
	 * - 使用 `frames: ["●"]` 作为静态指示器。
	 * - 使用 `frames: []` 完全隐藏指示器。
	 * - 自定义帧将原样渲染，因此扩展必须添加自己的颜色。
	 */
	setWorkingIndicator(options?: WorkingIndicatorOptions): void;

	/** 设置隐藏思考块的标签。不传参数则恢复默认。 */
	setHiddenThinkingLabel(label?: string): void;

	/** 设置要显示在编辑器上方或下方的小部件。接受字符串数组或组件工厂。 */
	setWidget(key: string, content: string[] | undefined, options?: ExtensionWidgetOptions): void;
	setWidget(
		key: string,
		content: ((tui: TUI, theme: Theme) => Component & { dispose?(): void }) | undefined,
		options?: ExtensionWidgetOptions,
	): void;

	/** 设置自定义底部栏组件，或传入 undefined 恢复内置底部栏。
	 *
	 * 工厂函数接收 FooterDataProvider 以获取其他方式无法访问的数据：
	 * Git 分支和来自 setStatus() 的扩展状态。令牌统计、模型信息
	 * 等可通过 ctx.sessionManager 和 ctx.model 获取。
	 */
	setFooter(
		factory:
			| ((tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => Component & { dispose?(): void })
			| undefined,
	): void;

	/** 设置自定义头部组件（启动时显示在聊天上方），或传入 undefined 恢复内置头部。 */
	setHeader(factory: ((tui: TUI, theme: Theme) => Component & { dispose?(): void }) | undefined): void;

	/** 设置终端窗口/标签页标题。 */
	setTitle(title: string): void;

	/** 显示一个具有键盘焦点的自定义组件。 */
	custom<T>(
		factory: (
			tui: TUI,
			theme: Theme,
			keybindings: KeybindingsManager,
			done: (result: T) => void,
		) => (Component & { dispose?(): void }) | Promise<Component & { dispose?(): void }>,
		options?: {
			overlay?: boolean;
			/** 覆盖层的定位/大小选项。可以是静态的或返回动态更新的函数。 */
			overlayOptions?: OverlayOptions | (() => OverlayOptions);
			/** 在覆盖层显示后调用，传入 overlay handle。用于控制可见性。 */
			onHandle?: (handle: OverlayHandle) => void;
		},
	): Promise<T>;

	/** 将文本粘贴到编辑器中，触发粘贴处理（大内容折叠）。 */
	pasteToEditor(text: string): void;

	/** 设置核心输入编辑器中的文本。 */
	setEditorText(text: string): void;

	/** 获取核心输入编辑器中的当前文本。 */
	getEditorText(): string;

	/** 显示一个用于文本编辑的多行编辑器。 */
	editor(title: string, prefill?: string): Promise<string | undefined>;

	/** 在内置自动完成提供者之上叠加额外的自动完成行为。 */
	addAutocompleteProvider(factory: AutocompleteProviderFactory): void;

	/**
	 * 通过工厂函数设置自定义编辑器组件。
	 * 传入 undefined 恢复默认编辑器。
	 *
	 * 工厂函数接收：
	 * - `theme`: 用于样式边框和自动完成的 EditorTheme
	 * - `keybindings`: 用于应用级按键绑定的 KeybindingsManager
	 *
	 * 要获得完整的应用按键绑定支持（escape、ctrl+d、模型切换等），
	 * 从 `@earendil-works/pi-coding-agent` 扩展 `CustomEditor` 并为你
	 * 不处理的按键调用 `super.handleInput(data)`。
	 *
	 * @example
	 * ```ts
	 * import { CustomEditor } from "@earendil-works/pi-coding-agent";
	 *
	 * class VimEditor extends CustomEditor {
	 *   private mode: "normal" | "insert" = "insert";
	 *
	 *   handleInput(data: string): void {
	 *     if (this.mode === "normal") {
	 *       // 处理 vim 普通模式按键...
	 *       if (data === "i") { this.mode = "insert"; return; }
	 *     }
	 *     super.handleInput(data);  // 应用按键绑定 + 文本编辑
	 *   }
	 * }
	 *
	 * ctx.ui.setEditorComponent((tui, theme, keybindings) =>
	 *   new VimEditor(tui, theme, keybindings)
	 * );
	 * ```
	 */
	setEditorComponent(factory: EditorFactory | undefined): void;

	/** 获取当前配置的自定义编辑器工厂，如果使用默认编辑器则返回 undefined。 */
	getEditorComponent(): EditorFactory | undefined;

	/** 获取用于样式的当前主题。 */
	readonly theme: Theme;

	/** 获取所有可用主题及其名称和文件路径。 */
	getAllThemes(): { name: string; path: string | undefined }[];

	/** 按名称加载主题而不切换。如果未找到返回 undefined。 */
	getTheme(name: string): Theme | undefined;

	/** 按名称或 Theme 对象设置当前主题。 */
	setTheme(theme: string | Theme): { success: boolean; error?: string };

	/** 获取当前工具输出展开状态。 */
	getToolsExpanded(): boolean;

	/** 设置工具输出展开状态。 */
	setToolsExpanded(expanded: boolean): void;
}

// ============================================================================
// 扩展上下文
// ============================================================================

export interface ContextUsage {
	/** 估计的上下文令牌数，如果未知则为 null（例如，压缩后，下一次 LLM 响应前）。 */
	tokens: number | null;
	contextWindow: number;
	/** 上下文使用量占上下文窗口的百分比，如果令牌数未知则为 null。 */
	percent: number | null;
}

export interface CompactOptions {
	customInstructions?: string;
	onComplete?: (result: CompactionResult) => void;
	onError?: (error: Error) => void;
}

/**
 * 传递给扩展事件处理函数的上下文。
 */
export interface ExtensionContext {
	/** 用于用户交互的 UI 方法 */
	ui: ExtensionUIContext;
	/** UI 是否可用（在打印/RPC 模式下为 false） */
	hasUI: boolean;
	/** 当前工作目录 */
	cwd: string;
	/** 会话管理器（只读） */
	sessionManager: ReadonlySessionManager;
	/** 用于 API 密钥解析的模型注册表 */
	modelRegistry: ModelRegistry;
	/** 当前模型（可能未定义） */
	model: Model<any> | undefined;
	/** 代理是否空闲（未流式传输） */
	isIdle(): boolean;
	/** 当前的中止信号，如果代理未流式传输则为 undefined。 */
	signal: AbortSignal | undefined;
	/** 中止当前的代理操作 */
	abort(): void;
	/** 是否有正在等待的消息 */
	hasPendingMessages(): boolean;
	/** 优雅关闭 pi 并退出。在所有上下文中可用。 */
	shutdown(): void;
	/** 获取当前模型的使用情况。 */
	getContextUsage(): ContextUsage | undefined;
	/** 触发压缩，无需等待完成。 */
	compact(options?: CompactOptions): void;
	/** 获取当前生效的系统提示。 */
	getSystemPrompt(): string;
}

/**
 * 命令处理函数的扩展上下文。
 * 包含仅在用户启动的命令中安全的会话控制方法。
 */
export interface ExtensionCommandContext extends ExtensionContext {
	/** 等待代理完成流式传输 */
	waitForIdle(): Promise<void>;

	/** 启动新会话，可选择初始化。 */
	newSession(options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}): Promise<{ cancelled: boolean }>;

	/** 从指定条目分支，创建新会话文件。 */
	fork(
		entryId: string,
		options?: { position?: "before" | "at"; withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	): Promise<{ cancelled: boolean }>;

	/** 导航到会话树中的不同点。 */
	navigateTree(
		targetId: string,
		options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	): Promise<{ cancelled: boolean }>;

	/** 切换到不同的会话文件。 */
	switchSession(
		sessionPath: string,
		options?: { withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	): Promise<{ cancelled: boolean }>;

	/** 重新加载扩展、技能、提示和主题。 */
	reload(): Promise<void>;
}

/**
 * 会话切换后绑定到替代会话的全功能命令上下文。
 *
 * 在 `newSession()`、`fork()` 和 `switchSession()` 的 `withSession()` 回调中传入。
 */
export interface ReplacedSessionContext extends ExtensionCommandContext {
	sendMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): Promise<void>;

	sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	): Promise<void>;
}

// ============================================================================
// 工具类型
// ============================================================================

/** 工具结果的渲染选项 */
export interface ToolRenderResultOptions {
	/** 结果视图是否展开 */
	expanded: boolean;
	/** 是否为部分/流式结果 */
	isPartial: boolean;
}

/** 传递给工具渲染函数的上下文。 */
export interface ToolRenderContext<TState = any, TArgs = any> {
	/** 当前工具调用参数。对于同一工具调用的调用/结果渲染共享。 */
	args: TArgs;
	/** 该工具执行的唯一 ID。对于同一工具调用的调用/结果渲染稳定。 */
	toolCallId: string;
	/** 仅使此工具执行组件失效以重新绘制。 */
	invalidate: () => void;
	/** 先前为此渲染槽返回的组件（如果有）。 */
	lastComponent: Component | undefined;
	/** 此工具行的共享渲染器状态。由 tool-execution.ts 初始化。 */
	state: TState;
	/** 此工具执行的工作目录。 */
	cwd: string;
	/** 工具执行是否已开始。 */
	executionStarted: boolean;
	/** 工具调用参数是否完整。 */
	argsComplete: boolean;
	/** 工具结果是部分/流式。 */
	isPartial: boolean;
	/** 结果视图是否展开。 */
	expanded: boolean;
	/** TUI 中当前是否显示内嵌图像。 */
	showImages: boolean;
	/** 当前结果是否为错误。 */
	isError: boolean;
}

/**
 * 用于 registerTool() 的工具定义。
 */
export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown, TState = any> {
	/** 工具名称（用于 LLM 工具调用） */
	name: string;
	/** 用户可读的 UI 标签 */
	label: string;
	/** 给 LLM 的描述 */
	description: string;
	/** 可选的一行摘要，用于默认系统提示的“可用工具”部分。未提供时，自定义工具将从该部分省略。 */
	promptSnippet?: string;
	/** 可选的指南要点，附加到默认系统提示的“指南”部分（当此工具激活时）。 */
	promptGuidelines?: string[];
	/** 参数模式（TypeBox） */
	parameters: TParams;
	/** 控制 ToolExecutionComponent 是渲染标准彩色外壳，还是工具自行渲染框架。 */
	renderShell?: "default" | "self";

	/** 可选的兼容性垫片，在模式验证之前准备原始工具调用参数。必须返回符合 TParams 的对象。 */
	prepareArguments?: (args: unknown) => Static<TParams>;

	/**
	 * 每个工具的执行模式覆盖。
	 * - "sequential": 此工具必须与其他工具调用逐一执行。
	 * - "parallel": 此工具可以与其他工具调用并发执行。
	 *
	 * 如果省略，则应用默认执行模式。
	 */
	executionMode?: ToolExecutionMode;

	/** 执行工具。 */
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<TDetails>>;

	/** 工具调用显示的自定义渲染 */
	renderCall?: (args: Static<TParams>, theme: Theme, context: ToolRenderContext<TState, Static<TParams>>) => Component;

	/** 工具结果显示的自定义渲染 */
	renderResult?: (
		result: AgentToolResult<TDetails>,
		options: ToolRenderResultOptions,
		theme: Theme,
		context: ToolRenderContext<TState, Static<TParams>>,
	) => Component;
}

type AnyToolDefinition = ToolDefinition<any, any, any>;

/**
 * 保留独立工具定义的参数推断。
 *
 * 在将工具分配给变量或通过数组（如 `customTools`）传递时使用，否则上下文类型推断会将参数扩大为 `unknown`。
 */
export function defineTool<TParams extends TSchema, TDetails = unknown, TState = any>(
	tool: ToolDefinition<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition {
	return tool as ToolDefinition<TParams, TDetails, TState> & AnyToolDefinition;
}

// ============================================================================
// 资源事件
// ============================================================================

/** 在 session_start 后触发，允许扩展提供额外资源路径。 */
export interface ResourcesDiscoverEvent {
	type: "resources_discover";
	cwd: string;
	reason: "startup" | "reload";
}

/** 来自 resources_discover 事件处理函数的结果 */
export interface ResourcesDiscoverResult {
	skillPaths?: string[];
	promptPaths?: string[];
	themePaths?: string[];
}

// ============================================================================
// 会话事件
// ============================================================================

/** 当会话启动、加载或重新加载时触发 */
export interface SessionStartEvent {
	type: "session_start";
	/** 此会话启动的原因。 */
	reason: "startup" | "reload" | "new" | "resume" | "fork";
	/** 先前活动的会话文件。对于 "new"、"resume" 和 "fork" 存在。 */
	previousSessionFile?: string;
}

/** 切换到另一个会话前触发（可取消） */
export interface SessionBeforeSwitchEvent {
	type: "session_before_switch";
	reason: "new" | "resume";
	targetSessionFile?: string;
}

/** 分支会话前触发（可取消） */
export interface SessionBeforeForkEvent {
	type: "session_before_fork";
	entryId: string;
	position: "before" | "at";
}

/** 上下文压缩前触发（可取消或自定义） */
export interface SessionBeforeCompactEvent {
	type: "session_before_compact";
	preparation: CompactionPreparation;
	branchEntries: SessionEntry[];
	customInstructions?: string;
	signal: AbortSignal;
}

/** 上下文压缩后触发 */
export interface SessionCompactEvent {
	type: "session_compact";
	compactionEntry: CompactionEntry;
	fromExtension: boolean;
}

/** 扩展运行时因退出、重新加载或会话替换而被拆除前触发。 */
export interface SessionShutdownEvent {
	type: "session_shutdown";
	reason: "quit" | "reload" | "new" | "resume" | "fork";
	/** 因会话替换而关闭时的目标会话文件。 */
	targetSessionFile?: string;
}

/** 树导航的准备数据 */
export interface TreePreparation {
	targetId: string;
	oldLeafId: string | null;
	commonAncestorId: string | null;
	entriesToSummarize: SessionEntry[];
	userWantsSummary: boolean;
	/** 自定义摘要指令 */
	customInstructions?: string;
	/** 如果为 true，customInstructions 将替换默认提示而不是附加 */
	replaceInstructions?: boolean;
	/** 附加到分支摘要条目的标签 */
	label?: string;
}

/** 在会话树中导航前触发（可取消） */
export interface SessionBeforeTreeEvent {
	type: "session_before_tree";
	preparation: TreePreparation;
	signal: AbortSignal;
}

/** 在会话树中导航后触发 */
export interface SessionTreeEvent {
	type: "session_tree";
	newLeafId: string | null;
	oldLeafId: string | null;
	summaryEntry?: BranchSummaryEntry;
	fromExtension?: boolean;
}

export type SessionEvent =
	| SessionStartEvent
	| SessionBeforeSwitchEvent
	| SessionBeforeForkEvent
	| SessionBeforeCompactEvent
	| SessionCompactEvent
	| SessionShutdownEvent
	| SessionBeforeTreeEvent
	| SessionTreeEvent;

// ============================================================================
// 代理事件
// ============================================================================

/** 每次 LLM 调用前触发。可以修改消息。 */
export interface ContextEvent {
	type: "context";
	messages: AgentMessage[];
}

/** 在发送提供者请求前触发。可以替换有效负载。 */
export interface BeforeProviderRequestEvent {
	type: "before_provider_request";
	payload: unknown;
}

/** 在收到提供者响应后、消费响应流之前触发。 */
export interface AfterProviderResponseEvent {
	type: "after_provider_response";
	status: number;
	headers: Record<string, string>;
}

/** 用户提交提示后、代理循环开始前触发。 */
export interface BeforeAgentStartEvent {
	type: "before_agent_start";
	/** 原始用户提示文本（展开后）。 */
	prompt: string;
	/** 附加到用户提示的图像（如果有）。 */
	images?: ImageContent[];
	/** 完整组合的系统提示字符串。 */
	systemPrompt: string;
	/** 用于构建系统提示的结构化选项。扩展可以检查此信息以了解 Pi 加载的内容，而无需重新发现资源。 */
	systemPromptOptions: BuildSystemPromptOptions;
}

/** 代理循环开始时触发 */
export interface AgentStartEvent {
	type: "agent_start";
}

/** 代理循环结束时触发 */
export interface AgentEndEvent {
	type: "agent_end";
	messages: AgentMessage[];
}

/** 每轮开始时触发 */
export interface TurnStartEvent {
	type: "turn_start";
	turnIndex: number;
	timestamp: number;
}

/** 每轮结束时触发 */
export interface TurnEndEvent {
	type: "turn_end";
	turnIndex: number;
	message: AgentMessage;
	toolResults: ToolResultMessage[];
}

/** 消息开始时触发（用户、助手或 toolResult） */
export interface MessageStartEvent {
	type: "message_start";
	message: AgentMessage;
}

/** 助手消息流式传输期间触发，提供逐令牌更新 */
export interface MessageUpdateEvent {
	type: "message_update";
	message: AgentMessage;
	assistantMessageEvent: AssistantMessageEvent;
}

/** 消息结束时触发 */
export interface MessageEndEvent {
	type: "message_end";
	message: AgentMessage;
}

/** 工具开始执行时触发 */
export interface ToolExecutionStartEvent {
	type: "tool_execution_start";
	toolCallId: string;
	toolName: string;
	args: any;
}

/** 工具执行期间触发，用于部分/流式输出 */
export interface ToolExecutionUpdateEvent {
	type: "tool_execution_update";
	toolCallId: string;
	toolName: string;
	args: any;
	partialResult: any;
}

/** 工具执行完成时触发 */
export interface ToolExecutionEndEvent {
	type: "tool_execution_end";
	toolCallId: string;
	toolName: string;
	result: any;
	isError: boolean;
}

// ============================================================================
// 模型事件
// ============================================================================

export type ModelSelectSource = "set" | "cycle" | "restore";

/** 选择新模型时触发 */
export interface ModelSelectEvent {
	type: "model_select";
	model: Model<any>;
	previousModel: Model<any> | undefined;
	source: ModelSelectSource;
}

/** 选择新的思考级别时触发 */
export interface ThinkingLevelSelectEvent {
	type: "thinking_level_select";
	level: ThinkingLevel;
	previousLevel: ThinkingLevel;
}

// ============================================================================
// 用户 Bash 事件
// ============================================================================

/** 用户通过 ! 或 !! 前缀执行 bash 命令时触发 */
export interface UserBashEvent {
	type: "user_bash";
	/** 要执行的命令 */
	command: string;
	/** 如果使用了 !! 前缀则为 true（从 LLM 上下文排除） */
	excludeFromContext: boolean;
	/** 当前工作目录 */
	cwd: string;
}

// ============================================================================
// 输入事件
// ============================================================================

/** 用户输入的来源 */
export type InputSource = "interactive" | "rpc" | "extension";

/** 接收用户输入时触发，在代理处理之前 */
export interface InputEvent {
	type: "input";
	/** 输入的文本 */
	text: string;
	/** 附加的图像（如果有） */
	images?: ImageContent[];
	/** 输入的来源 */
	source: InputSource;
}

/** 输入事件处理函数的结果 */
export type InputEventResult =
	| { action: "continue" }
	| { action: "transform"; text: string; images?: ImageContent[] }
	| { action: "handled" };

// ============================================================================
// 工具事件
// ============================================================================

interface ToolCallEventBase {
	type: "tool_call";
	toolCallId: string;
}

export interface BashToolCallEvent extends ToolCallEventBase {
	toolName: "bash";
	input: BashToolInput;
}

export interface ReadToolCallEvent extends ToolCallEventBase {
	toolName: "read";
	input: ReadToolInput;
}

export interface EditToolCallEvent extends ToolCallEventBase {
	toolName: "edit";
	input: EditToolInput;
}

export interface WriteToolCallEvent extends ToolCallEventBase {
	toolName: "write";
	input: WriteToolInput;
}

export interface GrepToolCallEvent extends ToolCallEventBase {
	toolName: "grep";
	input: GrepToolInput;
}

export interface FindToolCallEvent extends ToolCallEventBase {
	toolName: "find";
	input: FindToolInput;
}

export interface LsToolCallEvent extends ToolCallEventBase {
	toolName: "ls";
	input: LsToolInput;
}

export interface CustomToolCallEvent extends ToolCallEventBase {
	toolName: string;
	input: Record<string, unknown>;
}

/**
 * 在工具执行前触发。可以阻止。
 *
 * `event.input` 是可变的。就地修改它以在执行前修补工具参数。
 * 后续的 `tool_call` 处理函数会看到先前的修改。修改后不进行重新验证。
 */
export type ToolCallEvent =
	| BashToolCallEvent
	| ReadToolCallEvent
	| EditToolCallEvent
	| WriteToolCallEvent
	| GrepToolCallEvent
	| FindToolCallEvent
	| LsToolCallEvent
	| CustomToolCallEvent;

interface ToolResultEventBase {
	type: "tool_result";
	toolCallId: string;
	input: Record<string, unknown>;
	content: (TextContent | ImageContent)[];
	isError: boolean;
}

export interface BashToolResultEvent extends ToolResultEventBase {
	toolName: "bash";
	details: BashToolDetails | undefined;
}

export interface ReadToolResultEvent extends ToolResultEventBase {
	toolName: "read";
	details: ReadToolDetails | undefined;
}

export interface EditToolResultEvent extends ToolResultEventBase {
	toolName: "edit";
	details: EditToolDetails | undefined;
}

export interface WriteToolResultEvent extends ToolResultEventBase {
	toolName: "write";
	details: undefined;
}

export interface GrepToolResultEvent extends ToolResultEventBase {
	toolName: "grep";
	details: GrepToolDetails | undefined;
}

export interface FindToolResultEvent extends ToolResultEventBase {
	toolName: "find";
	details: FindToolDetails | undefined;
}

export interface LsToolResultEvent extends ToolResultEventBase {
	toolName: "ls";
	details: LsToolDetails | undefined;
}

export interface CustomToolResultEvent extends ToolResultEventBase {
	toolName: string;
	details: unknown;
}

/** 在工具执行后触发。可以修改结果。 */
export type ToolResultEvent =
	| BashToolResultEvent
	| ReadToolResultEvent
	| EditToolResultEvent
	| WriteToolResultEvent
	| GrepToolResultEvent
	| FindToolResultEvent
	| LsToolResultEvent
	| CustomToolResultEvent;

// ToolResultEvent 的类型守卫
export function isBashToolResult(e: ToolResultEvent): e is BashToolResultEvent {
	return e.toolName === "bash";
}
export function isReadToolResult(e: ToolResultEvent): e is ReadToolResultEvent {
	return e.toolName === "read";
}
export function isEditToolResult(e: ToolResultEvent): e is EditToolResultEvent {
	return e.toolName === "edit";
}
export function isWriteToolResult(e: ToolResultEvent): e is WriteToolResultEvent {
	return e.toolName === "write";
}
export function isGrepToolResult(e: ToolResultEvent): e is GrepToolResultEvent {
	return e.toolName === "grep";
}
export function isFindToolResult(e: ToolResultEvent): e is FindToolResultEvent {
	return e.toolName === "find";
}
export function isLsToolResult(e: ToolResultEvent): e is LsToolResultEvent {
	return e.toolName === "ls";
}

/**
 * 按工具名称缩小 ToolCallEvent 类型的类型守卫。
 *
 * 内置工具自动缩小（无需类型参数）：
 * ```ts
 * if (isToolCallEventType("bash", event)) {
 *   event.input.command;  // 字符串
 * }
 * ```
 *
 * 自定义工具需要显式类型参数：
 * ```ts
 * if (isToolCallEventType<"my_tool", MyToolInput>("my_tool", event)) {
 *   event.input.action;  // 已类型化
 * }
 * ```
 *
 * 注意：通过 `event.toolName === "bash"` 直接缩小不起作用，因为
 * CustomToolCallEvent.toolName 是 `string`，与所有字面量重叠。
 */
export function isToolCallEventType(toolName: "bash", event: ToolCallEvent): event is BashToolCallEvent;
export function isToolCallEventType(toolName: "read", event: ToolCallEvent): event is ReadToolCallEvent;
export function isToolCallEventType(toolName: "edit", event: ToolCallEvent): event is EditToolCallEvent;
export function isToolCallEventType(toolName: "write", event: ToolCallEvent): event is WriteToolCallEvent;
export function isToolCallEventType(toolName: "grep", event: ToolCallEvent): event is GrepToolCallEvent;
export function isToolCallEventType(toolName: "find", event: ToolCallEvent): event is FindToolCallEvent;
export function isToolCallEventType(toolName: "ls", event: ToolCallEvent): event is LsToolCallEvent;
export function isToolCallEventType<TName extends string, TInput extends Record<string, unknown>>(
	toolName: TName,
	event: ToolCallEvent,
): event is ToolCallEvent & { toolName: TName; input: TInput };
export function isToolCallEventType(toolName: string, event: ToolCallEvent): boolean {
	return event.toolName === toolName;
}

/** 所有事件类型的联合 */
export type ExtensionEvent =
	| ResourcesDiscoverEvent
	| SessionEvent
	| ContextEvent
	| BeforeProviderRequestEvent
	| AfterProviderResponseEvent
	| BeforeAgentStartEvent
	| AgentStartEvent
	| AgentEndEvent
	| TurnStartEvent
	| TurnEndEvent
	| MessageStartEvent
	| MessageUpdateEvent
	| MessageEndEvent
	| ToolExecutionStartEvent
	| ToolExecutionUpdateEvent
	| ToolExecutionEndEvent
	| ModelSelectEvent
	| ThinkingLevelSelectEvent
	| UserBashEvent
	| InputEvent
	| ToolCallEvent
	| ToolResultEvent;

// ============================================================================
// 事件结果
// ============================================================================

export interface ContextEventResult {
	messages?: AgentMessage[];
}

export type BeforeProviderRequestEventResult = unknown;

export interface ToolCallEventResult {
	/** 阻止工具执行。要修改参数，请就地修改 `event.input`。 */
	block?: boolean;
	reason?: string;
}

/** user_bash 事件处理函数的结果 */
export interface UserBashEventResult {
	/** 用于执行的自定义操作 */
	operations?: BashOperations;
	/** 完全替换：扩展处理了执行，使用此结果 */
	result?: BashResult;
}

export interface ToolResultEventResult {
	content?: (TextContent | ImageContent)[];
	details?: unknown;
	isError?: boolean;
}

export interface MessageEndEventResult {
	/** 替换最终消息。替换必须保持原始消息的角色。 */
	message?: AgentMessage;
}

export interface BeforeAgentStartEventResult {
	message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
	/** 替换本轮的系统提示。如果多个扩展返回此值，它们将被链接。 */
	systemPrompt?: string;
}

export interface SessionBeforeSwitchResult {
	cancel?: boolean;
}

export interface SessionBeforeForkResult {
	cancel?: boolean;
	skipConversationRestore?: boolean;
}

export interface SessionBeforeCompactResult {
	cancel?: boolean;
	compaction?: CompactionResult;
}

export interface SessionBeforeTreeResult {
	cancel?: boolean;
	summary?: {
		summary: string;
		details?: unknown;
	};
	/** 覆盖自定义摘要指令 */
	customInstructions?: string;
	/** 覆盖是否替换默认提示 */
	replaceInstructions?: boolean;
	/** 覆盖附加到分支摘要条目的标签 */
	label?: string;
}

// ============================================================================
// 消息渲染
// ============================================================================

export interface MessageRenderOptions {
	expanded: boolean;
}

export type MessageRenderer<T = unknown> = (
	message: CustomMessage<T>,
	options: MessageRenderOptions,
	theme: Theme,
) => Component | undefined;

// ============================================================================
// 命令注册
// ============================================================================

export interface RegisteredCommand {
	name: string;
	sourceInfo: SourceInfo;
	description?: string;
	getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null | Promise<AutocompleteItem[] | null>;
	handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

export interface ResolvedCommand extends RegisteredCommand {
	invocationName: string;
}

// ============================================================================
// 扩展 API
// ============================================================================

/** 事件的处理函数类型 */
// biome-ignore lint/suspicious/noConfusingVoidType: void 允许裸返回语句
export type ExtensionHandler<E, R = undefined> = (event: E, ctx: ExtensionContext) => Promise<R | void> | R | void;

/**
 * 传递给扩展工厂函数的 ExtensionAPI。
 */
export interface ExtensionAPI {
	// =========================================================================
	// 事件订阅
	// =========================================================================

	on(event: "resources_discover", handler: ExtensionHandler<ResourcesDiscoverEvent, ResourcesDiscoverResult>): void;
	on(event: "session_start", handler: ExtensionHandler<SessionStartEvent>): void;
	on(
		event: "session_before_switch",
		handler: ExtensionHandler<SessionBeforeSwitchEvent, SessionBeforeSwitchResult>,
	): void;
	on(event: "session_before_fork", handler: ExtensionHandler<SessionBeforeForkEvent, SessionBeforeForkResult>): void;
	on(
		event: "session_before_compact",
		handler: ExtensionHandler<SessionBeforeCompactEvent, SessionBeforeCompactResult>,
	): void;
	on(event: "session_compact", handler: ExtensionHandler<SessionCompactEvent>): void;
	on(event: "session_shutdown", handler: ExtensionHandler<SessionShutdownEvent>): void;
	on(event: "session_before_tree", handler: ExtensionHandler<SessionBeforeTreeEvent, SessionBeforeTreeResult>): void;
	on(event: "session_tree", handler: ExtensionHandler<SessionTreeEvent>): void;
	on(event: "context", handler: ExtensionHandler<ContextEvent, ContextEventResult>): void;
	on(
		event: "before_provider_request",
		handler: ExtensionHandler<BeforeProviderRequestEvent, BeforeProviderRequestEventResult>,
	): void;
	on(event: "after_provider_response", handler: ExtensionHandler<AfterProviderResponseEvent>): void;
	on(event: "before_agent_start", handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult>): void;
	on(event: "agent_start", handler: ExtensionHandler<AgentStartEvent>): void;
	on(event: "agent_end", handler: ExtensionHandler<AgentEndEvent>): void;
	on(event: "turn_start", handler: ExtensionHandler<TurnStartEvent>): void;
	on(event: "turn_end", handler: ExtensionHandler<TurnEndEvent>): void;
	on(event: "message_start", handler: ExtensionHandler<MessageStartEvent>): void;
	on(event: "message_update", handler: ExtensionHandler<MessageUpdateEvent>): void;
	on(event: "message_end", handler: ExtensionHandler<MessageEndEvent, MessageEndEventResult>): void;
	on(event: "tool_execution_start", handler: ExtensionHandler<ToolExecutionStartEvent>): void;
	on(event: "tool_execution_update", handler: ExtensionHandler<ToolExecutionUpdateEvent>): void;
	on(event: "tool_execution_end", handler: ExtensionHandler<ToolExecutionEndEvent>): void;
	on(event: "model_select", handler: ExtensionHandler<ModelSelectEvent>): void;
	on(event: "thinking_level_select", handler: ExtensionHandler<ThinkingLevelSelectEvent>): void;
	on(event: "tool_call", handler: ExtensionHandler<ToolCallEvent, ToolCallEventResult>): void;
	on(event: "tool_result", handler: ExtensionHandler<ToolResultEvent, ToolResultEventResult>): void;
	on(event: "user_bash", handler: ExtensionHandler<UserBashEvent, UserBashEventResult>): void;
	on(event: "input", handler: ExtensionHandler<InputEvent, InputEventResult>): void;

	// =========================================================================
	// 工具注册
	// =========================================================================

	/** 注册一个 LLM 可以调用的工具。 */
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(
		tool: ToolDefinition<TParams, TDetails, TState>,
	): void;

	// =========================================================================
	// 命令、快捷键、标志注册
	// =========================================================================

	/** 注册一个自定义命令。 */
	registerCommand(name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">): void;

	/** 注册一个键盘快捷键。 */
	registerShortcut(
		shortcut: KeyId,
		options: {
			description?: string;
			handler: (ctx: ExtensionContext) => Promise<void> | void;
		},
	): void;

	/** 注册一个 CLI 标志。 */
	registerFlag(
		name: string,
		options: {
			description?: string;
			type: "boolean" | "string";
			default?: boolean | string;
		},
	): void;

	/** 获取已注册 CLI 标志的值。 */
	getFlag(name: string): boolean | string | undefined;

	// =========================================================================
	// 消息渲染
	// =========================================================================

	/** 为 CustomMessageEntry 注册自定义渲染器。 */
	registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void;

	// =========================================================================
	// 操作
	// =========================================================================

	/** 向会话发送自定义消息。 */
	sendMessage<T = unknown>(
		message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
		options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
	): void;

	/**
	 * 向代理发送用户消息。总是触发一轮。
	 * 当代理正在流式传输时，使用 deliverAs 指定如何排队消息。
	 */
	sendUserMessage(
		content: string | (TextContent | ImageContent)[],
		options?: { deliverAs?: "steer" | "followUp" },
	): void;

	/** 向会话附加自定义条目以进行状态持久化（不发送给 LLM）。 */
	appendEntry<T = unknown>(customType: string, data?: T): void;

	// =========================================================================
	// 会话元数据
	// =========================================================================

	/** 设置会话显示名称（显示在会话选择器中）。 */
	setSessionName(name: string): void;

	/** 获取当前会话名称（如果已设置）。 */
	getSessionName(): string | undefined;

	/** 设置或清除条目上的标签。标签是用户定义的书签/导航标记。 */
	setLabel(entryId: string, label: string | undefined): void;

	/** 执行 shell 命令。 */
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;

	/** 获取当前活动工具名称列表。 */
	getActiveTools(): string[];

	/** 获取所有已配置的工具，包含参数模式和源元数据。 */
	getAllTools(): ToolInfo[];

	/** 按名称设置活动工具。 */
	setActiveTools(toolNames: string[]): void;

	/** 获取当前会话中可用的斜杠命令。 */
	getCommands(): SlashCommandInfo[];

	// =========================================================================
	// 模型和思考级别
	// =========================================================================

	/** 设置当前模型。如果没有可用 API 密钥则返回 false。 */
	setModel(model: Model<any>): Promise<boolean>;

	/** 获取当前思考级别。 */
	getThinkingLevel(): ThinkingLevel;

	/** 设置思考级别（限制在模型能力范围内）。 */
	setThinkingLevel(level: ThinkingLevel): void;

	// =========================================================================
	// 提供者注册
	// =========================================================================

	/**
	 * 注册或覆盖模型提供者。
	 *
	 * 如果提供了 `models`：替换此提供者的所有现有模型。
	 * 如果只提供 `baseUrl`：覆盖现有模型的 URL。
	 * 如果提供了 `oauth`：注册 OAuth 提供者以支持 /login。
	 * 如果提供了 `streamSimple`：注册自定义 API 流处理程序。
	 *
	 * 在初始扩展加载期间，此调用被排队，并在运行器绑定其上下文后应用。
	 * 之后立即生效，因此从命令处理程序或事件回调中调用是安全的，无需 `/reload`。
	 *
	 * @example
	 * // 使用自定义模型注册新提供者
	 * pi.registerProvider("my-proxy", {
	 *   baseUrl: "https://proxy.example.com",
	 *   apiKey: "PROXY_API_KEY",
	 *   api: "anthropic-messages",
	 *   models: [
	 *     {
	 *       id: "claude-sonnet-4-20250514",
	 *       name: "Claude 4 Sonnet (代理)",
	 *       reasoning: false,
	 *       input: ["text", "image"],
	 *       cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	 *       contextWindow: 200000,
	 *       maxTokens: 16384
	 *     }
	 *   ]
	 * });
	 *
	 * @example
	 * // 覆盖现有提供者的 baseUrl
	 * pi.registerProvider("anthropic", {
	 *   baseUrl: "https://proxy.example.com"
	 * });
	 *
	 * @example
	 * // 注册支持 OAuth 的提供者
	 * pi.registerProvider("corporate-ai", {
	 *   baseUrl: "https://ai.corp.com",
	 *   api: "openai-responses",
	 *   models: [...],
	 *   oauth: {
	 *     name: "企业 AI (SSO)",
	 *     async login(callbacks) { ... },
	 *     async refreshToken(credentials) { ... },
	 *     getApiKey(credentials) { return credentials.access; }
	 *   }
	 * });
	 */
	registerProvider(name: string, config: ProviderConfig): void;

	/**
	 * 注销先前注册的提供者。
	 *
	 * 移除属于该命名提供者的所有模型，并恢复被它覆盖的任何内置模型。
	 * 如果该提供者当前未注册，则无效果。
	 *
	 * 与 `registerProvider` 一样，在初始加载阶段之后调用时立即生效。
	 *
	 * @example
	 * pi.unregisterProvider("my-proxy");
	 */
	unregisterProvider(name: string): void;

	/** 用于扩展通信的共享事件总线。 */
	events: EventBus;
}

// ============================================================================
// 提供者注册类型
// ============================================================================

/** 通过 pi.registerProvider() 注册提供者的配置。 */
export interface ProviderConfig {
	/** 提供者在 UI 中的显示名称。 */
	name?: string;
	/** API 端点的基本 URL。定义模型时需要。 */
	baseUrl?: string;
	/** API 密钥或环境变量名称。定义模型时需要（除非提供了 oauth）。 */
	apiKey?: string;
	/** API 类型。在提供者或模型级别定义模型时需要。 */
	api?: Api;
	/** 用于自定义 API 的可选 streamSimple 处理程序。 */
	streamSimple?: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
	/** 包含在请求中的自定义标头。 */
	headers?: Record<string, string>;
	/** 如果为 true，添加 Authorization: Bearer 标头，值为解析后的 API 密钥。 */
	authHeader?: boolean;
	/** 要注册的模型。如果提供，则替换此提供者的所有现有模型。 */
	models?: ProviderModelConfig[];
	/** 用于 /login 支持的 OAuth 提供者。`id` 自动从提供者名称设置。 */
	oauth?: {
		/** 在登录 UI 中的显示名称。 */
		name: string;
		/** 运行登录流程，返回要持久化的凭据。 */
		login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
		/** 刷新过期的凭据，返回更新后的凭据以持久化。 */
		refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
		/** 将凭据转换为提供者的 API 密钥字符串。 */
		getApiKey(credentials: OAuthCredentials): string;
		/** 可选：修改此提供者的模型（例如，基于凭据更新 baseUrl）。 */
		modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
	};
}

/** 提供者内模型的配置。 */
export interface ProviderModelConfig {
	/** 模型 ID（例如 "claude-sonnet-4-20250514"）。 */
	id: string;
	/** 显示名称（例如 "Claude 4 Sonnet"）。 */
	name: string;
	/** 此模型的 API 类型覆盖。 */
	api?: Api;
	/** 此模型的 API 端点 URL 覆盖。 */
	baseUrl?: string;
	/** 模型是否支持扩展思考。 */
	reasoning: boolean;
	/** 将 pi 思考级别映射到提供者/模型特定值；null 表示级别不受支持。 */
	thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
	/** 支持的输入类型。 */
	input: ("text" | "image")[];
	/** 每令牌成本（用于跟踪，可以为 0）。 */
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
	/** 最大上下文窗口大小（令牌数）。 */
	contextWindow: number;
	/** 最大输出令牌数。 */
	maxTokens: number;
	/** 此模型的自定义标头。 */
	headers?: Record<string, string>;
	/** OpenAI 兼容性设置。 */
	compat?: Model<Api>["compat"];
}

/** 扩展工厂函数类型。支持同步和异步初始化。 */
export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

// ============================================================================
// 已加载扩展类型
// ============================================================================

export interface RegisteredTool {
	definition: ToolDefinition;
	sourceInfo: SourceInfo;
}

export interface ExtensionFlag {
	name: string;
	description?: string;
	type: "boolean" | "string";
	default?: boolean | string;
	extensionPath: string;
}

export interface ExtensionShortcut {
	shortcut: KeyId;
	description?: string;
	handler: (ctx: ExtensionContext) => Promise<void> | void;
	extensionPath: string;
}

type HandlerFn = (...args: unknown[]) => Promise<unknown>;

export type SendMessageHandler = <T = unknown>(
	message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
	options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
) => void;

export type SendUserMessageHandler = (
	content: string | (TextContent | ImageContent)[],
	options?: { deliverAs?: "steer" | "followUp" },
) => void;

export type AppendEntryHandler = <T = unknown>(customType: string, data?: T) => void;

export type SetSessionNameHandler = (name: string) => void;

export type GetSessionNameHandler = () => string | undefined;

export type GetActiveToolsHandler = () => string[];

/** 工具信息，包含名称、描述、参数模式和源元数据 */
export type ToolInfo = Pick<ToolDefinition, "name" | "description" | "parameters"> & {
	sourceInfo: SourceInfo;
};

export type GetAllToolsHandler = () => ToolInfo[];

export type GetCommandsHandler = () => SlashCommandInfo[];

export type SetActiveToolsHandler = (toolNames: string[]) => void;

export type RefreshToolsHandler = () => void;

export type SetModelHandler = (model: Model<any>) => Promise<boolean>;

export type GetThinkingLevelHandler = () => ThinkingLevel;

export type SetThinkingLevelHandler = (level: ThinkingLevel) => void;

export type SetLabelHandler = (entryId: string, label: string | undefined) => void;

/**
 * 加载器创建的共享状态，在注册和运行时使用。
 * 包含标志值（注册时设置默认值，之后设置 CLI 值）。
 */
export interface ExtensionRuntimeState {
	flagValues: Map<string, boolean | string>;
	/** 扩展加载期间排队的提供者注册，在运行器绑定时处理 */
	pendingProviderRegistrations: Array<{ name: string; config: ProviderConfig; extensionPath: string }>;
	/** 当此扩展实例在运行时替换后变得过时时抛出错误。 */
	assertActive: () => void;
	/** 在运行时替换或重新加载后，将此扩展实例标记为过时。 */
	invalidate: (message?: string) => void;
	/**
	 * 注册或注销提供者。
	 *
	 * 在 bindCore() 之前：排队注册 / 从队列中移除。
	 * 在 bindCore() 之后：直接调用 ModelRegistry 以立即生效。
	 */
	registerProvider: (name: string, config: ProviderConfig, extensionPath?: string) => void;
	unregisterProvider: (name: string, extensionPath?: string) => void;
}

/**
 * pi.* API 方法的操作实现。
 * 提供给 runner.initialize()，复制到共享运行时中。
 */
export interface ExtensionActions {
	sendMessage: SendMessageHandler;
	sendUserMessage: SendUserMessageHandler;
	appendEntry: AppendEntryHandler;
	setSessionName: SetSessionNameHandler;
	getSessionName: GetSessionNameHandler;
	setLabel: SetLabelHandler;
	getActiveTools: GetActiveToolsHandler;
	getAllTools: GetAllToolsHandler;
	setActiveTools: SetActiveToolsHandler;
	refreshTools: RefreshToolsHandler;
	getCommands: GetCommandsHandler;
	setModel: SetModelHandler;
	getThinkingLevel: GetThinkingLevelHandler;
	setThinkingLevel: SetThinkingLevelHandler;
}

/**
 * ExtensionContext 的操作（事件处理函数中的 ctx.*）。
 * 所有模式都需要。
 */
export interface ExtensionContextActions {
	getModel: () => Model<any> | undefined;
	isIdle: () => boolean;
	getSignal: () => AbortSignal | undefined;
	abort: () => void;
	hasPendingMessages: () => boolean;
	shutdown: () => void;
	getContextUsage: () => ContextUsage | undefined;
	compact: (options?: CompactOptions) => void;
	getSystemPrompt: () => string;
}

/**
 * ExtensionCommandContext 的操作（命令处理函数中的 ctx.*）。
 * 仅在交互模式下需要，因为扩展命令是可调用的。
 */
export interface ExtensionCommandContextActions {
	waitForIdle: () => Promise<void>;
	newSession: (options?: {
		parentSession?: string;
		setup?: (sessionManager: SessionManager) => Promise<void>;
		withSession?: (ctx: ReplacedSessionContext) => Promise<void>;
	}) => Promise<{ cancelled: boolean }>;
	fork: (
		entryId: string,
		options?: { position?: "before" | "at"; withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	) => Promise<{ cancelled: boolean }>;
	navigateTree: (
		targetId: string,
		options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
	) => Promise<{ cancelled: boolean }>;
	switchSession: (
		sessionPath: string,
		options?: { withSession?: (ctx: ReplacedSessionContext) => Promise<void> },
	) => Promise<{ cancelled: boolean }>;
	reload: () => Promise<void>;
}

/**
 * 完整运行时 = 状态 + 操作。
 * 由加载器创建，使用抛出的操作存根，由 runner.initialize() 完成。
 */
export interface ExtensionRuntime extends ExtensionRuntimeState, ExtensionActions {}

/** 已加载的扩展，包含所有注册项。 */
export interface Extension {
	path: string;
	resolvedPath: string;
	sourceInfo: SourceInfo;
	handlers: Map<string, HandlerFn[]>;
	tools: Map<string, RegisteredTool>;
	messageRenderers: Map<string, MessageRenderer>;
	commands: Map<string, RegisteredCommand>;
	flags: Map<string, ExtensionFlag>;
	shortcuts: Map<KeyId, ExtensionShortcut>;
}

/** 加载扩展的结果。 */
export interface LoadExtensionsResult {
	extensions: Extension[];
	errors: Array<{ path: string; error: string }>;
	/** 共享运行时 - 操作是抛出的存根，直到 runner.initialize() */
	runtime: ExtensionRuntime;
}

// ============================================================================
// 扩展错误
// ============================================================================

export interface ExtensionError {
	extensionPath: string;
	event: string;
	error: string;
	stack?: string;
}
