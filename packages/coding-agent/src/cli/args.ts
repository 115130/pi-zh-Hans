/**
 * CLI argument parsing and help display
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import chalk from "chalk";
import { APP_NAME, CONFIG_DIR_NAME, ENV_AGENT_DIR, ENV_SESSION_DIR } from "../config.ts";
import type { ExtensionFlag } from "../core/extensions/types.ts";

export type Mode = "text" | "json" | "rpc";

export interface Args {
	provider?: string;
	model?: string;
	apiKey?: string;
	systemPrompt?: string;
	appendSystemPrompt?: string[];
	thinking?: ThinkingLevel;
	continue?: boolean;
	resume?: boolean;
	help?: boolean;
	version?: boolean;
	mode?: Mode;
	noSession?: boolean;
	session?: string;
	fork?: string;
	sessionDir?: string;
	models?: string[];
	tools?: string[];
	noTools?: boolean;
	noBuiltinTools?: boolean;
	extensions?: string[];
	noExtensions?: boolean;
	print?: boolean;
	export?: string;
	noSkills?: boolean;
	skills?: string[];
	promptTemplates?: string[];
	noPromptTemplates?: boolean;
	themes?: string[];
	noThemes?: boolean;
	noContextFiles?: boolean;
	listModels?: string | true;
	offline?: boolean;
	verbose?: boolean;
	messages: string[];
	fileArgs: string[];
	/** 未知标志（可能是扩展标志）- 标志名到值的映射 */
	unknownFlags: Map<string, boolean | string>;
	diagnostics: Array<{ type: "warning" | "error"; message: string }>;
}

const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return VALID_THINKING_LEVELS.includes(level as ThinkingLevel);
}

