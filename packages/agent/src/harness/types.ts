import type { ImageContent, Model, SimpleStreamOptions, TextContent, Transport } from "@earendil-works/pi-ai";
import type { AgentEvent, AgentMessage, AgentTool, QueueMode, ThinkingLevel } from "../index.ts";
import type { Session } from "./session/session.ts";

/** 可能失败的操作的结果。预期失败返回 `ok: false` 而非抛出异常。 */
export type Result<TValue, TError> = { ok: true; value: TValue } | { ok: false; error: TError };

/** 创建一个成功的 {@link Result}。 */
export function ok<TValue, TError>(value: TValue): Result<TValue, TError> {
	return { ok: true, value };
}

/** 创建一个失败的 {@link Result}。 */
export function err<TValue, TError>(error: TError): Result<TValue, TError> {
	return { ok: false, error };
}

/** 返回成功值，否则抛出失败错误。用于测试和显式适配器边界。 */
export function getOrThrow<TValue, TError>(result: Result<TValue, TError>): TValue {
	if (!result.ok) throw result.error;
	return result.value;
}

/** 返回成功值或 `undefined`。仅允许对象值，以避免基本类型的真值性错误。 */
export function getOrUndefined<TValue extends object, TError>(result: Result<TValue, TError>): TValue | undefined {
	return result.ok ? result.value : undefined;
}

/** 在将未知抛出的值用作类型化错误原因之前，将其规范化为 Error 实例。 */
export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error(String(error));
	}
}

/**
 * 从 `SKILL.md` 文件加载或由应用程序提供的技能。
 *
 * `name`、`description` 和 `filePath` 以 XML 格式插入系统提示块中，如 agentskills.io 所建议。
 * 使用 {@link formatSkillsForSystemPrompt} 生成符合规范的提示块。
 */
export interface Skill {
	/** 稳定的技能名称，用于查找和模型可见的列表。 */
	name: string;
	/** 关于何时使用该技能的简短模型可见描述。 */
	description: string;
	/** 完整的技能指令。 */
	content: string;
	/** 技能文件的绝对路径。用于模型可见的位置和解析相对引用。 */
	filePath: string;
	/** 将该技能从模型可见的技能列表中排除，同时仍允许显式应用程序调用。 */
	disableModelInvocation?: boolean;
}

/** 可以格式化为用于显式调用的提示模板。 */
export interface PromptTemplate {
	/** 稳定的模板名称，用于查找或应用程序命令路由。 */
	name: string;
	/** 命令列表或自动补全的可选描述。 */
	description?: string;
	/** 模板内容。参数占位符由 `formatPromptTemplateInvocation` 格式化。 */
	content: string;
}

/** 提供显式调用方法和系统提示回调可用的资源。 */
export interface AgentHarnessResources<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	/** 可用于显式调用的提示模板。 */
	promptTemplates?: TPromptTemplate[];
	/** 模型可见的技能和显式技能调用可用的技能。 */
	skills?: TSkill[];
}

/** 由 harness 管理并在每个轮次快照的精选提供者请求选项。 */
export interface AgentHarnessStreamOptions {
	/** 转发到流函数的首选传输。 */
	transport?: Transport;
	/** 提供者请求超时时间（毫秒）。 */
	timeoutMs?: number;
	/** 最大提供者重试次数。 */
	maxRetries?: number;
	/** 提供者请求的重试延迟可选上限（毫秒）。 */
	maxRetryDelayMs?: number;
	/** 与认证和生命周期头部合并的额外请求头部。 */
	headers?: Record<string, string>;
	/** 随请求转发的提供者元数据。 */
	metadata?: SimpleStreamOptions["metadata"];
	/** 提供者缓存保留提示。 */
	cacheRetention?: SimpleStreamOptions["cacheRetention"];
}

/** 由提供者钩子返回的每请求流选项补丁。 */
export interface AgentHarnessStreamOptionsPatch
	extends Omit<Partial<AgentHarnessStreamOptions>, "headers" | "metadata"> {
	/** 头部补丁。`undefined` 值删除键；显式 `headers: undefined` 清除所有头部。 */
	headers?: Record<string, string | undefined>;
	/** 元数据补丁。`undefined` 值删除键；显式 `metadata: undefined` 清除所有元数据。 */
	metadata?: Record<string, unknown | undefined>;
}

