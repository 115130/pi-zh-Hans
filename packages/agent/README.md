# @earendil-works/pi-agent-core

支持工具执行和事件流的有状态代理。基于 `@earendil-works/pi-ai` 构建。

## 安装

```bash
npm install @earendil-works/pi-agent-core
```

## 快速开始

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

agent.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    // 仅流式输出新的文本块
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await agent.prompt("你好！");
```

## 核心概念

### AgentMessage 与 LLM 消息

代理使用 `AgentMessage` 工作，这是一种灵活的类型，可以包含：
- 标准 LLM 消息（`user`、`assistant`、`toolResult`）
- 通过声明合并实现的自定义应用特定消息类型

LLM 只能理解 `user`、`assistant` 和 `toolResult`。`convertToLlm` 函数通过在每个 LLM 调用之前过滤和转换消息来弥合这一差距。

### 消息流

```
AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
                    （可选）                               （必需的）
```

## Agent

### 创建

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    tools: [],           // 可选：初始工具列表
    thinkingLevel: "off", // 可选：思考级别
  },
});
```

### 状态

访问 `agent.state` 读取或修改当前代理状态：

```typescript
// 只读属性
agent.state.messages;       // AgentMessage[] — 当前对话
agent.state.model;          // Model — 当前模型
agent.state.thinkingLevel;  // ThinkingLevel — 当前思考级别
agent.state.systemPrompt;   // string — 系统提示
agent.state.tools;          // AgentTool[] — 当前工具
agent.state.streamingMessage; // AgentMessage | undefined — 当前正在生成的助手消息
agent.state.errorMessage;   // string | undefined — 最新的助手错误

// 可变属性（用于恢复、分支、测试等）
agent.state.messages = [/* ... */];
agent.state.systemPrompt = "新的系统提示";
agent.state.tools = [/* ... */];
agent.state.thinkingLevel = "high";
```

### 订阅事件

```typescript
const unsubscribe = agent.subscribe((event) => {
  if (event.type === "agent_start") {
    console.log("代理开始处理提示");
  }
  if (event.type === "agent_end") {
    console.log("代理完成处理");
  }
  if (event.type === "message_start") {
    console.log("新消息开始");
  }
  if (event.type === "message_update") {
    // 助手的打字流更新
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
    if (event.assistantMessageEvent.type === "thinking_delta") {
      process.stdout.write(event.assistantMessageEvent.thinking);
    }
  }
  if (event.type === "message_end") {
    console.log("消息完成");
  }
  if (event.type === "tool_execution_start") {
    console.log("工具开始：", event.toolName);
  }
  if (event.type === "tool_execution_update") {
    // 流式工具输出
  }
  if (event.type === "tool_execution_end") {
    console.log("工具结果：", event.isError ? "错误" : "成功");
  }
  if (event.type === "turn_start") {
    console.log("新的回合开始");
  }
  if (event.type === "turn_end") {
    console.log("回合结束，消息：", event.message);
  }
  if (event.type === "compaction_start") {
    console.log("压缩开始");
  }
  if (event.type === "compaction_end") {
    console.log("压缩完成");
  }
  if (event.type === "auto_retry_start") {
    console.log("开始自动重试");
  }
  if (event.type === "auto_retry_end") {
    console.log("自动重试结束");
  }
});

// 停止订阅
unsubscribe();
```

### 提示

```typescript
// 基本提示
await agent.prompt("你好！");

// 带图像的提示
await agent.prompt("这张图片里有什么？", {
  images: [{
    type: "image",
    source: {
      type: "base64",
      mediaType: "image/png",
      data: "..."
    }
  }]
});

// 带前置检查的提示（用于确认提示可发送）
await agent.prompt("帮我重构这个", {
  preflightResult: (accepted) => {
    if (!accepted) console.log("提示被拒绝");
  }
});
```

### 等待空闲

当代理正在处理时，`agent.prompt()` 将拒绝。在发送新提示前使用 `waitForIdle()`：

```typescript
await agent.waitForIdle();
await agent.prompt("下一个提示");

// 也适用于事件驱动场景
agent.prompt("初始提示").then(() => {
  agent.prompt("跟进");
});
```

### 消息历史

使用 `transformContext` 选项在发送前修改消息历史。这对压缩和分支摘要等操作很有用：

