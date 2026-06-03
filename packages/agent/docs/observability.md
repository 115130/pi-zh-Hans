<!-- 从 jot qe0ikdqs 同步。请在此仓库内向前编辑此文件。 -->

# Pi 可观测性设计笔记

## 目标

使 `packages/ai` 和 `packages/agent`/harness 可观测，而不依赖 OpenTelemetry、Sentry 或任何 APM 厂商。

Pi 应发出稳定、结构化的生命周期事件。外部监听器可以将这些事件转换为 OTel spans、Sentry spans、日志、指标或自定义遥测。

## 心智模型

一个 trace 是一个工作因果树，例如一个用户回合。

一个 span 是该树中的一个计时操作。它通常由 ID 表示，而不是对象指针：

```ts
interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
}
```

示例树：

```
LLM 调用
├── 工具：read（文件读取）
├── 工具：edit（查找/替换）
└── LLM 调用
    └── 工具：bash（编译）
```

## 跨度生命周期

跨度通过持久化的 AgentSession 事件和多轮次存活。一个跨度在创建后可以在多个回合中更新：

```ts
// 在第 1 回合创建
on("turn_start", () => {
  spans.create("my-operation", { /* attributes */ });
});

// 在第 2 回合更新
on("turn_end", () => {
  spans.update("my-operation", { status: "ok" });
});
```

## API

### Agent 级别

`Agent` 上的 `spans` 属性暴露了跨度 API：

```typescript
// 创建或恢复跨度
const span = agent.spans.create("my-span", {
  attributes: { /* 任意结构化数据 */ },
  parentSpanId: parentSpan?.spanId,
});

// 更新跨度
agent.spans.update(span.spanId, {
  attributes: { result: "success" },
  status: "ok",
});

// 结束跨度
agent.spans.end(span.spanId, { status: "ok" });

// 获取跨度（用于检查父子关系）
const fetched = agent.spans.get(spanId);

// 获取所有跨度
const all = agent.spans.getAll();

// 监听跨度事件
agent.subscribe((event) => {
  if (event.type === "span_start") {
    console.log("跨度开始:", event.spanId, event.name);
  }
  if (event.type === "span_end") {
    console.log("跨度结束:", event.spanId, event.status);
  }
});
```

### 跨度 ID 方案

跨度的 ID 策略是会话范围的连续整数，前缀为 `s:`：

```ts
"s:1"  // 第 1 个跨度
"s:2"  // 第 2 个跨度
```

这保持了 ID 的简短和确定性，适合在会话条目中引用跨度的场景。

### 与现有事件的集成

现有事件类型包括一个可选的 `spanId` 字段：

```typescript
interface TurnEndEvent {
  type: "turn_end";
  spanId?: string;   // 与此回合关联的跨度
  message: AgentMessage;
  toolResults: ToolResult[];
}
```

## 存储

跨度存储在 `Agent` 实例上的内存映射中。它们在压缩和分支时跟随消息历史。

对于持久化，跨度数据通过 `pi.appendEntry()` 由宿主应用写入会话条目。

## 边界情况

### 跨度引用未创建的父跨度

如果跨度 A 声明 `parentSpanId: "s:999"` 且跨度 999 不存在，则 A 被视为根跨度。不会抛出错误。

### 跨度在创建前结束

`end()` 是无操作的。跨度需要先被创建。

### 父跨度在子跨度之前结束

跨度可以在父跨度结束后继续。跨度图可以是不连通的。对于向上报告，监听器应在收到 `span_end` 事件时刷新完成的子树。

## 执行

跨度收集默认是惰性的：除非有监听器订阅了跨度事件，否则不会创建跨度记录。这避免了没有遥测消费者的安装中的开销。

```typescript
// 不创建跨度——没有监听器
agent.prompt("你好");

// 创建跨度
const unsubscribe = agent.subscribe((event) => {
  if (event.type === "span_start") { /* ... */ }
});
agent.prompt("你好");
```

## 未来工作

- 跨度导出的序列化格式
- 跨度到 OTel 的转换层
- 跨度到 Sentry 的转换层
- 跨度压缩策略（旧跨度的 TTL）