/** 由 {@link FileSystem} 寻址的文件系统对象种类。符号链接不会自动跟随。 */
export type FileKind = "file" | "directory" | "symlink";

/** 由 {@link FileSystem} 文件操作返回的稳定、与后端无关的文件错误码。 */
export type FileErrorCode =
	| "aborted"
	| "not_found"
	| "permission_denied"
	| "not_directory"
	| "is_directory"
	| "invalid"
	| "not_supported"
	| "unknown";

/** 由 {@link FileSystem} 文件操作返回的错误。 */
export class FileError extends Error {
	/** 与后端无关的错误码。 */
	public code: FileErrorCode;
	/** 与失败关联的绝对寻址路径（可用时）。 */
	public path?: string;

	constructor(code: FileErrorCode, message: string, path?: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "FileError";
		this.code = code;
		this.path = path;
	}
}

/** 由 {@link ExecutionEnv.exec} 返回的稳定、与后端无关的执行错误码。 */
export type ExecutionErrorCode =
	| "aborted"
	| "timeout"
	| "shell_unavailable"
	| "spawn_error"
	| "callback_error"
	| "unknown";

/** 由 {@link ExecutionEnv.exec} 返回的错误。 */
export class ExecutionError extends Error {
	/** 与后端无关的错误码。 */
	public code: ExecutionErrorCode;

	constructor(code: ExecutionErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "ExecutionError";
		this.code = code;
	}
}

/** 由压缩辅助函数返回的稳定错误码。 */
export type CompactionErrorCode = "aborted" | "summarization_failed" | "invalid_session" | "unknown";

/** 由压缩辅助函数返回的错误。 */
export class CompactionError extends Error {
	/** 与后端无关的错误码。 */
	public code: CompactionErrorCode;

	constructor(code: CompactionErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "CompactionError";
		this.code = code;
	}
}

/** 由分支总结辅助函数返回的稳定错误码。 */
export type BranchSummaryErrorCode = "aborted" | "summarization_failed" | "invalid_session";

/** 由分支总结辅助函数返回的错误。 */
export class BranchSummaryError extends Error {
	/** 与后端无关的错误码。 */
	public code: BranchSummaryErrorCode;

	constructor(code: BranchSummaryErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "BranchSummaryError";
		this.code = code;
	}
}

export type SessionErrorCode =
	| "not_found"
	| "invalid_session"
	| "invalid_entry"
	| "invalid_fork_target"
	| "storage"
	| "unknown";

/** 由会话存储、仓库和会话树操作抛出的错误。 */
export class SessionError extends Error {
	/** 会话子系统错误码。 */
	public code: SessionErrorCode;

	constructor(code: SessionErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "SessionError";
		this.code = code;
	}
}

export type AgentHarnessErrorCode =
	| "busy"
	| "invalid_state"
	| "invalid_argument"
	| "session"
	| "hook"
	| "auth"
	| "compaction"
	| "branch_summary"
	| "unknown";

/** 公共 AgentHarness 失败，具有稳定的顶级分类。 */
export class AgentHarnessError extends Error {
	public code: AgentHarnessErrorCode;

	constructor(code: AgentHarnessErrorCode, message: string, cause?: Error) {
		super(message, cause === undefined ? undefined : { cause });
		this.name = "AgentHarnessError";
		this.code = code;
	}
}

/** 一个文件系统对象的元数据，用于 {@link FileSystem}。 */
export interface FileInfo {
	/** {@link path} 的基本名称。 */
	name: string;
	/** 执行环境中语法规范化后的绝对寻址路径。不跟随符号链接。 */
	path: string;
	/** 对象种类。不跟随符号链接目标；使用 {@link FileSystem.canonicalPath} 显式获取。 */
	kind: FileKind;
	/** 寻址文件系统对象的大小（字节）。 */
	size: number;
	/** 自 Unix 纪元以来的修改时间（毫秒）。 */
	mtimeMs: number;
}