export function parseArgs(args: string[]): Args {
	const result: Args = {
		messages: [],
		fileArgs: [],
		unknownFlags: new Map(),
		diagnostics: [],
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--version" || arg === "-v") {
			result.version = true;
		} else if (arg === "--mode" && i + 1 < args.length) {
			const mode = args[++i];
			if (mode === "text" || mode === "json" || mode === "rpc") {
				result.mode = mode;
			}
		} else if (arg === "--continue" || arg === "-c") {
			result.continue = true;
		} else if (arg === "--resume" || arg === "-r") {
			result.resume = true;
		} else if (arg === "--provider" && i + 1 < args.length) {
			result.provider = args[++i];
		} else if (arg === "--model" && i + 1 < args.length) {
			result.model = args[++i];
		} else if (arg === "--api-key" && i + 1 < args.length) {
			result.apiKey = args[++i];
		} else if (arg === "--system-prompt" && i + 1 < args.length) {
			result.systemPrompt = args[++i];
		} else if (arg === "--append-system-prompt" && i + 1 < args.length) {
			result.appendSystemPrompt = result.appendSystemPrompt ?? [];
			result.appendSystemPrompt.push(args[++i]);
		} else if (arg === "--no-session") {
			result.noSession = true;
		} else if (arg === "--session" && i + 1 < args.length) {
			result.session = args[++i];
		} else if (arg === "--fork" && i + 1 < args.length) {
			result.fork = args[++i];
		} else if (arg === "--session-dir" && i + 1 < args.length) {
			result.sessionDir = args[++i];
		} else if (arg === "--models" && i + 1 < args.length) {
			result.models = args[++i].split(",").map((s) => s.trim());
		} else if (arg === "--no-tools" || arg === "-nt") {
			result.noTools = true;
		} else if (arg === "--no-builtin-tools" || arg === "-nbt") {
			result.noBuiltinTools = true;
		} else if ((arg === "--tools" || arg === "-t") && i + 1 < args.length) {
			result.tools = args[++i]
				.split(",")
				.map((s) => s.trim())
				.filter((name) => name.length > 0);
		} else if (arg === "--thinking" && i + 1 < args.length) {
			const level = args[++i];
			if (isValidThinkingLevel(level)) {
				result.thinking = level;
			} else {
				result.diagnostics.push({
					type: "warning",
					message: `无效的思考级别 "${level}"。有效值：${VALID_THINKING_LEVELS.join(", ")}`,
				});
			}
		} else if (arg === "--print" || arg === "-p") {
			result.print = true;
			const next = args[i + 1];
			if (next !== undefined && !next.startsWith("@") && (!next.startsWith("-") || next.startsWith("---"))) {
				result.messages.push(next);
				i++;
			}
		} else if (arg === "--export" && i + 1 < args.length) {
			result.export = args[++i];
		} else if ((arg === "--extension" || arg === "-e") && i + 1 < args.length) {
			result.extensions = result.extensions ?? [];
			result.extensions.push(args[++i]);
		} else if (arg === "--no-extensions" || arg === "-ne") {
			result.noExtensions = true;
		} else if (arg === "--skill" && i + 1 < args.length) {
			result.skills = result.skills ?? [];
			result.skills.push(args[++i]);
		} else if (arg === "--prompt-template" && i + 1 < args.length) {
			result.promptTemplates = result.promptTemplates ?? [];
			result.promptTemplates.push(args[++i]);
		} else if (arg === "--theme" && i + 1 < args.length) {
			result.themes = result.themes ?? [];
			result.themes.push(args[++i]);
		} else if (arg === "--no-skills" || arg === "-ns") {
			result.noSkills = true;
		} else if (arg === "--no-prompt-templates" || arg === "-np") {
			result.noPromptTemplates = true;
		} else if (arg === "--no-themes") {
			result.noThemes = true;
		} else if (arg === "--no-context-files" || arg === "-nc") {
			result.noContextFiles = true;
		} else if (arg === "--list-models") {
			// Check if next arg is a search pattern (not a flag or file arg)
			if (i + 1 < args.length && !args[i + 1].startsWith("-") && !args[i + 1].startsWith("@")) {
				result.listModels = args[++i];
			} else {
				result.listModels = true;
			}
		} else if (arg === "--verbose") {
			result.verbose = true;
		} else if (arg === "--offline") {
			result.offline = true;
		} else if (arg.startsWith("@")) {
			result.fileArgs.push(arg.slice(1)); // Remove @ prefix
		} else if (arg.startsWith("--")) {
			const eqIndex = arg.indexOf("=");
			if (eqIndex !== -1) {
				result.unknownFlags.set(arg.slice(2, eqIndex), arg.slice(eqIndex + 1));
			} else {
				const flagName = arg.slice(2);
				const next = args[i + 1];
				if (next !== undefined && !next.startsWith("-") && !next.startsWith("@")) {
					result.unknownFlags.set(flagName, next);
					i++;
				} else {
					result.unknownFlags.set(flagName, true);
				}
			}
		} else if (arg.startsWith("-") && !arg.startsWith("--")) {
			result.diagnostics.push({ type: "error", message: `未知选项：${arg}` });
		} else if (!arg.startsWith("-")) {
			result.messages.push(arg);
		}
	}

	return result;
}

