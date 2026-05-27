/**
 * API 密钥与 OAuth
 *
 * 通过 AuthStorage 和 ModelRegistry 配置 API 密钥解析。
 */

import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

// 默认：AuthStorage 使用 ~/.pi/agent/auth.json
// ModelRegistry 从 ~/.pi/agent/models.json 加载内置 + 自定义模型
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session: defaultAuthSession } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
	authStorage,
	modelRegistry,
});
console.log("使用默认身份验证存储和模型注册表的会话");
defaultAuthSession.dispose();

// 自定义身份验证存储位置
const customAuthStorage = AuthStorage.create("/tmp/my-app/auth.json");
const customModelRegistry = ModelRegistry.create(customAuthStorage, "/tmp/my-app/models.json");

const { session: customAuthSession } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
	authStorage: customAuthStorage,
	modelRegistry: customModelRegistry,
});
console.log("使用自定义身份验证存储位置的会话");
customAuthSession.dispose();

// 运行时 API 密钥覆盖（不持久化到磁盘）
authStorage.setRuntimeApiKey("anthropic", "sk-my-temp-key");
const { session: runtimeKeySession } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
	authStorage,
	modelRegistry,
});
console.log("使用运行时 API 密钥覆盖的会话");
runtimeKeySession.dispose();

// 没有 models.json - 仅使用内置模型
const simpleRegistry = ModelRegistry.inMemory(authStorage);
const { session: builtInModelsSession } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
	authStorage,
	modelRegistry: simpleRegistry,
});
console.log("仅使用内置模型的会话");
builtInModelsSession.dispose();
