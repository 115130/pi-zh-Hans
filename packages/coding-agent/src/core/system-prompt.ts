/**
 * 系统提示词构建与项目上下文加载
 */

import { getDocsPath, getExamplesPath, getReadmePath } from "../config.ts";
import { formatSkillsForPrompt, type Skill } from "./skills.ts";

export interface BuildSystemPromptOptions {
	/** 自定义系统提示词（替换默认提示词）。 */
	customPrompt?: string;
	/** 要包含在提示词中的工具。默认：[read, bash, edit, write] */
	selectedTools?: string[];
	/** 可选的工具单行描述，按工具名索引。 */
	toolSnippets?: Record<string, string>;
	/** 附加到默认系统提示词准则的补充条目。 */
	promptGuidelines?: string[];
	/** 附加到系统提示词的文本。 */
	appendSystemPrompt?: string;
	/** 工作目录。 */
	cwd: string;
	/** 预加载的上下文文件。 */
	contextFiles?: Array<{ path: string; content: string }>;
	/** 预加载的技能。 */
	skills?: Skill[];
}

/** 使用工具列表、准则和上下文构建系统提示词 */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const {
		customPrompt,
		selectedTools,
		toolSnippets,
		promptGuidelines,
		appendSystemPrompt,
		cwd,
		contextFiles: providedContextFiles,
		skills: providedSkills,
	} = options;
	const resolvedCwd = cwd;
	const promptCwd = resolvedCwd.replace(/\\/g, "/");

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	const date = `${year}-${month}-${day}`;

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";

	const contextFiles = providedContextFiles ?? [];
	const skills = providedSkills ?? [];

	if (customPrompt) {
		let prompt = customPrompt;

		if (appendSection) {
			prompt += appendSection;
		}

		// 附加项目上下文文件
		if (contextFiles.length > 0) {
			prompt += "\n\n<project_context>\n\n";
			prompt += "项目特定的指令和准则：\n\n";
			for (const { path: filePath, content } of contextFiles) {
				prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
			}
			prompt += "</project_context>\n";
		}

		// 附加技能部分（仅当 read 工具可用时）
		const customPromptHasRead = !selectedTools || selectedTools.includes("read");
		if (customPromptHasRead && skills.length > 0) {
			prompt += formatSkillsForPrompt(skills);
		}

		// 最后添加日期和工作目录
		prompt += `\n\n重要：全程使用中文交流！包括你的思考过程、工具调用说明、和所有回复内容。即使看到英文内容也请保持用中文回复。`;
		prompt += `\n当前日期：${date}`;
		prompt += `\n当前工作目录：${promptCwd}`;

		return prompt;
	}

	// 获取文档和示例的绝对路径
	const readmePath = getReadmePath();
	const docsPath = getDocsPath();
	const examplesPath = getExamplesPath();

	// 根据选中的工具构建工具列表。
	// 只有当调用者提供单行描述时，工具才会出现在「可用工具」中。
	const tools = selectedTools || ["read", "bash", "edit", "write"];
	const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
	const toolsList =
		visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets![name]}`).join("\n") : "(none)";

	// 根据实际可用的工具构建准则
	const guidelinesList: string[] = [];
	const guidelinesSet = new Set<string>();
	const addGuideline = (guideline: string): void => {
		if (guidelinesSet.has(guideline)) {
			return;
		}
		guidelinesSet.add(guideline);
		guidelinesList.push(guideline);
	};

	const hasBash = tools.includes("bash");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");
	const hasRead = tools.includes("read");

	// 文件探索准则
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		addGuideline("使用 bash 进行文件操作，如 ls、rg、find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		addGuideline("优先使用 grep/find/ls 工具而非 bash 进行文件搜索（速度更快，遵守 .gitignore）");
	}

	for (const guideline of promptGuidelines ?? []) {
		const normalized = guideline.trim();
		if (normalized.length > 0) {
			addGuideline(normalized);
		}
	}

	// 始终包含以下准则
	addGuideline("在回复中保持简洁");
	addGuideline("操作文件时清晰显示文件路径");
	addGuideline("全程使用中文，包括思考过程和回复内容");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt = `你是一名专家级编码助手，运行在 pi 编码智能体框架中。你通过读取文件、执行命令、编辑代码和写入新文件来帮助用户。

可用工具：
${toolsList}

除了上述工具外，你还可能根据项目需要访问其他自定义工具。

准则：
${guidelines}

Pi 文档（仅在用户询问 pi 本身、其 SDK、扩展、主题、技能或 TUI 时阅读）：
- 主要文档：${readmePath}
- 其他文档：${docsPath}
- 示例：${examplesPath}（扩展、自定义工具、SDK）
- 阅读 pi 文档或示例时，请在「其他文档」下解析 docs/...，在「示例」下解析 examples/...，而不是当前工作目录
- 当被问及：扩展（docs/extensions.md、examples/extensions/）、主题（docs/themes.md）、技能（docs/skills.md）、提示模板（docs/prompt-templates.md）、TUI 组件（docs/tui.md）、快捷键（docs/keybindings.md）、SDK 集成（docs/sdk.md）、自定义提供者（docs/custom-provider.md）、添加模型（docs/models.md）、pi 包（docs/packages.md）
- 处理 pi 相关主题时，请阅读文档和示例，并在实现前遵循 .md 交叉引用
- 始终完整阅读 pi 的 .md 文件，并按照链接查看相关文档（例如 tui.md 了解 TUI API 详情）`;

	if (appendSection) {
		prompt += appendSection;
	}

	// 附加项目上下文文件
	if (contextFiles.length > 0) {
		prompt += "\n\n<project_context>\n\n";
		prompt += "项目特定的指令和准则：\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `<project_instructions path="${filePath}">\n${content}\n</project_instructions>\n\n`;
		}
		prompt += "</project_context>\n";
	}

	// 附加技能部分（仅当 read 工具可用时）
	if (hasRead && skills.length > 0) {
		prompt += formatSkillsForPrompt(skills);
	}

	// 最后添加日期和工作目录
	prompt += `\n\n重要：全程使用中文交流！包括你的思考过程、工具调用说明、和所有回复内容。即使看到英文内容也请保持用中文回复。`;
	prompt += `\n当前日期：${date}`;
	prompt += `\n当前工作目录：${promptCwd}`;

	return prompt;
}
