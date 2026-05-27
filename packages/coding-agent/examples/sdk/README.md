# SDK 示例

通过 `createAgentSession()` 和 `createAgentSessionRuntime()` 以编程方式使用 pi-coding-agent。

运行时示例展示了如何构建一个 recreation 函数，该函数闭包捕获进程全局固定输入，并在活动会话 cwd 变化时重新创建绑定到 cwd 的服务和会话。

## 示例

| 文件 | 描述 |
|------|------|
| `01-minimal.ts` | 最简单的用法，全部使用默认值 |
| `02-custom-model.ts` | 选择模型和思考级别 |
| `03-custom-prompt.ts` | 替换或修改系统提示 |
| `04-skills.ts` | 发现、过滤或替换技能 |
| `05-tools.ts` | 内置工具允许列表 |
| `06-extensions.ts` | 日志记录、拦截、结果修改 |
| `07-context-files.ts` | AGENTS.md 上下文文件 |
| `08-slash-commands.ts` | 基于文件的斜杠命令 |
| `09-api-keys-and-oauth.ts` | API 密钥解析、OAuth 配置 |
| `10-settings.ts` | 覆盖压缩、重试、终端设置 |
| `11-sessions.ts` | 内存、持久化、继续、列出会话 |
| `12-full-control.ts` | 替换所有内容，不进行发现 |
| `13-session-runtime.ts` | 管理运行时支持的会话替换 |

## 运行

```bash
cd packages/coding-agent
npx tsx examples/sdk/01-minimal.ts
```

## 快速参考

```typescript
import { getModel } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

// Auth and models setup
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// Minimal
const { session } = await createAgentSession({ authStorage, modelRegistry });

// Custom model
const model = getModel("anthropic", "claude-opus-4-5");
const { session } = await createAgentSession({ model, thinkingLevel: "high", authStorage, modelRegistry });

// Modify prompt
const loader = new DefaultResourceLoader({
  systemPromptOverride: (base) => `${base}\n\nBe concise.`,
});
await loader.reload();
const { session } = await createAgentSession({ resourceLoader: loader, authStorage, modelRegistry });

// Read-only
const { session } = await createAgentSession({ tools: ["read", "grep", "find", "ls"], authStorage, modelRegistry });

// In-memory
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

// Full control
const customAuth = AuthStorage.create("/my/app/auth.json");
customAuth.setRuntimeApiKey("anthropic", process.env.MY_KEY!);
const customRegistry = ModelRegistry.create(customAuth);

const resourceLoader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are helpful.",
  extensionFactories: [myExtension],
  skillsOverride: () => ({ skills: [], diagnostics: [] }),
  agentsFilesOverride: () => ({ agentsFiles: [] }),
  promptsOverride: () => ({ prompts: [], diagnostics: [] }),
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  model,
  authStorage: customAuth,
  modelRegistry: customRegistry,
  resourceLoader,
  tools: ["read", "bash", "my_tool"],
  customTools: [myTool],
  sessionManager: SessionManager.inMemory(),
  settingsManager: SettingsManager.inMemory(),
});

// Run prompts
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
await session.prompt("Hello");
```

## 选项

| 选项 | 默认值 | 描述 |
|--------|---------|-------------|
| `authStorage` | `AuthStorage.create()` | 凭证存储 |
| `modelRegistry` | `ModelRegistry.create(authStorage)` | 模型注册表 |
| `cwd` | `process.cwd()` | 工作目录 |
| `agentDir` | `~/.pi/agent` | 配置目录 |
| `model` | 从设置/第一个可用模型 | 使用的模型 |
| `thinkingLevel` | 从设置/"off" | 关闭、低、中、高 |
| `tools` | `["read", "bash", "edit", "write"]` 内置工具 | 内置工具、扩展工具和自定义工具的允许列表工具名称 |
| `customTools` | `[]` | 额外的工具定义 |
| `resourceLoader` | DefaultResourceLoader | 用于扩展、技能、提示、主题的资源加载器 |
| `sessionManager` | `SessionManager.create(cwd)` | 持久化 |
| `settingsManager` | `SettingsManager.create(cwd, agentDir)` | 设置覆盖 |

## 事件

```typescript
session.subscribe((event) => {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
      break;
    case "tool_execution_start":
      console.log(`Tool: ${event.toolName}`);
      break;
    case "tool_execution_end":
      console.log(`Result: ${event.result}`);
      break;
    case "agent_end":
      console.log("Done");
      break;
  }
});
```
