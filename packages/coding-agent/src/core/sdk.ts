import { join } from "node:path";
import { Agent, type AgentMessage, type ThinkingLevel } from "@earendil-works/pi-agent-core";
import { clampThinkingLevel, type Message, type Model, streamSimple } from "@earendil-works/pi-ai";
import { getAgentDir } from "../config.ts";
import { resolvePath } from "../utils/paths.ts";
import { AgentSession } from "./agent-session.ts";
import { formatNoModelsAvailableMessage } from "./auth-guidance.ts";
import { AuthStorage } from "./auth-storage.ts";
import { DEFAULT_THINKING_LEVEL } from "./defaults.ts";
import type { ExtensionRunner, LoadExtensionsResult, SessionStartEvent, ToolDefinition } from "./extensions/index.ts";
import { convertToLlm } from "./messages.ts";
import { ModelRegistry } from "./model-registry.ts";
import { findInitialModel } from "./model-resolver.ts";
import type { ResourceLoader } from "./resource-loader.ts";
import { DefaultResourceLoader } from "./resource-loader.ts";
import { getDefaultSessionDir, SessionManager } from "./session-manager.ts";
import { SettingsManager } from "./settings-manager.ts";
import { isInstallTelemetryEnabled } from "./telemetry.ts";
import { time } from "./timings.ts";
import {
	createBashTool,
	createCodingTools,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadOnlyTools,
	createReadTool,
	createWriteTool,
	type ToolName,
	withFileMutationQueue,
} from "./tools/index.ts";

export interface CreateAgentSessionOptions {
	/** 项目本地发现的工作目录。默认值：process.cwd() */
	cwd?: string;
	/** 全局配置目录。默认值：~/.pi/agent */
	agentDir?: string;

	/** 凭据的身份验证存储。默认值：AuthStorage.create(agentDir/auth.json) */
	authStorage?: AuthStorage;
	/** 模型注册表。默认值：ModelRegistry.create(authStorage, agentDir/models.json) */
	modelRegistry?: ModelRegistry;

	/** 要使用的模型。默认值：来自设置，否则使用第一个可用的 */
	model?: Model<any>;
	/** 思考级别。默认值：来自设置，否则为 'medium'（根据模型能力进行调整） */
	thinkingLevel?: ThinkingLevel;
	/** 可用于循环切换的模型（交互模式下按 Ctrl+P） */
	scopedModels?: Array<{ model: Model<any>; thinkingLevel?: ThinkingLevel }>;

	/**
	 * 当未提供显式允许列表时，可选的默认工具禁用模式。
	 *
	 * - "all"：开始时未启用任何工具
	 * - "builtin"：禁用默认内置工具（read、bash、edit、write）
	 *   但保留扩展/自定义工具启用状态
	 */
	noTools?: "all" | "builtin";
	/**
	 * 可选的工具名称允许列表。
	 *
	 * 当省略时，pi 会启用默认内置工具（read、bash、edit、write）
	 * 并且如果 `noTools` 未改变该默认行为，则保留扩展/自定义工具启用状态。
	 * 当提供时，仅启用列表中的工具名称。
	 */
	tools?: string[];
	/** 要注册的自定义工具（在内置工具之外）。 */
	customTools?: ToolDefinition[];

	/** 资源加载器。省略时，使用 DefaultResourceLoader。 */
	resourceLoader?: ResourceLoader;

	/** 会话管理器。默认值：SessionManager.create(cwd) */
	sessionManager?: SessionManager;

	/** 设置管理器。默认值：SettingsManager.create(cwd, agentDir) */
	settingsManager?: SettingsManager;
	/** 用于扩展运行时启动的会话启动事件元数据。 */
	sessionStartEvent?: SessionStartEvent;
}

/** createAgentSession 的结果 */
export interface CreateAgentSessionResult {
	/** 创建的会话 */
	session: AgentSession;
	/** 扩展结果（用于交互模式的 UI 上下文设置） */
	extensionsResult: LoadExtensionsResult;
	/** 如果会话使用与保存时不同的模型恢复，则发出的警告 */
	modelFallbackMessage?: string;
}

// 重新导出

export * from "./agent-session-runtime.ts";
export type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionFactory,
	SlashCommandInfo,
	SlashCommandSource,
	ToolDefinition,
} from "./extensions/index.ts";
export type { PromptTemplate } from "./prompt-templates.ts";
export type { Skill } from "./skills.ts";
export type { Tool } from "./tools/index.ts";

export {
	withFileMutationQueue,
	// 工具工厂（用于自定义 cwd）
	createCodingTools,
	createReadOnlyTools,
	createReadTool,
	createBashTool,
	createEditTool,
	createWriteTool,
	createGrepTool,
	createFindTool,
	createLsTool,
};

// 辅助函数

function getDefaultAgentDir(): string {
	return getAgentDir();
}