export function printHelp(extensionFlags?: ExtensionFlag[]): void {
	const extensionFlagsText =
		extensionFlags && extensionFlags.length > 0
			? `\n${chalk.bold("Extension CLI Flags:")}\n${extensionFlags
					.map((flag) => {
						const value = flag.type === "string" ? " <value>" : "";
						const description = flag.description ?? `由 ${flag.extensionPath} 注册`;
						return `  --${flag.name}${value}`.padEnd(30) + description;
					})
					.join("\n")}\n`
			: "";
	console.log(`${chalk.bold(APP_NAME)} - 带 read、bash、edit、write 工具的 AI 编码助手

${chalk.bold("用法:")}
  ${APP_NAME} [选项] [@文件...] [消息...]

${chalk.bold("命令:")}
  ${APP_NAME} install <来源> [-l]     安装扩展来源并添加到设置
  ${APP_NAME} remove <来源> [-l]      从设置中移除扩展来源
  ${APP_NAME} uninstall <来源> [-l]   remove 的别名
  ${APP_NAME} update [来源|self|pi]   更新 pi 和已安装的扩展
  ${APP_NAME} list                    列出设置中已安装的扩展
  ${APP_NAME} config                  打开 TUI 以启用/禁用包资源
  ${APP_NAME} <命令> --help           显示 install/remove/uninstall/update/list 的帮助

${chalk.bold("选项:")}
  --provider <名称>               提供者名称（默认：google）
  --model <模式>                  模型模式或 ID（支持 "provider/id" 和可选的 ":<thinking>"）
  --api-key <密钥>                API 密钥（默认使用环境变量）
  --system-prompt <文本>          系统提示词（默认：编码助手提示词）
  --append-system-prompt <文本>   将文本或文件内容附加到系统提示词（可多次使用）
  --mode <模式>                   输出模式：text（默认）、json 或 rpc
  --print, -p                     非交互模式：处理提示后退出
  --continue, -c                  继续之前的会话
  --resume, -r                    选择要恢复的会话
  --session <路径|id>             使用指定的会话文件或部分 UUID
  --fork <路径|id>                将指定会话文件或部分 UUID 分支到新会话
  --session-dir <目录>            会话存储和查找目录
  --no-session                    不保存会话（临时模式）
  --models <模式>                 用于 Ctrl+P 切换的逗号分隔模型模式
                                 支持通配符（anthropic/*、*sonnet*）和模糊匹配
  --no-tools, -nt                 默认禁用所有工具（内置和扩展）
  --no-builtin-tools, -nbt        默认禁用内置工具，但保留扩展/自定义工具
  --tools, -t <工具>              要启用的工具名称白名单（逗号分隔）
                                 适用于内置、扩展和自定义工具
  --thinking <级别>               设置思考级别：off、minimal、low、medium、high、xhigh
  --extension, -e <路径>          加载扩展文件（可多次使用）
  --no-extensions, -ne            禁用扩展发现（显式 -e 路径仍生效）
  --skill <路径>                  加载技能文件或目录（可多次使用）
  --no-skills, -ns                禁用技能发现和加载
  --prompt-template <路径>        加载提示模板文件或目录（可多次使用）
  --no-prompt-templates, -np      禁用提示模板发现和加载
  --theme <路径>                  加载主题文件或目录（可多次使用）
  --no-themes                     禁用主题发现和加载
  --no-context-files, -nc         禁用 AGENTS.md 和 CLAUDE.md 的发现和加载
  --export <文件>                 将会话文件导出为 HTML 并退出
  --list-models [搜索]            列出可用模型（带可选模糊搜索）
  --verbose                       强制详细启动（覆盖 quietStartup 设置）
  --offline                       禁用启动网络操作（等同于 PI_OFFLINE=1）
  --help, -h                      显示此帮助
  --version, -v                   显示版本号

扩展可以注册额外的标志（例如 plan-mode 扩展的 --plan）。${extensionFlagsText}

${chalk.bold("示例:")}
  # 交互模式
  ${APP_NAME}

  # 带初始提示词的交互模式
  ${APP_NAME} "列出 src/ 下的所有 .ts 文件"

  # 在初始消息中包含文件
  ${APP_NAME} @prompt.md @image.png "天空是什么颜色？"

  # 非交互模式（处理后退出）
  ${APP_NAME} -p "列出 src/ 下的所有 .ts 文件"

  # 多条消息（交互模式）
  ${APP_NAME} "读取 package.json" "我们有哪些依赖？"

  # 继续之前的会话
  ${APP_NAME} --continue "我们刚才讨论了什么？"

  # 使用不同的模型
  ${APP_NAME} --provider openai --model gpt-4o-mini "帮我重构这段代码"

  # 使用带提供者前缀的模型（无需 --provider）
  ${APP_NAME} --model openai/gpt-4o "帮我重构这段代码"

  # 使用带思考级别简写的模型
  ${APP_NAME} --model sonnet:high "解决这个复杂问题"

  # 限制模型循环到特定模型
  ${APP_NAME} --models claude-sonnet,claude-haiku,gpt-4o

  # 使用通配符限制到特定提供者
  ${APP_NAME} --models "github-copilot/*"

  # 使用固定思考级别循环模型
  ${APP_NAME} --models sonnet:high,haiku:low

  # 以特定思考级别启动
  ${APP_NAME} --thinking high "解决这个复杂问题"

  # 只读模式（无法修改文件）
  ${APP_NAME} --tools read,grep,find,ls -p "审查 src/ 下的代码"

  # 将会话文件导出为 HTML
  ${APP_NAME} --export ~/${CONFIG_DIR_NAME}/agent/sessions/--path--/session.jsonl
  ${APP_NAME} --export session.jsonl output.html

${chalk.bold("环境变量:")}
  ANTHROPIC_API_KEY                - Anthropic Claude API 密钥
  ANTHROPIC_OAUTH_TOKEN            - Anthropic OAuth 令牌（API 密钥的替代）
  OPENAI_API_KEY                   - OpenAI GPT API 密钥
  AZURE_OPENAI_API_KEY             - Azure OpenAI API 密钥
  AZURE_OPENAI_BASE_URL            - Azure OpenAI/Cognitive Services 基础 URL（例如 https://{resource}.openai.azure.com）
  AZURE_OPENAI_RESOURCE_NAME       - Azure OpenAI 资源名称（基础 URL 的替代）
  AZURE_OPENAI_API_VERSION         - Azure OpenAI API 版本（默认：v1）
  AZURE_OPENAI_DEPLOYMENT_NAME_MAP - Azure OpenAI 模型=部署名称映射（逗号分隔）
  DEEPSEEK_API_KEY                 - DeepSeek API 密钥
  GEMINI_API_KEY                   - Google Gemini API 密钥
  GROQ_API_KEY                     - Groq API 密钥
  CEREBRAS_API_KEY                 - Cerebras API 密钥
  XAI_API_KEY                      - xAI Grok API 密钥
  FIREWORKS_API_KEY                - Fireworks API 密钥
  TOGETHER_API_KEY                 - Together AI API 密钥
  OPENROUTER_API_KEY               - OpenRouter API 密钥
  AI_GATEWAY_API_KEY               - Vercel AI Gateway API 密钥
  ZAI_API_KEY                      - ZAI API 密钥
  MISTRAL_API_KEY                  - Mistral API 密钥
  MINIMAX_API_KEY                  - MiniMax API 密钥
  MOONSHOT_API_KEY                 - Moonshot AI API 密钥
  OPENCODE_API_KEY                 - OpenCode Zen/OpenCode Go API 密钥
  KIMI_API_KEY                     - Kimi For Coding API 密钥
  CLOUDFLARE_API_KEY               - Cloudflare API 令牌（Workers AI 和 AI Gateway）
  CLOUDFLARE_ACCOUNT_ID            - Cloudflare 账户 ID（两者都需要）
  CLOUDFLARE_GATEWAY_ID            - Cloudflare AI Gateway slug（AI Gateway 必需）
  XIAOMI_API_KEY                   - 小米 MiMo API 密钥（api.xiaomimimo.com 计费）
  XIAOMI_TOKEN_PLAN_CN_API_KEY     - 小米 MiMo Token Plan API 密钥（中国区域）
  XIAOMI_TOKEN_PLAN_AMS_API_KEY    - 小米 MiMo Token Plan API 密钥（阿姆斯特丹区域）
  XIAOMI_TOKEN_PLAN_SGP_API_KEY    - 小米 MiMo Token Plan API 密钥（新加坡区域）
  AWS_PROFILE                      - Amazon Bedrock 的 AWS 配置文件
  AWS_ACCESS_KEY_ID                - Amazon Bedrock 的 AWS 访问密钥
  AWS_SECRET_ACCESS_KEY            - Amazon Bedrock 的 AWS 密钥
  AWS_BEARER_TOKEN_BEDROCK         - Bedrock API 密钥（bearer 令牌）
  AWS_REGION                       - Amazon Bedrock 的 AWS 区域（例如 us-east-1）
  ${ENV_AGENT_DIR.padEnd(32)} - 配置目录（默认：~/${CONFIG_DIR_NAME}/agent）
  ${ENV_SESSION_DIR.padEnd(32)} - 会话存储目录（被 --session-dir 覆盖）
  PI_PACKAGE_DIR                   - 覆盖包目录（用于 Nix/Guix 商店路径）
  PI_OFFLINE                       - 设置为 1/true/yes 时禁用启动网络操作
  PI_TELEMETRY                     - 设置为 1/true/yes 或 0/false/no 时覆盖安装遥测
  PI_SHARE_VIEWER_URL              - /share 命令的基础 URL（默认：https://pi.dev/session/）

${chalk.bold("内置工具名称:")}
  read   - 读取文件内容
  bash   - 执行 Bash 命令
  edit   - 使用查找/替换编辑文件
  write  - 写入文件（创建/覆盖）
  grep   - 搜索文件内容（只读，默认关闭）
  find   - 通过 glob 模式查找文件（只读，默认关闭）
  ls     - 列出目录内容（只读，默认关闭）
`);
}
