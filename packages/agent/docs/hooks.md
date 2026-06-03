# AgentHarness 钩子设计

<!-- 从 jot 3utlzkxy 同步。请在此仓库内向前编辑此文件。 -->

最终设计。

## 核心模型

事件将其结果类型作为仅类型的幻影参数携带：

```ts
declare const HookResult: unique symbol;

interface HookEvent<TType extends string, TResult = void> {
	type: TType;
	readonly [HookResult]?: TResult;
}

type ResultOf<E> = E extends { readonly [HookResult]?: infer R } ? R : void;

type HookHandler<E, Ctx> = (
	event: E,
	ctx: Ctx,
	signal?: AbortSignal,
) => ResultOf<E> | void | Promise<ResultOf<E> | void>;

type HookObserver<E, Ctx> = (
	event: E,
	ctx: Ctx,
	signal?: AbortSignal,
) => void | Promise<void>;
```

- `HookHandler` 可以返回结果（用于可拦截事件）
- `HookObserver` 是只读的——不能修改事件或返回结果
- 两者都接收 `AbortSignal`，以便在代理中止时取消长时间运行的钩子

## 钩子注册

钩子是一等函数，与扩展分离。它们可以直接注册到 `AgentHarness`：

```typescript
const harness = new AgentHarness(/* ... */);

harness.on("agent_start", async (event, ctx) => {
  console.log("代理开始");
});

harness.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
    return { block: true, reason: "被安全策略阻止" };
  }
});
```

## 事件生命周期

事件遵循特定的生命周期，从 `session_start` 到 `session_shutdown`：

```
session_start → session_before_fork → session_compact → session_shutdown
                                     → session_before_switch
                                     → session_tree
```

对于代理的每个提示：

```
agent_start → turn_start → message_start → message_update*
                           → tool_call → tool_result
                           → turn_end
                           → agent_end
```

## 内置事件

### 会话事件

| 事件 | 结果 | 说明 |
|-------|--------|-------------|
| `session_start` | 无 | 会话已创建 |
| `session_before_fork` | `{ forkBlocked?: boolean; reason?: string }` | 分叉之前 |
| `session_before_switch` | `{ switchBlocked?: boolean; reason?: string }` | 切换会话之前 |
| `session_compact` | 无 | 压缩后 |
| `session_shutdown` | 无 | 会话已关闭 |
| `session_before_tree` | `{ filter?: string; customInstructions?: string; replaceInstructions?: boolean }` | 树导航之前 |
| `session_tree` | 无 | 树导航后 |

### 代理事件

| 事件 | 结果 | 说明 |
|-------|--------|-------------|
| `agent_start` | 无 | 代理开始处理提示 |
| `agent_end` | 无 | 代理完成处理 |

### 回合事件

| 事件 | 结果 | 说明 |
|-------|--------|-------------|
| `turn_start` | 无 | 新回合开始 |
| `turn_end` | 无 | 回合结束 |

### 工具事件

| 事件 | 结果 | 说明 |
|-------|--------|-------------|
| `tool_call` | `{ block?: boolean; reason?: string }` | 工具即将被调用 |
| `tool_result` | `{ replace?: string }` | 工具结果已生成 |

## 错误处理

钩子中的错误会被捕获并记录，不会崩溃代理：

```typescript
harness.on("tool_call", async (event, ctx) => {
  throw new Error("出错了");
});
// 错误被记录，代理继续
```