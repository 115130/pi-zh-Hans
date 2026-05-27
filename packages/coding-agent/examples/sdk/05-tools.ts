/**
 * 工具配置
 *
 * 使用工具名称来选择启用的内置工具。
 *
 * 工具名称会与所有可用工具进行匹配。如果你使用了自定义的 `cwd` ，
 * createAgentSession() 在构建实际内置工具时会应用该 cwd。
 *
 * 对于自定义工具，请参见 06-extensions.ts ——自定义工具通过扩展系统使用 pi.registerTool() 注册。
 */

import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

// 只读模式（无编辑/写入权限）
const { session: readOnlySession } = await createAgentSession({
	tools: ["read", "grep", "find", "ls"],
	sessionManager: SessionManager.inMemory(),
});
console.log("只读会话已创建");
readOnlySession.dispose();

// 自定义工具选择
const { session: customToolsSession } = await createAgentSession({
	tools: ["read", "bash", "grep"],
	sessionManager: SessionManager.inMemory(),
});
console.log("自定义工具会话已创建");
customToolsSession.dispose();

// 使用自定义 cwd
const customCwd = "/path/to/project";
const { session: customCwdSession } = await createAgentSession({
	cwd: customCwd,
	tools: ["read", "bash", "edit", "write"],
	sessionManager: SessionManager.inMemory(customCwd),
});
console.log("自定义 cwd 会话已创建");
customCwdSession.dispose();

// 或为自定义 cwd 选择特定工具
const { session: specificToolsSession } = await createAgentSession({
	cwd: customCwd,
	tools: ["read", "bash", "grep"],
	sessionManager: SessionManager.inMemory(customCwd),
});
console.log("自定义 cwd 的特定工具会话已创建");
specificToolsSession.dispose();
