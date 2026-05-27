/**
 * 设置配置
 *
 * 使用 SettingsManager 覆盖设置。
 */

import { createAgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();

// 加载当前设置（合并全局和项目）
const settingsManagerFromDisk = SettingsManager.create(cwd);
console.log("当前设置：", JSON.stringify(settingsManagerFromDisk.getGlobalSettings(), null, 2));

// 覆盖特定设置
const settingsManager = SettingsManager.create(cwd);
settingsManager.applyOverrides({
	compaction: { enabled: false },
	retry: { enabled: true, maxRetries: 5, baseDelayMs: 1000 },
});

const { session: customSettingsSession } = await createAgentSession({
	settingsManager,
	sessionManager: SessionManager.inMemory(),
});
console.log("已使用自定义设置创建会话");
customSettingsSession.dispose();

// 设置器立即更新内存并排队持久化写入。
// 需要在持久性边界时调用 flush()。
settingsManager.setDefaultThinkingLevel("low");
await settingsManager.flush();

// 在应用层暴露设置 I/O 错误。
const settingsErrors = settingsManager.drainErrors();
if (settingsErrors.length > 0) {
	for (const { scope, error } of settingsErrors) {
		console.warn(`警告 (${scope} 设置): ${error.message}`);
	}
}

// 无需文件 I/O 的测试：
const inMemorySettings = SettingsManager.inMemory({
	compaction: { enabled: false },
	retry: { enabled: false },
});

const { session: testSession } = await createAgentSession({
	settingsManager: inMemorySettings,
	sessionManager: SessionManager.inMemory(),
});
console.log("已使用内存设置创建测试会话");
testSession.dispose();