```typescript
interface TransformContextParams {
  filter: (message: AgentMessage) => boolean;                    // 移除消息
  replace: (message: AgentMessage, index: number) => AgentMessage; // 替换消息
  insert: (messages: AgentMessage[], index: number) => void;     // 插入消息
  removeSystemPrompt: () => void;                                 // 移除系统提示
  removeLastMessages: (count: number) => void;                    // 移除最后 N 条消息
  lastMessages: AgentMessage[];                                   // 消息历史的只读快照
}
```

示例：

```typescript
await agent.prompt("新消息", {
  transformContext: ({ filter, insert }) => {
    // 移除所有工具结果
    filter((msg) => msg.role !== "toolResult");
    // 在开头插入上下文
    insert([{
      role: "user",
      content: [{ type: "text", text: "相关上下文" }],
    }], 0);
  },
});
```

### 中止

```typescript
await agent.abort(); // 中止当前处理
```

### 清理

```typescript
agent.dispose(); // 清理资源
```

## 流式 Promise

`streamSimple()` 提供对 LLM 响应的增量流式访问。

```typescript
import { streamSimple } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-20250514");
if (!model) throw new Error("模型未找到");

// 流式响应
const stream = await streamSimple(model, {
  systemPrompt: "你是一个有用的助手。",
  messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
  signal: AbortSignal.timeout(30000), // 30 秒超时
  onEvent: (event) => {
    if (event.type === "text") {
      process.stdout.write(event.text);
    }
  },
});

// 或者使用 AsyncGenerator
const stream2 = await streamSimple(model, { /* ... */ });
for await (const event of stream2) {
  if (event.type === "text") {
    process.stdout.write(event.text);
  }
}
```

### 事件类型

```typescript
type StreamEvent =
  | { type: "text"; text: string }                       // 文本块
  | { type: "thinking"; thinking: string }                // 思考块
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } // 工具使用
  | { type: "error"; error: string }                      // 错误
  | { type: "complete"; usage?: Usage }                   // 完成
  | { type: "cancelled" }                                 // 已取消
  | { type: "retry_delay"; delayMs: number }              // 重试延迟
```

## 内置工具

Agent 可以配备 `AgentTool` 函数，在 LLM 响应期间执行。

```typescript
// 具有成本追踪的预构建内置工具
import { createBuiltinTools, type AgentTool } from "@earendil-works/pi-agent-core";

const tools: AgentTool[] = createBuiltinTools(/* config */);
```

### 内置工具配置

```typescript
import { createBuiltinTools } from "@earendil-works/pi-agent-core";

const tools = createBuiltinTools({
  cwd: process.cwd(),              // 工具的工作目录
  // 配置哪些内置工具可用
  toolOptions: {
    read: { /* ... */ },
    bash: { /* ... */ },
    edit: { /* ... */ },
    write: { /* ... */ },
    grep: { /* ... */ },
    find: { /* ... */ },
    ls: { /* ... */ },
  },
});
```

## 辅助函数

### convertToLlm

将 `AgentMessage[]` 转换为 LLM 理解的 `Message[]`：

```typescript
import { convertToLlm } from "@earendil-works/pi-agent-core";

const llmMessages = convertToLlm(agentMessages, model);
```

### createStackGauge

创建一个用于跟踪在 LLM 调用之间保持打开的堆叠状态量的仪表：

```typescript
import { createStackGauge } from "@earendil-works/pi-agent-core";

const gauge = createStackGauge("pending-buffer-writes", 5);
// 当仪表超过阈值时触发警告
```

## 事件参考

完整的事件类型列表：

```typescript
type AgentEvent =
  // 生命周期
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }

  // 消息流
  | { type: "message_start" }
  | { type: "message_update"; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }

  // 回合
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResult[] }

  // 工具
  | { type: "tool_execution_start"; toolName: string; toolCallId: string }
  | { type: "tool_execution_update"; toolCallId: string; output: string }
  | { type: "tool_execution_end"; toolCallId: string; isError: boolean }

  // 压缩与重试
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; reason: string; result: CompactionResult }
  | { type: "auto_retry_start"; attempt: number; maxRetries: number }
  | { type: "auto_retry_end"; attempt: number }
```

## 测试

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

// 创建具有已知初始状态的代理
const agent = new Agent({
  initialState: {
    systemPrompt: "你是一个有用的助手。",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});
```

## 许可证

MIT