function getAttributionHeaders(
	model: Model<any>,
	settingsManager: SettingsManager,
	sessionId?: string,
): Record<string, string> | undefined {
	if (
		sessionId &&
		(model.provider === "opencode" || model.provider === "opencode-go" || model.baseUrl.includes("opencode.ai"))
	) {
		return { "x-opencode-session": sessionId, "x-opencode-client": "pi" };
	}

	if (!isInstallTelemetryEnabled(settingsManager)) {
		return undefined;
	}

	if (model.provider === "openrouter" || model.baseUrl.includes("openrouter.ai")) {
		return {
			"HTTP-Referer": "https://pi.dev",
			"X-OpenRouter-Title": "pi",
			"X-OpenRouter-Categories": "cli-agent",
		};
	}

	if (
		model.provider === "cloudflare-workers-ai" ||
		model.provider === "cloudflare-ai-gateway" ||
		model.baseUrl.includes("api.cloudflare.com") ||
		model.baseUrl.includes("gateway.ai.cloudflare.com")
	) {
		return {
			"User-Agent": "pi-coding-agent",
		};
	}

	return undefined;
}

/**
 * 使用指定选项创建一个 AgentSession。
 *
 * @example
 * ```typescript
 * // 最小配置 - 使用默认值
 * const { session } = await createAgentSession();
 *
 * // 使用显式模型
 * import { getModel } from '@earendil-works/pi-ai';
 * const { session } = await createAgentSession({
 *   model: getModel('anthropic', 'claude-opus-4-5'),
 *   thinkingLevel: 'high',
 * });
 *
 * // 继续之前的会话
 * const { session, modelFallbackMessage } = await createAgentSession({
 *   continueSession: true,
 * });
 *
 * // 完全控制
 * const loader = new DefaultResourceLoader({
 *   cwd: process.cwd(),
 *   agentDir: getAgentDir(),
 *   settingsManager: SettingsManager.create(),
 * });
 * await loader.reload();
 * const { session } = await createAgentSession({
 *   model: myModel,
 *   tools: ["read", "bash"],
 *   resourceLoader: loader,
 *   sessionManager: SessionManager.inMemory(),
 * });
 * ```
 */
