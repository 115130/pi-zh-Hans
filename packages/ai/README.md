# @earendil-works/pi-ai

统一的 LLM API，支持自动模型发现、提供商配置、token 和成本追踪，以及简单的上下文持久化和会中跨模型切换。

**注意**：本库仅包含支持工具调用（函数调用）的模型，因为这对代理工作流至关重要。

## Table of Contents

- [支持提供商](#支持提供商)
- [安装](#安装)
- [快速开始](#快速开始)
- [工具](#工具)
  - [定义工具](#定义工具)
  - [处理工具调用](#处理工具调用)
  - [带部分 JSON 的流式工具调用](#带部分-json-的流式工具调用)
  - [验证工具参数](#验证工具参数)
  - [完整事件参考](#完整事件参考)
- [图片输入](#图片输入)
- [图片生成](#图片生成)
  - [基础图片生成](#基础图片生成)
  - [注意事项与限制](#注意事项与限制)
- [思考/推理](#思考推理)
  - [统一接口（streamSimple/completeSimple）](#统一接口-streamsimplecompletesimple)
  - [提供商特定选项（stream/complete）](#提供商特定选项-streamcomplete)
  - [流式思考内容](#流式思考内容)
- [停止原因](#停止原因)
- [错误处理](#错误处理)
  - [中止请求](#中止请求)
  - [中止后继续](#中止后继续)
- [API、模型与提供商](#api模型与提供商)
  - [提供商与模型](#提供商与模型)
  - [查询提供商与模型](#查询提供商与模型)
  - [自定义模型](#自定义模型)
  - [OpenAI 兼容设置](#openai-兼容设置)
  - [类型安全](#类型安全)
- [跨提供商切换](#跨提供商切换)
- [上下文序列化](#上下文序列化)
- [浏览器使用](#浏览器使用)
  - [浏览器兼容说明](#浏览器兼容说明)
  - [环境变量（仅 Node.js）](#环境变量仅-nodejs)
  - [检查环境变量](#检查环境变量)
- [OAuth 提供商](#oauth-提供商)
  - [Vertex AI](#vertex-ai)
  - [CLI 登录](#cli-登录)
  - [编程式 OAuth](#编程式-oauth)
  - [登录流程示例](#登录流程示例)
  - [使用 OAuth Token](#使用-oauth-token)
  - [提供商说明](#提供商说明)
- [许可证](#许可证)

## Supported Providers

- **OpenAI**
- **Azure OpenAI (Responses)**
- **OpenAI Codex** (ChatGPT Plus/Pro subscription, requires OAuth, see below)
- **DeepSeek**
- **Anthropic**
- **Google**
- **Vertex AI** (Gemini via Vertex AI)
- **Mistral**
- **Groq**
- **Cerebras**
- **Cloudflare AI Gateway**
- **Cloudflare Workers AI**
- **xAI**
- **OpenRouter**
- **Vercel AI Gateway**
- **MiniMax**
- **Together AI**
- **GitHub Copilot** (requires OAuth, see below)
- **Amazon Bedrock**
- **OpenCode Zen**
- **OpenCode Go**
- **Fireworks** (uses Anthropic-compatible API)
- **Kimi For Coding** (Moonshot AI, uses Anthropic-compatible API)
- **Xiaomi MiMo** (uses Anthropic-compatible API; defaults to API billing endpoint, with separate Token Plan providers for `cn`/`ams`/`sgp` regions)
- **任意 OpenAI 兼容 API**：Ollama、vLLM、LM Studio 等

## 安装

```bash
npm install @earendil-works/pi-ai
```

TypeBox 的导出从 `@earendil-works/pi-ai` 中重新导出：`Type`、`Static` 和 `TSchema`。

## 快速开始

```typescript
import { Type, getModel, stream, complete, Context, Tool, StringEnum } from '@earendil-works/pi-ai';

// 完全类型化，提供商和模型都支持自动补全
const model = getModel('openai', 'gpt-4o-mini');

// 使用 TypeBox 模式定义工具，实现类型安全和验证
const tools: Tool[] = [{
  name: 'get_time',
  description: '获取当前时间',
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({ description: '可选时区（例如 America/New_York）' }))
  })
}];

// 构建对话上下文（易于序列化和在模型间传递）
const context: Context = {
  systemPrompt: '你是一个有用的助手。',
  messages: [{ role: 'user', content: '现在几点了？' }],
  tools
};

// 方案 1：流式输出，包含所有事件类型
const s = stream(model, context);

for await (const event of s) {
  switch (event.type) {
    case 'start':
      console.log(`开始使用 ${event.partial.model}`);
      break;
    case 'text_start':
      console.log('\n[文本开始]');
      break;
    case 'text_delta':
      process.stdout.write(event.delta);
      break;
    case 'text_end':
      console.log('\n[文本结束]');
      break;
    case 'thinking_start':
      console.log('[模型正在思考...]');
      break;
    case 'thinking_delta':
      process.stdout.write(event.delta);
      break;
    case 'thinking_end':
      console.log('[思考完成]');
      break;
    case 'toolcall_start':
      console.log(`\n[Tool call started: index ${event.contentIndex}]`);
      break;
    case 'toolcall_delta':
      // 部分工具参数正在流式传输
      const partialCall = event.partial.content[event.contentIndex];
      if (partialCall.type === 'toolCall') {
        console.log(`[流式传输 ${partialCall.name} 的参数]`);
      }
      break;
    case 'toolcall_end':
      console.log(`\n工具已调用：${event.toolCall.name}`);
      console.log(`参数：${JSON.stringify(event.toolCall.arguments)}`);
      break;
    case 'done':
      console.log(`\n完成：${event.reason}`);
      break;
    case 'error':
      console.error(`错误：${event.error}`);
      break;
  }
}

// Get the final message after streaming, add it to the context
const finalMessage = await s.result();
context.messages.push(finalMessage);

// 处理工具调用（如果有）
const toolCalls = finalMessage.content.filter(b => b.type === 'toolCall');
for (const call of toolCalls) {
  // 执行工具
  const result = call.name === 'get_time'
    ? new Date().toLocaleString('zh-CN', {
        timeZone: call.arguments.timezone || 'UTC',
        dateStyle: 'full',
        timeStyle: 'long'
      })
    : '未知工具';

  // 将工具结果添加到上下文（支持文本和图片）
  context.messages.push({
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text: result }],
    isError: false,
    timestamp: Date.now()
  });
}

// Continue if there were tool calls
if (toolCalls.length > 0) {
  const continuation = await complete(model, context);
  context.messages.push(continuation);
  console.log('工具执行后的回复：', continuation.content);
}

console.log(`总 token：输入 ${finalMessage.usage.input}，输出 ${finalMessage.usage.output}`);
console.log(`费用：$${finalMessage.usage.cost.total.toFixed(4)}`);

// 方案 2：获取完整响应，不流式输出
const response = await complete(model, context);

for (const block of response.content) {
  if (block.type === 'text') {
    console.log(block.text);
  } else if (block.type === 'toolCall') {
    console.log(`工具：${block.name}(${JSON.stringify(block.arguments)})`);
  }
}
```

## 工具

工具使 LLM 能够与外部系统交互。本库使用 TypeBox 模式实现类型安全的工具定义，并利用 TypeBox 内置的验证器和值转换工具进行自动验证。TypeBox 模式可以序列化和反序列化为纯 JSON，非常适合分布式系统。

### 定义工具

```typescript
import { Type, Tool, StringEnum } from '@earendil-works/pi-ai';

// 使用 TypeBox 定义工具参数
const weatherTool: Tool = {
  name: 'get_weather',
  description: '获取某个地点的当前天气',
  parameters: Type.Object({
    location: Type.String({ description: '城市名称或坐标' }),
    units: StringEnum(['celsius', 'fahrenheit'], { default: 'celsius' })
  })
};

// 注意：为兼容 Google API，使用 StringEnum 辅助函数代替 Type.Enum
// Type.Enum 会生成 Google 不支持的 anyOf/const 模式

const bookMeetingTool: Tool = {
  name: 'book_meeting',
  description: '安排会议',
  parameters: Type.Object({
    title: Type.String({ minLength: 1 }),
    startTime: Type.String({ format: 'date-time' }),
    endTime: Type.String({ format: 'date-time' }),
    attendees: Type.Array(Type.String({ format: 'email' }), { minItems: 1 })
  })
};
```

### 处理工具调用

Tool results use content blocks and can include both text and images:

```typescript
import { readFileSync } from 'fs';

const context: Context = {
  messages: [{ role: 'user', content: '伦敦的天气怎么样？' }],
  tools: [weatherTool]
};

const response = await complete(model, context);

// Check for tool calls in the response
for (const block of response.content) {
  if (block.type === 'toolCall') {
    // 使用参数执行你的工具
    // 参见"验证工具参数"部分
    const result = await executeWeatherApi(block.arguments);

    // Add tool result with text content
    context.messages.push({
      role: 'toolResult',
      toolCallId: block.id,
      toolName: block.name,
      content: [{ type: 'text', text: JSON.stringify(result) }],
      isError: false,
      timestamp: Date.now()
    });
  }
}

// Tool results can also include images (for vision-capable models)
const imageBuffer = readFileSync('chart.png');
context.messages.push({
  role: 'toolResult',
  toolCallId: 'tool_xyz',
  toolName: 'generate_chart',
  content: [
    { type: 'text', text: 'Generated chart showing temperature trends' },
    { type: 'image', data: imageBuffer.toString('base64'), mimeType: 'image/png' }
  ],
  isError: false,
  timestamp: Date.now()
});
```

### 带部分 JSON 的流式工具调用

流式传输过程中，工具调用参数会逐步解析。这使得在完整参数可用之前就能实现实时 UI 更新：

```typescript
const s = stream(model, context);

for await (const event of s) {
  if (event.type === 'toolcall_delta') {
    const toolCall = event.partial.content[event.contentIndex];

    // toolCall.arguments 包含流式过程中部分解析的 JSON
    // 这允许渐进式 UI 更新
    if (toolCall.type === 'toolCall' && toolCall.arguments) {
      // 务必防御：参数可能不完整
      // 示例：在内容完成前显示正在写入的文件路径
      if (toolCall.name === 'write_file' && toolCall.arguments.path) {
        console.log(`写入：${toolCall.arguments.path}`);

        // 内容可能部分或缺失
        if (toolCall.arguments.content) {
          console.log(`内容预览：${toolCall.arguments.content.substring(0, 100)}...`);
        }
      }
    }
  }

  if (event.type === 'toolcall_end') {
    // Here toolCall.arguments is complete (but not yet validated)
    const toolCall = event.toolCall;
    console.log(`工具完成：${toolCall.name}`, toolCall.arguments);
  }
}
```

**关于部分工具参数的重要说明：**
- 在 `toolcall_delta` 事件期间，`arguments` 包含尽力而为的部分 JSON 解析结果
- 字段可能缺失或不完整——使用前务必检查是否存在
- 字符串值可能被截断
- 数组可能不完整
- 嵌套对象可能部分填充
- 最低限度，`arguments` 将是空对象 `{}`，永远不会是 `undefined`
- Google 提供商不支持函数调用流式传输。你会收到一个包含完整参数的 `toolcall_delta` 事件

### 验证工具参数

使用 `agentLoop` 时，工具参数在执行前会自动根据你的 TypeBox 模式进行验证。如果验证失败，错误会作为工具结果返回给模型，使其可以重试。

在使用 `stream()` 或 `complete()` 实现自己的工具执行循环时，使用 `validateToolCall` 在将参数传递给工具之前进行验证：

```typescript
import { stream, validateToolCall, Tool } from '@earendil-works/pi-ai';

const tools: Tool[] = [weatherTool, calculatorTool];
const s = stream(model, { messages, tools });

for await (const event of s) {
  if (event.type === 'toolcall_end') {
    const toolCall = event.toolCall;

    try {
      // 根据工具模式验证参数（参数无效时抛出）
      const validatedArgs = validateToolCall(tools, toolCall);
      const result = await executeMyTool(toolCall.name, validatedArgs);
      // ... 将工具结果添加到上下文
    } catch (error) {
      // 验证失败——将错误作为工具结果返回，让模型重试
      context.messages.push({
        role: 'toolResult',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: [{ type: 'text', text: error.message }],
        isError: true,
        timestamp: Date.now()
      });
    }
  }
}
```

### 完整事件参考

助手消息生成期间发出的所有流式事件：

| 事件类型 | 说明 | 关键属性 |
|---------|------|---------|
| `start` | 流开始 | `partial`：初始助手消息结构 |
| `text_start` | 文本块开始 | `contentIndex`：在内容数组中的位置 |
| `text_delta` | 收到文本块 | `delta`：新文本，`contentIndex`：位置 |
| `text_end` | 文本块完成 | `content`：完整文本，`contentIndex`：位置 |
| `thinking_start` | 思考块开始 | `contentIndex`：在内容数组中的位置 |
| `thinking_delta` | 收到思考块 | `delta`：新文本，`contentIndex`：位置 |
| `thinking_end` | 思考块完成 | `content`：完整思考内容，`contentIndex`：位置 |
| `toolcall_start` | 工具调用开始 | `contentIndex`：在内容数组中的位置 |
| `toolcall_delta` | 工具参数流式传输 | `delta`：JSON 块，`partial.content[contentIndex].arguments`：部分解析的参数 |
| `toolcall_end` | 工具调用完成 | `toolCall`：完整的已验证工具调用，含 `id`、`name`、`arguments` |
| `done` | 流完成 | `reason`：停止原因（"stop"、"length"、"toolUse"），`message`：最终助手消息 |
| `error` | 发生错误 | `reason`：错误类型（"error" 或 "aborted"），`error`：包含部分内容的 AssistantMessage |

不同内容块的流式事件不保证连续。提供商可能在同一上游块中发出文本、思考和工具调用的 delta，pi 可能会交织发出相应的事件，例如 `text_start`、`text_delta`、`toolcall_start`、`text_delta`、`toolcall_delta`。使用者必须使用 `contentIndex` 将每个 delta/end 事件与其块关联，且不能假设某个块的 `*_start`/`*_delta`/`*_end` 序列不被其他块的事件中断。

## 图片输入

具有视觉能力的模型可以处理图片。你可以通过 `input` 属性检查模型是否支持图片。如果将图片传递给非视觉模型，它们会被静默忽略。

```typescript
import { readFileSync } from 'fs';
import { getModel, complete } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');

// 检查模型是否支持图片
if (model.input.includes('image')) {
  console.log('模型支持视觉');
}

const imageBuffer = readFileSync('image.png');
const base64Image = imageBuffer.toString('base64');

const response = await complete(model, {
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '这张图片里有什么？' },
      { type: 'image', data: base64Image, mimeType: 'image/png' }
    ]
  }]
});

// Access the response
for (const block of response.content) {
  if (block.type === 'text') {
    console.log(block.text);
  }
}
```

## 图片生成

图片生成使用与文本/聊天生成不同的 API。使用 `getImageModel()` / `getImageModels()` / `getImageProviders()` 来发现图片生成模型，使用 `generateImages()` 获取最终结果。

不要对图片生成使用 `stream()` 或 `complete()`。图片生成是一次性 API：`generateImages()` 等待提供商响应并返回最终的 `AssistantImages` 结果。

### 基础图片生成

```typescript
import { getImageModel, generateImages } from '@mariozechner/pi-ai';

const model = getImageModel('openrouter', 'google/gemini-2.5-flash-image');

const result = await generateImages(model, {
  input: [{ type: 'text', text: '在纯白色背景上生成一个红色圆圈。' }]
}, {
  apiKey: process.env.OPENROUTER_API_KEY
});

for (const block of result.output) {
  if (block.type === 'text') {
    console.log(block.text);
  } else if (block.type === 'image') {
    console.log(block.mimeType);
    console.log(block.data.substring(0, 32));
  }
}
```

Some models also support image input:

```typescript
import { readFileSync } from 'fs';

const imageBuffer = readFileSync('input.png');
const result = await generateImages(model, {
  input: [
    { type: 'text', text: 'Create a variation of this image with a blue background.' },
    { type: 'image', data: imageBuffer.toString('base64'), mimeType: 'image/png' }
  ]
}, {
  apiKey: process.env.OPENROUTER_API_KEY
});
```

Check capabilities on the model metadata:

```typescript
console.log(model.input);   // ['text', 'image']
console.log(model.output);  // ['image'] or ['image', 'text']
```

### 注意事项与限制

- 使用 `getImageModel(...)`，而不是 `getModel(...)`
- 使用 `generateImages()`，而不是 `stream()` / `complete()`
- 图片生成模型不参与工具调用
- 输出在 `AssistantImages.output` 中返回，可包含 base64 编码的 `ImageContent` 块和 `TextContent` 块
- 某些模型只返回图片，其他返回图片加文本。检查 `model.output`
- 某些模型接受图片输入，其他仅限文生图。检查 `model.input`
- 与流式 API 类似，图片生成支持 `apiKey`、`signal`、`headers`、`onPayload` 和 `onResponse` 等选项，结果可能包含 `stopReason`、`responseId` 和 `usage`
- 如果你希望模型在对话中分析图片或调用工具，请使用支持图片输入的常规 `stream()` / `complete()` API
- 目前，图片生成仅通过一个提供商可用：OpenRouter

## 思考/推理

许多模型支持思考/推理能力，可以展示其内部思考过程。你可以通过 `reasoning` 属性检查模型是否支持推理。如果将推理选项传递给非推理模型，它们会被静默忽略。

### 统一接口（streamSimple/completeSimple）

```typescript
import { getModel, streamSimple, completeSimple } from '@earendil-works/pi-ai';

// 许多提供商的模型支持思考/推理
const model = getModel('anthropic', 'claude-sonnet-4-20250514');
// 或 getModel('openai', 'gpt-5-mini');
// 或 getModel('google', 'gemini-2.5-flash');
// 或 getModel('xai', 'grok-code-fast-1');
// 或 getModel('groq', 'openai/gpt-oss-20b');
// 或 getModel('cerebras', 'gpt-oss-120b');
// 或 getModel('openrouter', 'z-ai/glm-4.5v');

// 检查模型是否支持推理
if (model.reasoning) {
  console.log('模型支持思考/推理');
}

// 使用简化的推理选项
const response = await completeSimple(model, {
  messages: [{ role: 'user', content: '解方程：2x + 5 = 13' }]
}, {
  reasoning: 'medium'  // 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
});

// 访问思考和文本块
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('思考：', block.thinking);
  } else if (block.type === 'text') {
    console.log('响应：', block.text);
  }
}
```

### 提供商特定选项（stream/complete）

需要精细控制时，使用提供商特定的选项：

```typescript
import { getModel, complete } from '@earendil-works/pi-ai';

// OpenAI 推理（o1、o3、gpt-5）
const openaiModel = getModel('openai', 'gpt-5-mini');
await complete(openaiModel, context, {
  reasoningEffort: 'medium',
  reasoningSummary: 'detailed'  // 仅 OpenAI Responses API
});

// Anthropic 思考（Claude Sonnet 4）
const anthropicModel = getModel('anthropic', 'claude-sonnet-4-20250514');
await complete(anthropicModel, context, {
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192  // 可选 token 限制
});

// Google Gemini 思考
const googleModel = getModel('google', 'gemini-2.5-flash');
await complete(googleModel, context, {
  thinking: {
    enabled: true,
    budgetTokens: 8192  // -1 为动态，0 为禁用
  }
});
```

### 流式思考内容

流式传输时，思考内容通过特定事件传递：

```typescript
const s = streamSimple(model, context, { reasoning: 'high' });

for await (const event of s) {
  switch (event.type) {
    case 'thinking_start':
      console.log('[Model started thinking]');
      break;
    case 'thinking_delta':
      process.stdout.write(event.delta);  // 流式思考内容
      break;
    case 'thinking_end':
      console.log('\n[Thinking complete]');
      break;
  }
}
```

## 停止原因

每条 `AssistantMessage` 都包含 `stopReason` 字段，指示生成结束的原因：

- `"stop"` — 正常完成，模型结束响应
- `"length"` — 输出达到最大 token 限制
- `"toolUse"` — 模型正在调用工具，期望工具结果
- `"error"` — 生成过程中发生错误
- `"aborted"` — 请求通过中止信号被取消

`AssistantMessage` 还可能包含 `responseId`——当底层 API 暴露时，这是提供商特定的上游响应或消息标识符。不要假设它在所有提供商上始终存在。

## 错误处理

当请求以错误结束时（包括中止和工具调用验证错误），流式 API 会发出错误事件：

```typescript
// In streaming
for await (const event of stream) {
  if (event.type === 'error') {
    // event.reason is either "error" or "aborted"
    // event.error is the AssistantMessage with partial content
    console.error(`错误（${event.reason}）：`, event.error.errorMessage);
    console.log('部分内容：', event.error.content);
  }
}

// The final message will have the error details
const message = await stream.result();
if (message.stopReason === 'error' || message.stopReason === 'aborted') {
  console.error('请求失败：', message.errorMessage);
  // message.content contains any partial content received before the error
  // message.usage contains partial token counts and costs
}
```

### 中止请求

中止信号允许你取消正在进行的请求。中止的请求具有 `stopReason === 'aborted'`：

```typescript
import { getModel, stream } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');
const controller = new AbortController();

// Abort after 2 seconds
setTimeout(() => controller.abort(), 2000);

const s = stream(model, {
  messages: [{ role: 'user', content: '写一个长故事' }]
}, {
  signal: controller.signal
});

for await (const event of s) {
  if (event.type === 'text_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'error') {
    // event.reason tells you if it was "error" or "aborted"
    console.log(`${event.reason === 'aborted' ? '已中止' : '错误'}：`, event.error.errorMessage);
  }
}

// Get results (may be partial if aborted)
const response = await s.result();
if (response.stopReason === 'aborted') {
  console.log('请求已中止：', response.errorMessage);
  console.log('收到的部分内容：', response.content);
  console.log('已使用的 token：', response.usage);
}
```

### 中止后继续

中止的消息可以添加到对话上下文中，并在后续请求中继续：

```typescript
const context = {
  messages: [
    { role: 'user', content: '详细解释量子计算' }
  ]
};

// First request gets aborted after 2 seconds
const controller1 = new AbortController();
setTimeout(() => controller1.abort(), 2000);

const partial = await complete(model, context, { signal: controller1.signal });

// Add the partial response to context
context.messages.push(partial);
context.messages.push({ role: 'user', content: '请继续' });

// Continue the conversation
const continuation = await complete(model, context);
```

### 调试提供商请求体

使用 `onPayload` 回调检查发送给提供商的请求体。这对调试请求格式问题或提供商验证错误很有用。

```typescript
const response = await complete(model, context, {
  onPayload: (payload) => {
    console.log('提供商请求体：', JSON.stringify(payload, null, 2));
  }
});
```

The callback is supported by `stream`, `complete`, `streamSimple`, and `completeSimple`.

## API、模型与提供商

本库使用 API 实现的注册表。内置 API 包括：

- **`anthropic-messages`**：Anthropic Messages API（`streamAnthropic`、`AnthropicOptions`）
- **`google-generative-ai`**：Google Generative AI API（`streamGoogle`、`GoogleOptions`）
- **`google-vertex`**：Google Vertex AI API（`streamGoogleVertex`、`GoogleVertexOptions`）
- **`mistral-conversations`**：Mistral Conversations API（`streamMistral`、`MistralOptions`）
- **`openai-completions`**：OpenAI Chat Completions API（`streamOpenAICompletions`、`OpenAICompletionsOptions`）
- **`openai-responses`**：OpenAI Responses API（`streamOpenAIResponses`、`OpenAIResponsesOptions`）
- **`openai-codex-responses`**：OpenAI Codex Responses API（`streamOpenAICodexResponses`、`OpenAICodexResponsesOptions`）
- **`azure-openai-responses`**：Azure OpenAI Responses API（`streamAzureOpenAIResponses`、`AzureOpenAIResponsesOptions`）
- **`bedrock-converse-stream`**：Amazon Bedrock Converse API（`streamBedrock`、`BedrockOptions`）

### 用于测试的 Faux 提供商

`registerFauxProvider()` 注册一个临时的内存提供商，用于测试和演示。它是可选的，不属于内置提供商集。

```typescript
import {
  complete,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
  registerFauxProvider,
  stream,
} from '@earendil-works/pi-ai';

const registration = registerFauxProvider({
  tokensPerSecond: 50 // optional
});

const model = registration.getModel();
const context = {
  messages: [{ role: 'user', content: '总结 package.json 然后调用 echo', timestamp: Date.now() }]
};

registration.setResponses([
  fauxAssistantMessage([
    fauxThinking('需要先检查包元数据。'),
    fauxToolCall('echo', { text: 'package.json' })
  ], { stopReason: 'toolUse' })
]);

const first = await complete(model, context, {
  sessionId: 'session-1',
  cacheRetention: 'short'
});
context.messages.push(first);

context.messages.push({
  role: 'toolResult',
  toolCallId: first.content.find((block) => block.type === 'toolCall')!.id,
  toolName: 'echo',
  content: [{ type: 'text', text: 'package.json 内容在此' }],
  isError: false,
  timestamp: Date.now()
});

registration.setResponses([
  fauxAssistantMessage([
    fauxThinking('现在我可以总结工具输出了。'),
    fauxText('以下是总结。')
  ])
]);

const s = stream(model, context);
for await (const event of s) {
  console.log(event.type);
}

// Optional: register multiple faux models for model-switching tests
const multiModel = registerFauxProvider({
  models: [
    { id: 'faux-fast', reasoning: false },
    { id: 'faux-thinker', reasoning: true }
  ]
});
const thinker = multiModel.getModel('faux-thinker');

console.log(thinker?.reasoning);
console.log(registration.getPendingResponseCount());
console.log(registration.state.callCount);
registration.unregister();
multiModel.unregister();
```

说明：
- 响应按请求开始顺序从队列中消费
- 如果队列为空，faux 提供商返回一条助手错误消息，内容为 `errorMessage: "没有更多的 faux 响应排队"`
- 使用 `registration.setResponses([...])` 替换剩余队列，使用 `registration.appendResponses([...])` 添加更多响应
- `registration.models` 暴露所有注册的 faux 模型。`registration.getModel()` 返回第一个，`registration.getModel(id)` 返回指定模型
- 使用 `fauxAssistantMessage(...)` 编写脚本化的助手回复。使用 `fauxText(...)`、`fauxThinking(...)` 和 `fauxToolCall(...)` 构建内容块，无需手动填充底层字段
- `registration.unregister()` 从全局 API 注册表中移除临时提供商
- 使用量按约每 4 个字符 1 个 token 估算。当存在 `sessionId` 且 `cacheRetention` 不是 `"none"` 时，会自动模拟提示缓存的读取和写入
- 工具调用参数通过 `toolcall_delta` 块增量流式传输
- 默认情况下，每个流式块在自己的微任务中发出。设置 `tokensPerSecond` 以实时控制块交付速度
- 预期用途是每次注册执行一个确定性的脚本化流程。如果需要独立的并发流程，请注册单独的 faux 提供商

### 提供商与模型

**提供商**通过特定的 API 提供模型。例如：
- **Anthropic** 模型使用 `anthropic-messages` API
- **Google** 模型使用 `google-generative-ai` API
- **OpenAI** 模型使用 `openai-responses` API
- **Mistral** 模型使用 `mistral-conversations` API
- **xAI、Cerebras、Groq、Together AI 等**模型使用 `openai-completions` API（OpenAI 兼容）

### 查询提供商与模型

```typescript
import { getProviders, getModels, getModel } from '@earendil-works/pi-ai';

// 获取所有可用提供商
const providers = getProviders();
console.log(providers); // ['openai', 'anthropic', 'google', 'xai', 'groq', ...]

// 获取提供商的所有模型（完全类型化）
const anthropicModels = getModels('anthropic');
for (const model of anthropicModels) {
  console.log(`${model.id}: ${model.name}`);
  console.log(`  API: ${model.api}`); // 'anthropic-messages'
  console.log(`  上下文：${model.contextWindow} tokens`);
  console.log(`  视觉：${model.input.includes('image')}`);
  console.log(`  推理：${model.reasoning}`);
}

// 获取特定模型（提供商和模型 ID 在 IDE 中都有自动补全）
const model = getModel('openai', 'gpt-4o-mini');
console.log(`使用 ${model.name}，通过 ${model.api} API`);
```

### 自定义模型

你可以为本地推理服务器或自定义端点创建自定义模型：

```typescript
import { Model, stream } from '@earendil-works/pi-ai';

// 示例：使用 OpenAI 兼容 API 的 Ollama
const ollamaModel: Model<'openai-completions'> = {
  id: 'llama-3.1-8b',
  name: 'Llama 3.1 8B（Ollama）',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000
};

// 示例：带显式兼容设置 LiteLLM 代理
const litellmModel: Model<'openai-completions'> = {
  id: 'gpt-4o',
  name: 'GPT-4o（通过 LiteLLM）',
  api: 'openai-completions',
  provider: 'litellm',
  baseUrl: 'http://localhost:4000/v1',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
  compat: {
    supportsStore: false,  // LiteLLM 不支持 store 字段
  }
};

// 示例：带自定义头的端点（绕过 Cloudflare 机器人检测）
const proxyModel: Model<'anthropic-messages'> = {
  id: 'claude-sonnet-4',
  name: 'Claude Sonnet 4（代理）',
  api: 'anthropic-messages',
  provider: 'custom-proxy',
  baseUrl: 'https://proxy.example.com/v1',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  contextWindow: 200000,
  maxTokens: 8192,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'X-Custom-Auth': 'bearer-token-here'
  }
};

// Use the custom model
const response = await stream(ollamaModel, context, {
  apiKey: 'dummy' // Ollama doesn't need a real key
});
```

Some OpenAI-compatible servers do not understand the `developer` role used for reasoning-capable models. For those providers, set `compat.supportsDeveloperRole` to `false` so the system prompt is sent as a `system` message instead. If the server also does not support `reasoning_effort`, set `compat.supportsReasoningEffort` to `false` too.

Use model-level `thinkingLevelMap` to describe model-specific thinking controls. Keys are pi thinking levels (`off`, `minimal`, `low`, `medium`, `high`, `xhigh`). Missing keys use provider defaults, string values are sent to the provider, and `null` marks a level unsupported.

This commonly applies to Ollama, vLLM, SGLang, and similar OpenAI-compatible servers. You can set `compat` at the provider level or per model.

```typescript
const ollamaReasoningModel: Model<'openai-completions'> = {
  id: 'gpt-oss:20b',
  name: 'GPT-OSS 20B（Ollama）',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: true,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131072,
  maxTokens: 32000,
  thinkingLevelMap: {
    minimal: null,
    low: null,
    medium: null,
    high: 'high',
    xhigh: null,
  },
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
  }
};
```

### OpenAI 兼容设置

`openai-completions` API 被许多提供商实现，但各有微小差异。默认情况下，库会根据 `baseUrl` 对小部分已知的 OpenAI 兼容提供商（Cerebras、xAI、Chutes、DeepSeek、Together AI、zAi、OpenCode、Cloudflare Workers AI 等）自动检测兼容性设置。对于自定义代理或未知端点，你可以通过 `compat` 字段覆盖这些设置。对于 `openai-responses` 模型，compat 字段仅支持 Responses 特定的标志。

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;           // 提供商是否支持 `store` 字段（默认：true）
  supportsDeveloperRole?: boolean;   // 提供商是否支持 `developer` 角色 vs `system`（默认：true）
  supportsReasoningEffort?: boolean; // 提供商是否支持 `reasoning_effort`（默认：true）
  supportsUsageInStreaming?: boolean; // 提供商是否支持 `stream_options: { include_usage: true }`（默认：true）
  supportsStrictMode?: boolean;      // 提供商是否支持工具定义中的 `strict`（默认：true）
  sendSessionAffinityHeaders?: boolean; // 是否在启用缓存时从 `sessionId` 发送 `session_id`、`x-client-request-id` 和 `x-session-affinity`（默认：false）
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';  // 使用的字段名（默认：max_completion_tokens）
  requiresToolResultName?: boolean;  // 工具结果是否需要 `name` 字段（默认：false）
  requiresAssistantAfterToolResult?: boolean; // 工具结果后是否需要跟随助手消息（默认：false）
  requiresThinkingAsText?: boolean;  // 思考块是否需要转换为文本（默认：false）
  requiresReasoningContentOnAssistantMessages?: boolean; // 所有重播的助手消息在启用推理时是否需要包含空的 reasoning_content（默认：DeepSeek 自动检测）
  thinkingFormat?: 'openai' | 'openrouter' | 'deepseek' | 'together' | 'zai' | 'qwen' | 'qwen-chat-template'; // 推理参数格式：'openai' 使用 reasoning_effort，'openrouter' 使用 reasoning: { effort }，'deepseek' 使用 thinking: { type } 加 reasoning_effort，'together' 使用 reasoning: { enabled } 加 reasoning_effort（支持时），'zai' 使用 enable_thinking，'qwen' 使用 enable_thinking，'qwen-chat-template' 使用 chat_template_kwargs.enable_thinking（默认：openai）
  cacheControlFormat?: 'anthropic';  // Anthropic 风格的 cache_control，应用于系统提示、最后一个工具以及最后一个用户/助手文本内容
  openRouterRouting?: OpenRouterRouting; // OpenRouter 路由偏好（默认：{}）
  vercelGatewayRouting?: VercelGatewayRouting; // Vercel AI Gateway 路由偏好（默认：{}）
}

interface OpenAIResponsesCompat {
  // Reserved for future use
}
```

如果未设置 `compat`，库会回退到基于 URL 的检测。如果 `compat` 部分设置，未指定的字段会使用检测到的默认值。这对以下场景很有用：

- **LiteLLM 代理**：可能不支持 `store` 字段
- **自定义推理服务器**：可能使用非标准字段名
- **自托管端点**：可能有不同的功能支持

### 类型安全

模型按其 API 类型化，这保持了模型元数据的准确性。当你直接调用提供商函数时，会强制使用提供商特定的选项类型。通用的 `stream` 和 `complete` 函数接受包含额外提供商字段的 `StreamOptions`。

```typescript
import { streamAnthropic, type AnthropicOptions } from '@earendil-works/pi-ai';

// TypeScript knows this is an Anthropic model
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');

const options: AnthropicOptions = {
  thinkingEnabled: true,
  thinkingBudgetTokens: 2048
};

await streamAnthropic(claude, context, options);
```

## 跨提供商切换

本库支持在同一对话中无缝切换不同的 LLM 提供商。这允许你在保留上下文（包括思考块、工具调用和工具结果）的同时，在对话中途切换模型。

### 工作原理

当来自一个提供商的消息发送到不同提供商时，库会自动进行兼容性转换：

- **用户和工具结果消息**原样传递
- **来自同一提供商/API 的助手消息**保持不变
- **来自不同提供商的助手消息**的思考块会被转换为带 `<thinking>` 标签的文本
- **工具调用和常规文本**保持不变

### 示例：多提供商对话

```typescript
import { getModel, complete, Context } from '@earendil-works/pi-ai';

// 使用 Claude 开始
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
const context: Context = {
  messages: []
};

context.messages.push({ role: 'user', content: '25 * 18 等于多少？' });
const claudeResponse = await complete(claude, context, {
  thinkingEnabled: true
});
context.messages.push(claudeResponse);

// 切换到 GPT-5 —— 它会将 Claude 的思考内容视为 <thinking> 标签包裹的文本
const gpt5 = getModel('openai', 'gpt-5-mini');
context.messages.push({ role: 'user', content: '这个计算正确吗？' });
const gptResponse = await complete(gpt5, context);
context.messages.push(gptResponse);

// 切换到 Gemini
const gemini = getModel('google', 'gemini-2.5-flash');
context.messages.push({ role: 'user', content: '原本的问题是什么？' });
const geminiResponse = await complete(gemini, context);
```

### 提供商兼容性

所有提供商都可以处理来自其他提供商的消息，包括：
- 文本内容
- 工具调用和工具结果（包括工具结果中的图片）
- 思考/推理块（跨提供商兼容性下转换为带标签的文本）
- 带部分内容的中止消息

这实现了灵活的工作流，你可以：
- 使用快速模型处理初始响应
- 切换到更强大的模型进行复杂推理
- 为特定任务使用专业模型
- 在提供商故障时保持对话连续性

## Context Serialization

The `Context` object can be easily serialized and deserialized using standard JSON methods, making it simple to persist conversations, implement chat history, or transfer contexts between services:

```typescript
import { Context, getModel, complete } from '@earendil-works/pi-ai';

// Create and use a context
const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [
    { role: 'user', content: 'What is TypeScript?' }
  ]
};

const model = getModel('openai', 'gpt-4o-mini');
const response = await complete(model, context);
context.messages.push(response);

// 序列化整个上下文
const serialized = JSON.stringify(context);
console.log('已序列化上下文大小：', serialized.length, '字节');

// 保存到数据库、localStorage、文件等
localStorage.setItem('conversation', serialized);

// 稍后：反序列化并继续对话
const restored: Context = JSON.parse(localStorage.getItem('conversation')!);
restored.messages.push({ role: 'user', content: '再多讲讲它的类型系统' });

// 使用任何模型继续
const newModel = getModel('anthropic', 'claude-3-5-haiku-20241022');
const continuation = await complete(newModel, restored);
```

> **注意**：如果上下文包含图片（如上文图片输入部分所示的 base64 编码），它们也会被序列化。

## Browser Usage

The library supports browser environments. You must pass the API key explicitly since environment variables are not available in browsers:

```typescript
import { getModel, complete } from '@earendil-works/pi-ai';

// API key must be passed explicitly in browser
const model = getModel('anthropic', 'claude-3-5-haiku-20241022');

const response = await complete(model, {
  messages: [{ role: 'user', content: 'Hello!' }]
}, {
  apiKey: 'your-api-key'
});
```

> **安全警告**：在前端代码中暴露 API 密钥是危险的。任何人都可以提取并滥用你的密钥。仅将此方法用于内部工具或演示。对于生产应用，请使用后端代理来保护你的 API 密钥。

### 浏览器兼容说明

- Amazon Bedrock（`bedrock-converse-stream`）在浏览器环境中不受支持
- OAuth 登录流程在浏览器环境中不受支持。在 Node.js 中使用 `@earendil-works/pi-ai/oauth` 入口点
- 在浏览器构建中，Bedrock 仍然会出现在模型列表中。Bedrock 模型的调用会在运行时失败
- 如果你需要从 Web 应用使用 Bedrock 或基于 OAuth 的身份验证，请使用服务端代理或后端服务

### 环境变量（仅 Node.js）

在 Node.js 环境中，你可以设置环境变量以避免传递 API 密钥：

| 提供商 | 环境变量 |
|---------|------------------------|
| OpenAI | `OPENAI_API_KEY` |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL`（例如 `https://{resource}.openai.azure.com`）或 `AZURE_OPENAI_RESOURCE_NAME`。支持 `*.openai.azure.com` 和 `*.cognitiveservices.azure.com`；根端点自动规范化为 `/openai/v1`。可选：`AZURE_OPENAI_API_VERSION`（默认 `v1`）、`AZURE_OPENAI_DEPLOYMENT_NAME_MAP`。 |
| Anthropic | `ANTHROPIC_API_KEY` 或 `ANTHROPIC_OAUTH_TOKEN` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Google | `GEMINI_API_KEY` |
| Vertex AI | `GOOGLE_CLOUD_API_KEY` 或 `GOOGLE_CLOUD_PROJECT`（或 `GCLOUD_PROJECT`）+ `GOOGLE_CLOUD_LOCATION` + ADC |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_GATEWAY_ID` |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` |
| xAI | `XAI_API_KEY` |
| Fireworks | `FIREWORKS_API_KEY` |
| Together AI | `TOGETHER_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` |
| zAI | `ZAI_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| OpenCode Zen / OpenCode Go | `OPENCODE_API_KEY` |
| Kimi For Coding | `KIMI_API_KEY` |
| Xiaomi MiMo（API 计费） | `XIAOMI_API_KEY` |
| Xiaomi MiMo Token 计划（中国） | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| Xiaomi MiMo Token 计划（阿姆斯特丹） | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` |
| Xiaomi MiMo Token 计划（新加坡） | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` |

设置后，库会自动使用这些密钥：

```typescript
// 使用 OPENAI_API_KEY 环境变量
const model = getModel('openai', 'gpt-4o-mini');
const response = await complete(model, context);

// 或使用显式密钥覆盖
const response = await complete(model, context, {
  apiKey: 'sk-different-key'
});
```

### 检查环境变量

```typescript
import { getEnvApiKey } from '@earendil-works/pi-ai';

// 检查环境变量中是否设置了 API 密钥
const key = getEnvApiKey('openai');  // 检查 OPENAI_API_KEY
```

## OAuth 提供商

以下提供商需要 OAuth 认证而不是静态 API 密钥：

- **Anthropic**（Claude Pro/Max 订阅）
- **OpenAI Codex**（ChatGPT Plus/Pro 订阅，访问 GPT-5.x Codex 模型）
- **GitHub Copilot**（Copilot 订阅）

对于付费 Cloud Code Assist 订阅，设置 `GOOGLE_CLOUD_PROJECT` 或 `GOOGLE_CLOUD_PROJECT_ID` 为你的项目 ID。

### Vertex AI

Vertex AI 模型支持 Google Cloud API 密钥或应用默认凭据（ADC）：

- **API 密钥**：设置 `GOOGLE_CLOUD_API_KEY` 或在调用选项中传递 `apiKey`
- **本地开发（ADC）**：运行 `gcloud auth application-default login`
- **CI/生产（ADC）**：设置 `GOOGLE_APPLICATION_CREDENTIALS` 指向服务账号 JSON 密钥文件

使用 ADC 时，同时设置 `GOOGLE_CLOUD_PROJECT`（或 `GCLOUD_PROJECT`）和 `GOOGLE_CLOUD_LOCATION`。你也可以在调用选项中传递 `project`/`location`。使用 `GOOGLE_CLOUD_API_KEY` 时，不需要 `project` 和 `location`。

示例：

```bash
# 本地（使用你的用户凭据）
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="my-project"
export GOOGLE_CLOUD_LOCATION="us-central1"

# CI/生产（服务账号密钥文件）
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

```typescript
import { getModel, complete } from '@earendil-works/pi-ai';

(async () => {
  const model = getModel('google-vertex', 'gemini-2.5-flash');
  const response = await complete(model, {
    messages: [{ role: 'user', content: '来自 Vertex AI 的问候' }]
  }, {
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
  });

  for (const block of response.content) {
    if (block.type === 'text') console.log(block.text);
  }
})().catch(console.error);
```

官方文档：[应用默认凭据](https://cloud.google.com/docs/authentication/application-default-credentials)

### CLI 登录

最快的认证方式：

```bash
npx @earendil-works/pi-ai login              # interactive provider selection
npx @earendil-works/pi-ai login anthropic    # login to specific provider
npx @earendil-works/pi-ai list               # list available providers
```

凭据保存在当前目录的 `auth.json` 文件中。

### 编程式 OAuth

库通过 `@earendil-works/pi-ai/oauth` 入口点提供登录和 token 刷新函数。凭据存储由调用方负责。

```typescript
import {
  // Login functions (return credentials, do not store)
  loginAnthropic,
  loginOpenAICodex,
  loginGitHubCopilot,
  loginGeminiCli,

  // Token management
  refreshOAuthToken,   // (provider, credentials) => new credentials
  getOAuthApiKey,      // (provider, credentialsMap) => { newCredentials, apiKey } | null

  // Types
  type OAuthProvider,
  type OAuthCredentials,
} from '@earendil-works/pi-ai/oauth';
```

### 登录流程示例

```typescript
import { loginGitHubCopilot } from '@earendil-works/pi-ai/oauth';
import { writeFileSync } from 'fs';

const credentials = await loginGitHubCopilot({
  onAuth: (url, instructions) => {
    console.log(`打开：${url}`);
    if (instructions) console.log(instructions);
  },
  onPrompt: async (prompt) => {
    return await getUserInput(prompt.message);
  },
  onProgress: (message) => console.log(message)
});

// 自行存储凭据
const auth = { 'github-copilot': { type: 'oauth', ...credentials } };
writeFileSync('auth.json', JSON.stringify(auth, null, 2));
```

### 使用 OAuth Token

使用 `getOAuthApiKey()` 获取 API 密钥，如果过期则自动刷新：

```typescript
import { getModel, complete } from '@earendil-works/pi-ai';
import { getOAuthApiKey } from '@earendil-works/pi-ai/oauth';
import { readFileSync, writeFileSync } from 'fs';

// 加载存储的凭据
const auth = JSON.parse(readFileSync('auth.json', 'utf-8'));

// 获取 API 密钥（过期则刷新）
const result = await getOAuthApiKey('github-copilot', auth);
if (!result) throw new Error('未登录');

// 保存刷新后的凭据
auth['github-copilot'] = { type: 'oauth', ...result.newCredentials };
writeFileSync('auth.json', JSON.stringify(auth, null, 2));

// 使用 API 密钥
const model = getModel('github-copilot', 'gpt-4o');
const response = await complete(model, {
  messages: [{ role: 'user', content: '你好！' }]
}, { apiKey: result.apiKey });
```

### 提供商说明

**OpenAI Codex**: Requires a ChatGPT Plus or Pro subscription. Provides access to GPT-5.x Codex models with extended context windows and reasoning capabilities. The library automatically handles session-based prompt caching when `sessionId` is provided in stream options. You can set `transport` in stream options to `"sse"`, `"websocket"`, or `"auto"` for Codex Responses transport selection. When using WebSocket with a `sessionId`, connections are reused per session and expire after 5 minutes of inactivity.

**Azure OpenAI (Responses)**: Uses the Responses API only. Set `AZURE_OPENAI_API_KEY` and either `AZURE_OPENAI_BASE_URL` or `AZURE_OPENAI_RESOURCE_NAME`. `AZURE_OPENAI_BASE_URL` supports both `https://<resource>.openai.azure.com` and `https://<resource>.cognitiveservices.azure.com`; root endpoints are normalized to `.../openai/v1` automatically. Use `AZURE_OPENAI_API_VERSION` (defaults to `v1`) to override the API version if needed. Deployment names are treated as model IDs by default, override with `azureDeploymentName` or `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` using comma-separated `model-id=deployment` pairs (for example `gpt-4o-mini=my-deployment,gpt-4o=prod`). Legacy deployment-based URLs are intentionally unsupported.

**GitHub Copilot**: If you get "The requested model is not supported" error, enable the model manually in VS Code: open Copilot Chat, click the model selector, select the model (warning icon), and click "Enable".

## 开发

### 添加新提供商

添加新的 LLM 提供商需要在多个文件中进行更改。此清单涵盖所有必要步骤：

#### 1. 核心类型（`src/types.ts`）

- 将 API 标识符添加到 `KnownApi`（例如 `"bedrock-converse-stream"`）
- 创建继承 `StreamOptions` 的选项接口（例如 `BedrockOptions`）
- 将提供商名称添加到 `KnownProvider`（例如 `"amazon-bedrock"`）

#### 2. 提供商实现（`src/providers/`）

创建一个新的提供商文件（例如 `amazon-bedrock.ts`），导出：

- 返回 `AssistantMessageEventStream` 的 `stream<Provider>()` 函数
- 用于 `SimpleStreamOptions` 映射的 `streamSimple<Provider>()`
- 提供商特定的选项接口
- 将 `Context` 转换为提供商格式的消息转换函数
- 工具转换（如果提供商支持工具）
- 响应解析，发出标准化事件（`text`、`tool_call`、`thinking`、`usage`、`stop`）

#### 3. API 注册表集成（`src/providers/register-builtins.ts`）

- 使用 `registerApiProvider()` 注册 API
- 在 `package.json` 中为提供商模块添加包子路径导出（`./dist/providers/<provider>.js`）
- 在 `src/providers/register-builtins.ts` 中添加惰性加载器包装器，不要在那里静态导入提供商实现模块
- 在 `src/index.ts` 中添加应保留在 `@earendil-works/pi-ai` 中的任何根级别 `export type` 重新导出
- 在 `env-api-keys.ts` 中为新提供商添加凭据检测
- 确保 `streamSimple` 通过 `getEnvApiKey()` 或提供商特定认证处理认证查找

#### 4. 模型生成（`scripts/generate-models.ts`、`scripts/generate-image-models.ts`）

- 添加从提供商源（例如 models.dev API）获取和解析模型的逻辑
- 通过 `scripts/generate-models.ts` 将聊天/工具能力提供商模型数据映射到标准化的 `Model` 接口
- 通过 `scripts/generate-image-models.ts` 将图片生成提供商模型数据映射到标准化的 `ImagesModel` 接口
- 处理提供商特定的怪异之处（定价格式、能力标志、模型 ID 转换）

#### 5. 测试（`test/`）

创建或更新测试文件以覆盖新提供商：

- `stream.test.ts` — 基本流式和工具使用
- `tokens.test.ts` — Token 使用报告
- `abort.test.ts` — 请求取消
- `empty.test.ts` — 空消息处理
- `context-overflow.test.ts` — 上下文限制错误
- `image-limits.test.ts` — 图片支持（如果适用）
- `unicode-surrogate.test.ts` — Unicode 处理
- `tool-call-without-result.test.ts` — 孤立工具调用
- `image-tool-result.test.ts` — 工具结果中的图片
- `total-tokens.test.ts` — Token 计数准确性
- `cross-provider-handoff.test.ts` — 跨提供商上下文重播

对于 `cross-provider-handoff.test.ts`，至少添加一个提供商/模型对。如果提供商暴露多个模型系列（例如 GPT 和 Claude），每个系列至少添加一对。

对于非标准认证的提供商（AWS、Google Vertex），创建一个类似 `bedrock-utils.ts` 的工具函数，包含凭据检测辅助方法。

#### 6. 编码代理集成（`../coding-agent/`）

更新 `src/core/model-resolver.ts`：

- 在 `DEFAULT_MODELS` 中为提供商添加默认模型 ID

更新 `src/cli/args.ts`：

- 在帮助文本中添加环境变量文档

更新 `README.md`：

- 在提供商部分添加提供商及安装说明

#### 7. 文档

更新 `packages/ai/README.md`：

- 添加到支持提供商表格
- 记录任何提供商特定的选项或认证要求
- 向环境变量部分添加环境变量

#### 8. 变更日志

在 `packages/ai/CHANGELOG.md` 的 `## [Unreleased]` 下添加条目：

```markdown
### Added
- Added support for [Provider Name] provider ([#PR](link) by [@author](link))
```

## 许可证

MIT