/** {@link Shell.exec} 的选项。 */
export interface ExecutionEnvExecOptions {
	/** 命令的工作目录。相对路径针对 {@link ExecutionEnv.cwd} 解析。默认为 {@link ExecutionEnv.cwd}。 */
	cwd?: string;
	/** 命令的附加环境变量。值会覆盖环境默认值。默认为无覆盖。 */
	env?: Record<string, string>;
	/** 超时时间（秒）。实现应在命令超过此持续时间时返回超时错误。默认为无超时。 */
	timeout?: number;
	/** 用于终止命令的中止信号。默认为无中止信号。 */
	abortSignal?: AbortSignal;
	/** 当 stdout 块产生时调用。 */
	onStdout?: (chunk: string) => void;
	/** 当 stderr 块产生时调用。 */
	onStderr?: (chunk: string) => void;
}

/**
 * 由 harness 使用的文件系统能力。
 *
 * 传递给方法的路径可以是 absolute 或相对于 {@link cwd}。文件操作返回的路径是文件系统命名空间中的寻址路径，
 * 但除非由 {@link canonicalPath} 返回，否则不会通过符号链接规范化。
 *
 * 操作方法不得抛出或拒绝。所有文件系统故障，包括意外的后端故障，都必须编码在返回的 {@link Result} 中。
 * 实现必须保持此不变性。
 */
export interface FileSystem {
	/** 相对路径的当前工作目录。 */
	cwd: string;

