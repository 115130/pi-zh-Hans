/**
 * 提示定制器扩展
 *
 * 演示如何使用 systemPromptOptions 做出明智的、上下文感知的修改，
 * 而无需重新发现资源。
 *
 * 此扩展根据当前激活的工具和技能添加特定于工具的指导，
 * 尊重用户的配置。
 *
 * 用法：
 * 1. 将此文件复制到 ~/.pi/agent/extensions/ 或项目的 .pi/extensions/ 中
 * 2. 使用扩展 — 它会自动适应您激活的工具和技能
 */

import type { BuildSystemPromptOptions, ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * 添加适应当前工具集的特定工具指导。
 * 而不是附加一刀切的指令，它会读取实际加载的内容并定制指导。
 */
function addToolGuidance(options: BuildSystemPromptOptions, basePrompt: string): string {
	const hasTool = (name: string) => options.selectedTools?.includes(name) ?? false;

	const parts: string[] = [];

	if (hasTool("read")) {
		parts.push(
			"• 使用 `read` 工具获取文件内容（支持文本和图像）。",
			"  - 对于大文件，使用 `offset` 和 `limit` 分块读取。",
		);
	}

	if (hasTool("bash")) {
		parts.push("• 使用 `bash` 工具执行命令。用于文件操作，如 `ls`、`find`、`grep`。");
	}

	if (hasTool("edit")) {
		parts.push("• 使用 `edit` 工具对文件进行精确文本替换。匹配包括空白在内的确切内容。");
	}

	if (hasTool("write")) {
		parts.push("• 使用 `write` 工具创建新文件或完全覆盖现有文件。");
	}

	if (options.skills && options.skills.length > 0) {
		const skillNames = options.skills.map((s) => s.name).join(", ");
		parts.push(`\n可用技能：${skillNames}`, "使用技能文档了解特定工具的最佳实践。");
	}

	if (parts.length === 0) {
		return basePrompt;
	}

	return `${basePrompt}

## 工具指导

${parts.join("\n")}
`;
}

/**
 * 将扩展指令与用户提供的附加提示合并。
 * 这尊重用户通过 --append-system-prompt 标志或文件配置的内容，而不是重复该工作。
 */
function mergeWithUserAppend(options: BuildSystemPromptOptions): string {
	const userAppend = options.appendSystemPrompt;
	const extensionSpecific = `
## 扩展添加的上下文

此提示包含动态加载的工具指导和技能信息。
如果您有其他要求，请通过 --append-system-prompt 或项目上下文文件进行配置。
`;

	if (userAppend) {
		return `${userAppend}\n\n${extensionSpecific}`;
	}

	return extensionSpecific;
}

export default function promptCustomizer(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event) => {
		const { systemPrompt, systemPromptOptions } = event;

		const customPrompt = addToolGuidance(systemPromptOptions, systemPrompt);
		const appendSection = mergeWithUserAppend(systemPromptOptions);

		return {
			systemPrompt: `${customPrompt}${appendSection}`,
		};
	});
}