export async function createAgentSession(options: CreateAgentSessionOptions = {}): Promise<CreateAgentSessionResult> {
	const cwd = resolvePath(options.cwd ?? options.sessionManager?.getCwd() ?? process.cwd());
	const agentDir = options.agentDir ? resolvePath(options.agentDir) : getDefaultAgentDir();
	let resourceLoader = options.resourceLoader;

	// 使用提供的或创建 AuthStorage 和 ModelRegistry
	const authPath = options.agentDir ? join(agentDir, "auth.json") : undefined;
	const modelsPath = options.agentDir ? join(agentDir, "models.json") : undefined;
	const authStorage = options.authStorage ?? AuthStorage.create(authPath);
	const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, modelsPath);

	const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
	const sessionManager = options.sessionManager ?? SessionManager.create(cwd, getDefaultSessionDir(cwd, agentDir));

	if (!resourceLoader) {
		resourceLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager });
		await resourceLoader.reload();
		time("resourceLoader.reload");
	}

	// 检查会话是否有要恢复的现有数据
	const existingSession = sessionManager.buildSessionContext();
	const hasExistingSession = existingSession.messages.length > 0;
	const hasThinkingEntry = sessionManager.getBranch().some((entry) => entry.type === "thinking_level_change");

	let model = options.model;
	let modelFallbackMessage: string | undefined;

	// 如果会话有数据，尝试从中恢复模型
	if (!model && hasExistingSession && existingSession.model) {
		const restoredModel = modelRegistry.find(existingSession.model.provider, existingSession.model.modelId);
		if (restoredModel && modelRegistry.hasConfiguredAuth(restoredModel)) {
			model = restoredModel;
		}
		if (!model) {
			modelFallbackMessage = `无法恢复模型 ${existingSession.model.provider}/${existingSession.model.modelId}`;
		}
	}

	// 如果仍然没有模型，使用 findInitialModel（检查设置默认值，然后检查提供者默认值）
	if (!model) {
		const result = await findInitialModel({
			scopedModels: [],
			isContinuing: hasExistingSession,
			defaultProvider: settingsManager.getDefaultProvider(),
			defaultModelId: settingsManager.getDefaultModel(),
			defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
			modelRegistry,
		});
		model = result.model;
		if (!model) {
			modelFallbackMessage = formatNoModelsAvailableMessage();
		} else if (modelFallbackMessage) {
			modelFallbackMessage += `. 正在使用 ${model.provider}/${model.id}`;
		}
	}

	let thinkingLevel = options.thinkingLevel;

	// 如果会话有数据，从中恢复思考级别
	if (thinkingLevel === undefined && hasExistingSession) {
		thinkingLevel = hasThinkingEntry
			? (existingSession.thinkingLevel as ThinkingLevel)
			: (settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL);
	}

	// 回退到设置默认值
	if (thinkingLevel === undefined) {
		thinkingLevel = settingsManager.getDefaultThinkingLevel() ?? DEFAULT_THINKING_LEVEL;
	}

	// 根据模型能力进行调整
	if (!model) {
		thinkingLevel = "off";
	} else {
		thinkingLevel = clampThinkingLevel(model, thinkingLevel) as ThinkingLevel;
	}

	const defaultActiveToolNames: ToolName[] = ["read", "bash", "edit", "write"];
	const allowedToolNames = options.tools ?? (options.noTools === "all" ? [] : undefined);
	const initialActiveToolNames: string[] = options.tools
		? [...options.tools]
		: options.noTools
			? []
			: defaultActiveToolNames;

	let agent: Agent;

	// 创建 convertToLlm 包装器，如果启用了 blockImages，则过滤图像（深度防御）
	const convertToLlmWithBlockImages = (messages: AgentMessage[]): Message[] => {
		const converted = convertToLlm(messages);
		// 动态检查设置，以便会话中的更改立即生效
		if (!settingsManager.getBlockImages()) {
			return converted;
		}
		// 从所有消息中过滤掉 ImageContent，替换为文本占位符
		return converted.map((msg) => {
			if (msg.role === "user" || msg.role === "toolResult") {
				const content = msg.content;
				if (Array.isArray(content)) {
					const hasImages = content.some((c) => c.type === "image");
					if (hasImages) {
						const filteredContent = content
							.map((c) => (c.type === "image" ? { type: "text" as const, text: "图片读取已禁用。" } : c))
							.filter(
								(c, i, arr) =>
									// 去重连续的 "图片读取已禁用。" 文本
									!(
										c.type === "text" &&
										c.text === "图片读取已禁用。" &&
										i > 0 &&
										arr[i - 1].type === "text" &&
										(arr[i - 1] as { type: "text"; text: string }).text === "图片读取已禁用。"
									),
							);
						return { ...msg, content: filteredContent };
					}
				}
			}
			return msg;
		});
	};

	const extensionRunnerRef: { current?: ExtensionRunner } = {};

	agent = new Agent({
		initialState: {
			systemPrompt: "",
			model,
			thinkingLevel,
			tools: [],
		},
		convertToLlm: convertToLlmWithBlockImages,
		streamFn: async (model, context, options) => {
			const auth = await modelRegistry.getApiKeyAndHeaders(model);
			if (!auth.ok) {
				throw new Error(auth.error);
			}
			const providerRetrySettings = settingsManager.getProviderRetrySettings();
			const timeoutMs =
				options?.timeoutMs ??
				providerRetrySettings.timeoutMs ??
				(model.api === "openai-codex-responses" ? settingsManager.getHttpIdleTimeoutMs() : undefined);
			const websocketConnectTimeoutMs =
				options?.websocketConnectTimeoutMs ?? settingsManager.getWebSocketConnectTimeoutMs();
			const attributionHeaders = getAttributionHeaders(model, settingsManager, options?.sessionId);
			return streamSimple(model, context, {
				...options,
				apiKey: auth.apiKey,
				timeoutMs,
				websocketConnectTimeoutMs,
				maxRetries: options?.maxRetries ?? providerRetrySettings.maxRetries,
				maxRetryDelayMs: options?.maxRetryDelayMs ?? providerRetrySettings.maxRetryDelayMs,
				headers:
					attributionHeaders || auth.headers || options?.headers
						? { ...attributionHeaders, ...auth.headers, ...options?.headers }
						: undefined,
			});
		},
		onPayload: async (payload, _model) => {
			const runner = extensionRunnerRef.current;
			if (!runner?.hasHandlers("before_provider_request")) {
				return payload;
			}
			return runner.emitBeforeProviderRequest(payload);
		},
		onResponse: async (response, _model) => {
			const runner = extensionRunnerRef.current;
			if (!runner?.hasHandlers("after_provider_response")) {
				return;
			}
			await runner.emit({
				type: "after_provider_response",
				status: response.status,
				headers: response.headers,
			});
		},
		sessionId: sessionManager.getSessionId(),
		transformContext: async (messages) => {
			const runner = extensionRunnerRef.current;
			if (!runner) return messages;
			return runner.emitContext(messages);
		},
		steeringMode: settingsManager.getSteeringMode(),
		followUpMode: settingsManager.getFollowUpMode(),
		transport: settingsManager.getTransport(),
		thinkingBudgets: settingsManager.getThinkingBudgets(),
		maxRetryDelayMs: settingsManager.getProviderRetrySettings().maxRetryDelayMs,
	});

	// 如果会话有现有数据，则恢复消息
	if (hasExistingSession) {
		agent.state.messages = existingSession.messages;
		if (!hasThinkingEntry) {
			sessionManager.appendThinkingLevelChange(thinkingLevel);
		}
	} else {
		// 为新会话保存初始模型和思考级别，以便在恢复时使用
		if (model) {
			sessionManager.appendModelChange(model.provider, model.id);
		}
		sessionManager.appendThinkingLevelChange(thinkingLevel);
	}

	const session = new AgentSession({
		agent,
		sessionManager,
		settingsManager,
		cwd,
		scopedModels: options.scopedModels,
		resourceLoader,
		customTools: options.customTools,
		modelRegistry,
		initialActiveToolNames,
		allowedToolNames,
		extensionRunnerRef,
		sessionStartEvent: options.sessionStartEvent,
	});
	const extensionsResult = resourceLoader.getExtensions();

	return {
		session,
		extensionsResult,
		modelFallbackMessage,
	};
}