	/** 返回绝对寻址路径，无需路径存在，无需解析符号链接。 */
	absolutePath(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
	/** 在文件系统命名空间中连接路径段，无需结果存在。 */
	joinPath(parts: string[], abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
	/** 读取 UTF-8 文本文件。 */
	readTextFile(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
	/** 读取 UTF-8 文本行。实现应在读取 `maxLines` 行后停止。 */
	readTextLines(
		path: string,
		options?: { maxLines?: number; abortSignal?: AbortSignal },
	): Promise<Result<string[], FileError>>;
	/** 读取二进制文件。 */
	readBinaryFile(path: string, abortSignal?: AbortSignal): Promise<Result<Uint8Array, FileError>>;
	/** 创建或覆盖文件，在支持时创建父目录。 */
	writeFile(path: string, content: string | Uint8Array, abortSignal?: AbortSignal): Promise<Result<void, FileError>>;
	/** 创建或追加到文件，在支持时创建父目录。 */
	appendFile(path: string, content: string | Uint8Array, abortSignal?: AbortSignal): Promise<Result<void, FileError>>;
	/** 返回寻址路径的元数据，不跟随符号链接。 */
	fileInfo(path: string, abortSignal?: AbortSignal): Promise<Result<FileInfo, FileError>>;
	/** 列出目录的直接子项，不跟随符号链接。 */
	listDir(path: string, abortSignal?: AbortSignal): Promise<Result<FileInfo[], FileError>>;
	/** 返回已存在路径的规范路径，在支持时解析符号链接。 */
	canonicalPath(path: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
	/** 对于缺失路径返回 false。其他错误（如权限失败）返回 {@link FileError}。 */
	exists(path: string, abortSignal?: AbortSignal): Promise<Result<boolean, FileError>>;
	/** 创建目录。默认值：`recursive: true`，无中止信号。 */
	createDir(
		path: string,
		options?: { recursive?: boolean; abortSignal?: AbortSignal },
	): Promise<Result<void, FileError>>;
	/** 删除文件或目录。默认值：`recursive: false`，`force: false`，无中止信号。 */
	remove(
		path: string,
		options?: { recursive?: boolean; force?: boolean; abortSignal?: AbortSignal },
	): Promise<Result<void, FileError>>;
	/** 创建临时目录并返回其绝对路径。默认值：`prefix: "tmp-"`，无中止信号。 */
	createTempDir(prefix?: string, abortSignal?: AbortSignal): Promise<Result<string, FileError>>;
	/** 创建临时文件并返回其绝对路径。默认值：`prefix: ""`，`suffix: ""`，无中止信号。 */
	createTempFile(options?: {
		prefix?: string;
		suffix?: string;
		abortSignal?: AbortSignal;
	}): Promise<Result<string, FileError>>;

	/** 释放文件系统资源。必须是尽力而为，不得抛出或拒绝。 */
	cleanup(): Promise<void>;
}

/** 由 harness 使用的 shell 执行能力。 */
export interface Shell {
	/** 在 {@link FileSystem.cwd} 中执行 shell 命令，除非提供了 `options.cwd`。 */
	exec(
		command: string,
		options?: ExecutionEnvExecOptions,
	): Promise<Result<{ stdout: string; stderr: string; exitCode: number }, ExecutionError>>;
	/** 释放 shell 资源。必须是尽力而为，不得抛出或拒绝。 */
	cleanup(): Promise<void>;
}

/** 由 harness 使用的文件系统和进程执行环境。 */
export interface ExecutionEnv extends FileSystem, Shell {}

export interface SessionTreeEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}

export interface MessageEntry extends SessionTreeEntryBase {
	type: "message";
	message: AgentMessage;
}

export interface ThinkingLevelChangeEntry extends SessionTreeEntryBase {
	type: "thinking_level_change";
	thinkingLevel: string;
}

export interface ModelChangeEntry extends SessionTreeEntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}

export interface CompactionEntry<T = unknown> extends SessionTreeEntryBase {
	type: "compaction";
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: T;
	fromHook?: boolean;
}

export interface BranchSummaryEntry<T = unknown> extends SessionTreeEntryBase {
	type: "branch_summary";
	fromId: string;
	summary: string;
	details?: T;
	fromHook?: boolean;
}

export interface CustomEntry<T = unknown> extends SessionTreeEntryBase {
	type: "custom";
	customType: string;
	data?: T;
}

export interface CustomMessageEntry<T = unknown> extends SessionTreeEntryBase {
	type: "custom_message";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	details?: T;
	display: boolean;
}

export interface LabelEntry extends SessionTreeEntryBase {
	type: "label";
	targetId: string;
	label: string | undefined;
}

export interface SessionInfoEntry extends SessionTreeEntryBase {
	type: "session_info"; // legacy name, kept for backwards compatibility
	name?: string;
}

export interface LeafEntry extends SessionTreeEntryBase {
	type: "leaf";
	targetId: string | null;
}

export type SessionTreeEntry =
	| MessageEntry
	| ThinkingLevelChangeEntry
	| ModelChangeEntry
	| CompactionEntry
	| BranchSummaryEntry
	| CustomEntry
	| CustomMessageEntry
	| LabelEntry
	| SessionInfoEntry
	| LeafEntry;

export interface SessionContext {
	messages: AgentMessage[];
	thinkingLevel: string;
	model: { provider: string; modelId: string } | null;
}

export interface SessionMetadata {
	id: string;
	createdAt: string;
}

export interface JsonlSessionMetadata extends SessionMetadata {
	cwd: string;
	path: string;
	parentSessionPath?: string;
}

export interface SessionStorage<TMetadata extends SessionMetadata = SessionMetadata> {
	getMetadata(): Promise<TMetadata>;
	getLeafId(): Promise<string | null>;
	/** 持久化记录活动会话树叶子的叶条目。 */
	setLeafId(leafId: string | null): Promise<void>;
	createEntryId(): Promise<string>;
	appendEntry(entry: SessionTreeEntry): Promise<void>;
	getEntry(id: string): Promise<SessionTreeEntry | undefined>;
	findEntries<TType extends SessionTreeEntry["type"]>(
		type: TType,
	): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>>;
	getLabel(id: string): Promise<string | undefined>;
	getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]>;
	getEntries(): Promise<SessionTreeEntry[]>;
}

export type { Session } from "./session/session.ts";

export interface SessionCreateOptions {
	id?: string;
}

export interface SessionForkOptions {
	entryId?: string;
	position?: "before" | "at";
	id?: string;
}

export interface SessionRepo<
	TMetadata extends SessionMetadata = SessionMetadata,
	TCreateOptions extends SessionCreateOptions = SessionCreateOptions,
	TListOptions = void,
> {
	create(options: TCreateOptions): Promise<Session<TMetadata>>;
	open(metadata: TMetadata): Promise<Session<TMetadata>>;
	list(options?: TListOptions): Promise<TMetadata[]>;
	delete(metadata: TMetadata): Promise<void>;
	fork(source: TMetadata, options: SessionForkOptions & TCreateOptions): Promise<Session<TMetadata>>;
}

export interface JsonlSessionCreateOptions extends SessionCreateOptions {
	cwd: string;
	parentSessionPath?: string;
}

export interface JsonlSessionListOptions {
	cwd?: string;
}

export interface JsonlSessionRepoApi
	extends SessionRepo<JsonlSessionMetadata, JsonlSessionCreateOptions, JsonlSessionListOptions> {}

export type AgentHarnessPhase = "idle" | "turn" | "compaction" | "branch_summary" | "retry";

export type PendingSessionWrite = SessionTreeEntry extends infer TEntry
	? TEntry extends SessionTreeEntry
		? Omit<TEntry, "id" | "parentId" | "timestamp">
		: never
	: never;

export interface QueueUpdateEvent {
	type: "queue_update";
	steer: AgentMessage[];
	followUp: AgentMessage[];
	nextTurn: AgentMessage[];
}

export interface SavePointEvent {
	type: "save_point";
	hadPendingMutations: boolean;
}

export interface AbortEvent {
	type: "abort";
	clearedSteer: AgentMessage[];
	clearedFollowUp: AgentMessage[];
}

export interface SettledEvent {
	type: "settled";
	nextTurnCount: number;
}

export interface BeforeAgentStartEvent<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	type: "before_agent_start";
	prompt: string;
	images?: ImageContent[];
	systemPrompt: string;
	resources: AgentHarnessResources<TSkill, TPromptTemplate>;
}

