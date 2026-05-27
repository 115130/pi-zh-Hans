/**
 * 提示模板
 *
 * 基于文件的模板，当使用 /templatename 调用时注入内容。
 */

import {
	createAgentSession,
	createSyntheticSourceInfo,
	DefaultResourceLoader,
	getAgentDir,
	type PromptTemplate,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

// 定义自定义模板
const deployTemplate: PromptTemplate = {
	name: "deploy",
	description: "部署应用程序",
	filePath: "/virtual/prompts/deploy.md",
	sourceInfo: createSyntheticSourceInfo("/virtual/prompts/deploy.md", { source: "sdk" }),
	content: `# 部署说明

1. 构建: npm run build
2. 测试: npm test
3. 部署: npm run deploy`,
};

const loader = new DefaultResourceLoader({
	cwd: process.cwd(),
	agentDir: getAgentDir(),
	promptsOverride: (current) => ({
		prompts: [...current.prompts, deployTemplate],
		diagnostics: current.diagnostics,
	}),
});
await loader.reload();

// 从 cwd/.pi/prompts/ 和 ~/.pi/agent/prompts/ 发现模板
const discovered = loader.getPrompts().prompts;
console.log("发现的提示模板:");
for (const template of discovered) {
	console.log(`  /${template.name}: ${template.description}`);
}

const { session } = await createAgentSession({
	resourceLoader: loader,
	sessionManager: SessionManager.inMemory(),
});
console.log(`会话已创建，共有 ${discovered.length + 1} 个提示模板`);
session.dispose();
