# 压缩与分支摘要

大型语言模型（LLM）的上下文窗口有限。当对话过长时，pi 使用压缩来总结较旧的内容，同时保留近期的工作。本页涵盖自动压缩和分支摘要。

**源文件** ([pi-mono](https://github.com/earendil-works/pi-mono)):
- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) - 自动压缩逻辑
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) - 分支摘要
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) - 共享工具（文件追踪、序列化）
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) - 条目类型（`CompactionEntry`, `BranchSummaryEntry`）
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts) - 扩展事件类型

如需项目中的 TypeScript 定义，请查看 `node_modules/@earendil-works/pi-coding-agent/dist/`。

## 概述

Pi 有两种摘要机制：

| 机制 | 触发条件 | 目的 |
|-----------|---------|---------|
| 压缩 | 上下文超过阈值，或 `/compact` | 总结旧消息以释放上下文空间 |
| 分支摘要 | `/tree` 导航 | 切换分支时保留上下文 |

两者使用相同结构化的摘要格式，并累积追踪文件操作。

## 压缩

### 触发时机

自动压缩会在以下情况触发：

```
contextTokens > contextWindow - reserveTokens
```

默认情况下，`reserveTokens` 为 16384 个 token（可在 `~/.pi/agent/settings.json` 或 `<项目目录>/.pi/settings.json` 中配置）。这为 LLM 的响应留出空间。

你也可以手动触发，使用 `/compact [指令]`，可选指令可以聚焦摘要内容。

### 工作原理

1. **查找切分点**：从最新消息向后遍历，累积 token 估算值直到达到 `keepRecentTokens`（默认 20000，可在 `~/.pi/agent/settings.json` 或 `<项目目录>/.pi/settings.json` 中配置）
2. **提取消息**：收集从上一个保留的边界（或会话开始）到切分点之间的消息
3. **生成摘要**：调用 LLM 生成结构化的摘要，如果有上一次摘要，则将其作为迭代上下文传递
4. **追加条目**：保存包含摘要和 `firstKeptEntryId` 的 `CompactionEntry`
5. **重新加载**：会话重新加载，使用摘要和从 `firstKeptEntryId` 开始的消息

```
压缩前：

  条目:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               需要摘要的消息                 保留的消息
                                   ↑
                          firstKeptEntryId (条目 4)

压缩后（追加新条目）：

  条目:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                   不发送给 LLM                   发送给 LLM
                                                         ↑
                                              从 firstKeptEntryId 开始

LLM 看到的内容：

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    prompt   来自 cmp    从 firstKeptEntryId 开始的消息
```

在重复压缩时，摘要的起始位置是从上一次压缩的保留边界（`firstKeptEntryId`）开始，而不是从压缩条目本身开始；如果在路径中找不到该保留条目，则回退到上一次压缩后的下一条目。这样，那些在较早压缩中幸存的消息会被包含在接下来的摘要过程中，从而得以保留。Pi 还会在写入新的 `CompactionEntry` 之前，根据重建的会话上下文重新计算 `tokensBefore`，因此 token 数量反映的是实际被替换的压缩前上下文。

### 拆分轮次

一个“轮次”从用户消息开始，包含所有助手响应和工具调用，直到下一条用户消息。通常，压缩会在轮次边界处切分。

当单个轮次超过 `keepRecentTokens` 时，切分点会落在轮次中间的某条助手消息上。这就是“拆分轮次”：

```
拆分轮次（单个巨大的轮次超出预算）：

  条目:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)

  isSplitTurn = true
  messagesToSummarize = []  (前面没有完整轮次)
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

对于拆分轮次，pi 会生成两个摘要并合并：
1. **历史摘要**：之前的上文（如果有）
2. **轮次前缀摘要**：拆分轮次的早期部分

### 切分点规则

有效的切分点包括：
- 用户消息
- 助手消息
- BashExecution 消息
- 自定义消息（custom_message, branch_summary）

切勿在工具结果处切分（它们必须与其工具调用保持在一起）。

### CompactionEntry 结构

定义在 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 特定实现的数据
}

// 默认压缩使用以下结构作为 details（来自 compaction.ts）：
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中存储任何 JSON 可序列化的数据。默认压缩会追踪文件操作，但自定义扩展实现可以使用自己的结构。

实现详见 [`prepareCompaction()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts) 和 [`compact()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/compaction.ts)。

## 分支摘要

### 触发时机

当使用 `/tree` 导航到不同分支时，pi 会询问是否要总结你正在离开的工作。这会将离开分支的上文注入到新分支中。

### 工作原理

1. **查找共同祖先**：旧位置和新位置之间最深的共享节点
2. **收集条目**：从旧叶子节点回溯到共同祖先
3. **按预算准备**：包含最多 token 预算的消息（最新优先）
4. **生成摘要**：调用 LLM 生成结构化的摘要
5. **追加条目**：在导航点保存 `BranchSummaryEntry`

```
导航前的树：

         ┌─ B ─ C ─ D (旧叶子节点，即将被遗弃)
    A ───┤
         └─ E ─ F (目标)

共同祖先：A
需要摘要的条目：B, C, D

导航后（带摘要）：

         ┌─ B ─ C ─ D ─ [B,C,D 的摘要]
    A ───┤
         └─ E ─ F (新叶子节点)
```

### 累积文件追踪

压缩和分支摘要都累积追踪文件。在生成摘要时，pi 会从以下来源提取文件操作：
- 正在被摘要的消息中的工具调用
- 之前的压缩或分支摘要的 `details`（如果有）

这意味着文件追踪会在多次压缩或嵌套的分支摘要中累积，保留完整的读取和修改文件历史。

### BranchSummaryEntry 结构

定义在 [`session-manager.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/session-manager.ts) 中：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string;
  timestamp: number;
  summary: string;
  fromId: string;      // 我们导航自的条目
  fromHook?: boolean;  // 如果由扩展提供则为 true（遗留字段名）
  details?: T;         // 特定实现的数据
}