export interface ContextEvent {
	type: "context";
	messages: AgentMessage[];
}

export interface BeforeProviderRequestEvent {
	type: "before_provider_request";
	model: Model<any>;
	sessionId: string;
	streamOptions: AgentHarnessStreamOptions;
}

export interface BeforeProviderPayloadEvent {
	type: "before_provider_payload";
	model: Model<any>;
	payload: unknown;
}

export interface AfterProviderResponseEvent {
	type: "after_provider_response";
	status: number;
	headers: Record<string, string>;
}

export interface ToolCallEvent {
	type: "tool_call";
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
}

export interface ToolResultEvent {
	type: "tool_result";
	toolCallId: string;
	toolName: string;
	input: Record<string, unknown>;
	content: Array<TextContent | ImageContent>;
	details: unknown;
	isError: boolean;
}

export interface SessionBeforeCompactEvent {
	type: "session_before_compact";
	preparation: CompactionPreparation;
	branchEntries: SessionTreeEntry[];
	customInstructions?: string;
	signal: AbortSignal;
}

export interface SessionCompactEvent {
	type: "session_compact";
	compactionEntry: CompactionEntry;
	fromHook: boolean;
}

export interface SessionBeforeTreeEvent {
	type: "session_before_tree";
	preparation: TreePreparation;
	signal: AbortSignal;
}

export interface SessionTreeEvent {
	type: "session_tree";
	newLeafId: string | null;
	oldLeafId: string | null;
	summaryEntry?: BranchSummaryEntry;
	fromHook?: boolean;
}

export interface ModelSelectEvent {
	type: "model_select";
	model: Model<any>;
	previousModel: Model<any> | undefined;
	source: "set" | "restore";
}

export interface ThinkingLevelSelectEvent {
	type: "thinking_level_select";
	level: ThinkingLevel;
	previousLevel: ThinkingLevel;
}

export interface ResourcesUpdateEvent<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> {
	type: "resources_update";
	resources: AgentHarnessResources<TSkill, TPromptTemplate>;
	previousResources: AgentHarnessResources<TSkill, TPromptTemplate>;
}

export type AgentHarnessOwnEvent<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
> =
	| QueueUpdateEvent
	| SavePointEvent
	| AbortEvent
	| SettledEvent
	| BeforeAgentStartEvent<TSkill, TPromptTemplate>
	| ContextEvent
	| BeforeProviderRequestEvent
	| BeforeProviderPayloadEvent
	| AfterProviderResponseEvent
	| ToolCallEvent
	| ToolResultEvent
	| SessionBeforeCompactEvent
	| SessionCompactEvent
	| SessionBeforeTreeEvent
	| SessionTreeEvent
	| ModelSelectEvent
	| ThinkingLevelSelectEvent
	| ResourcesUpdateEvent<TSkill, TPromptTemplate>;

export type AgentHarnessEvent<TSkill extends Skill = Skill, TPromptTemplate extends PromptTemplate = PromptTemplate> =
	| AgentEvent
	| AgentHarnessOwnEvent<TSkill, TPromptTemplate>;

export interface BeforeAgentStartResult {
	messages?: AgentMessage[];
	systemPrompt?: string;
}

export interface ContextResult {
	messages: AgentMessage[];
}

