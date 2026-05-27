/**
 * 上下文文件 (AGENTS.md)
 *
 * 上下文文件提供加载到系统提示中的项目特定指令。
 */

import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";

// 通过 agentsFilesOverride 返回空列表来完全禁用上下文文件。
const loader = new DefaultResourceLoader({
	cwd: process.cwd(),
	agentDir: getAgentDir(),
	agentsFilesOverride: (current) => ({
		agentsFiles: [
			...current.agentsFiles,
			{
				path: "/virtual/AGENTS.md",
				content: `# 项目指南

## 代码风格
- 使用 TypeScript 严格模式
- 不使用 any 类型
- 优先使用 const 而非 let`,
			},
		],
	}),
});
await loader.reload();

// 从当前工作目录向上遍历发现 AGENTS.md 文件
const discovered = loader.getAgentsFiles().agentsFiles;
console.log("发现的上下文文件：");
for (const file of discovered) {
	console.log(`  - ${file.path} (${file.content.length} 字符)`);
}

const { session } = await createAgentSession({
	resourceLoader: loader,
	sessionManager: SessionManager.inMemory(),
});
console.log(`会话已创建，包含 ${discovered.length + 1} 个上下文文件`);
session.dispose();