// 默认分支摘要使用以下结构作为 details（来自 branch-summarization.ts）：
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

与压缩类似，扩展可以在 `details` 中存储自定义数据。

实现详见 [`collectEntriesForBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)、[`prepareBranchEntries()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts) 和 [`generateBranchSummary()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/branch-summarization.ts)。

## 摘要格式

压缩和分支摘要使用相同的结构化格式：

```markdown
## Goal
[用户想要实现的目标]

## Constraints & Preferences
- [用户提到的需求]

## Progress
### Done
- [x] [已完成的任务]

### In Progress
- [ ] [当前工作]

### Blocked
- [问题（如果有）]

## Key Decisions
- **[决定]**：[理由]

## Next Steps
1. [下一步应该做什么]

## Critical Context
- [继续所需的数据]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化

在摘要之前，消息会通过 [`serializeConversation()`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/compaction/utils.ts) 序列化为文本：

```
[User]: 他们说的话
[Assistant thinking]: 内部推理
[Assistant]: 响应文本
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: 工具的输出
```

这可以防止模型将其视为可继续的对话。

在序列化过程中，工具结果会被截断到 2000 个字符。超出该限制的内容会替换为一个标记，指示被截断的字符数。这样可以将摘要请求保持在合理的 token 预算内，因为工具结果（尤其是来自 `read` 和 `bash` 的）通常是上下文大小的最大贡献者。

## 通过扩展实现自定义摘要

扩展可以拦截并自定义压缩和分支摘要。事件类型的定义参见 [`extensions/types.ts`](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/extensions/types.ts)。

### session_before_compact

在自动压缩或 `/compact` 执行前触发。可以取消或提供自定义摘要。详见类型文件中的 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, signal } = event;

  // preparation.messagesToSummarize - 需要摘要的消息
  // preparation.turnPrefixMessages - 拆分轮次前缀（如果是 isSplitTurn）
  // preparation.previousSummary - 上一次压缩摘要
  // preparation.fileOps - 提取的文件操作
  // preparation.tokensBefore - 压缩前的上下文 token 数
  // preparation.firstKeptEntryId - 保留消息的起始位置
  // preparation.settings - 压缩设置

  // branchEntries - 当前分支上的所有条目（用于自定义状态）
  // signal - AbortSignal（传递给 LLM 调用）

  // 取消：
  return { cancel: true };

  // 自定义摘要：
  return {
    compaction: {
      summary: "你的摘要...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      details: { /* 自定义数据 */ },
    }
  };
});
```

#### 将消息转换为文本

若要使用你自己的模型生成摘要，可以使用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // 将 AgentMessage[] 转换为 Message[]，然后序列化为文本
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // 返回：
  // [User]: 消息文本
  // [Assistant thinking]: 思考内容
  // [Assistant]: 响应文本
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: 输出文本

  // 现在发送给模型进行摘要
  const summary = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
    }
  };
});
```

完整的示例请参见 [custom-compaction.ts](../examples/extensions/custom-compaction.ts) （使用不同模型）。

### session_before_tree

在 `/tree` 导航前触发。无论用户是否选择生成摘要，都会始终触发。可以取消导航或提供自定义摘要。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - 我们导航的目标位置
  // preparation.oldLeafId - 当前位置（即将被遗弃）
  // preparation.commonAncestorId - 共同祖先
  // preparation.entriesToSummarize - 将会被摘要的条目
  // preparation.userWantsSummary - 用户是否选择生成摘要

  // 完全取消导航：
  return { cancel: true };

  // 提供自定义摘要（仅在 userWantsSummary 为 true 时使用）：
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "你的摘要...",
        details: { /* 自定义数据 */ },
      }
    };
  }
});
```

详见类型文件中的 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置

在 `~/.pi/agent/settings.json` 或 `<项目目录>/.pi/settings.json` 中配置压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置 | 默认值 | 描述 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动压缩 |
| `reserveTokens` | `16384` | 为 LLM 响应预留的 token 数 |
| `keepRecentTokens` | `20000` | 保留的近期 token 数（不进行摘要） |

使用 `"enabled": false` 禁用自动压缩。你仍然可以手动使用 `/compact` 进行压缩。