export interface BeforeProviderRequestResult {
	streamOptions?: AgentHarnessStreamOptionsPatch;
}

export interface BeforeProviderPayloadResult {
	payload: unknown;
}

export interface ToolCallResult {
	block?: boolean;
	reason?: string;
}

export interface ToolResultPatch {
	content?: Array<TextContent | ImageContent>;
	details?: unknown;
	isError?: boolean;
	terminate?: boolean;
}

export interface SessionBeforeCompactResult {
	cancel?: boolean;
	compaction?: CompactResult;
}

export interface SessionBeforeTreeResult {
	cancel?: boolean;
	summary?: { summary: string; details?: unknown };
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

export type AgentHarnessEventResultMap = {
	before_agent_start: BeforeAgentStartResult | undefined;
	context: ContextResult | undefined;
	before_provider_request: BeforeProviderRequestResult | undefined;
	before_provider_payload: BeforeProviderPayloadResult | undefined;
	after_provider_response: undefined;
	tool_call: ToolCallResult | undefined;
	tool_result: ToolResultPatch | undefined;
	session_before_compact: SessionBeforeCompactResult | undefined;
	session_compact: undefined;
	session_before_tree: SessionBeforeTreeResult | undefined;
	session_tree: undefined;
	model_select: undefined;
	thinking_level_select: undefined;
	resources_update: undefined;
	queue_update: undefined;
	save_point: undefined;
	abort: undefined;
	settled: undefined;
};

export interface AgentHarnessPromptOptions {
	images?: ImageContent[];
}

export interface AbortResult {
	clearedSteer: AgentMessage[];
	clearedFollowUp: AgentMessage[];
}

export interface CompactResult {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: unknown;
}

export interface NavigateTreeResult {
	cancelled: boolean;
	editorText?: string;
	summaryEntry?: BranchSummaryEntry;
}

export interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export interface CompactionPreparation {
	firstKeptEntryId: string;
	messagesToSummarize: AgentMessage[];
	turnPrefixMessages: AgentMessage[];
	isSplitTurn: boolean;
	tokensBefore: number;
	previousSummary?: string;
	fileOps: FileOperations;
	settings: CompactionSettings;
}

export interface FileOperations {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}

export interface TreePreparation {
	targetId: string;
	oldLeafId: string | null;
	commonAncestorId: string | null;
	entriesToSummarize: SessionTreeEntry[];
	userWantsSummary: boolean;
	customInstructions?: string;
	replaceInstructions?: boolean;
	label?: string;
}

export interface GenerateBranchSummaryOptions {
	model: Model<any>;
	apiKey: string;
	headers?: Record<string, string>;
	signal: AbortSignal;
	customInstructions?: string;
	replaceInstructions?: boolean;
	reserveTokens?: number;
}

export interface BranchSummaryResult {
	summary: string;
	readFiles: string[];
	modifiedFiles: string[];
}

export interface AgentHarnessOptions<
	TSkill extends Skill = Skill,
	TPromptTemplate extends PromptTemplate = PromptTemplate,
	TTool extends AgentTool = AgentTool,
> {
	env: ExecutionEnv;
	session: Session;
	tools?: TTool[];
	/**
	 * 可用于显式调用方法和系统提示回调的具体资源。
	 * 应用程序负责加载/重载资源，并应使用新值调用 `setResources()`。
	 */
	resources?: AgentHarnessResources<TSkill, TPromptTemplate>;
	systemPrompt?:
		| string
		| ((context: {
				env: ExecutionEnv;
				session: Session;
				model: Model<any>;
				thinkingLevel: ThinkingLevel;
				activeTools: TTool[];
				resources: AgentHarnessResources<TSkill, TPromptTemplate>;
		  }) => string | Promise<string>);
	getApiKeyAndHeaders?: (
		model: Model<any>,
	) => Promise<{ apiKey: string; headers?: Record<string, string> } | undefined>;
	/** 精选的流/提供者请求选项。在轮次开始时快照。 */
	streamOptions?: AgentHarnessStreamOptions;
	model: Model<any>;
	thinkingLevel?: ThinkingLevel;
	activeToolNames?: string[];
	steeringMode?: QueueMode;
	followUpMode?: QueueMode;
}

export type { AgentHarness } from "./agent-harness.ts";
