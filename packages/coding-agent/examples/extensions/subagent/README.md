# 子代理示例

将任务委派给具有独立上下文窗口的专业子代理。

## 特性

- **隔离上下文**：每个子代理在独立的 `pi` 进程中运行
- **流式输出**：实时查看工具调用和进度
- **并行流式处理**：所有并行任务同时流式更新
- **Markdown 渲染**：最终输出以正确格式渲染（展开视图）
- **使用量追踪**：显示每个代理的轮次、令牌数、成本及上下文使用量
- **中止支持**：Ctrl+C 会传播以终止子代理进程

## 结构

```
subagent/
├── README.md            # 本文件
├── index.ts             # 扩展（入口点）
├── agents.ts            # 代理发现逻辑
├── agents/              # 示例代理定义
│   ├── scout.md         # 快速侦查，返回压缩上下文
│   ├── planner.md       # 创建实施计划
│   ├── reviewer.md      # 代码审查
│   └── worker.md        # 通用（完整能力）
└── prompts/             # 工作流预设（提示模板）
    ├── implement.md     # scout -> planner -> worker
    ├── scout-and-plan.md    # scout -> planner（不实施）
    └── implement-and-review.md  # worker -> reviewer -> worker
```

## 安装

从仓库根目录，符号链接文件：

```bash
# 符号链接扩展（必须在包含 index.ts 的子目录中）
mkdir -p ~/.pi/agent/extensions/subagent
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/index.ts" ~/.pi/agent/extensions/subagent/index.ts
ln -sf "$(pwd)/packages/coding-agent/examples/extensions/subagent/agents.ts" ~/.pi/agent/extensions/subagent/agents.ts

# 符号链接代理
mkdir -p ~/.pi/agent/agents
for f in packages/coding-agent/examples/extensions/subagent/agents/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/agents/$(basename "$f")
done

# 符号链接工作流提示
mkdir -p ~/.pi/agent/prompts
for f in packages/coding-agent/examples/extensions/subagent/prompts/*.md; do
  ln -sf "$(pwd)/$f" ~/.pi/agent/prompts/$(basename "$f")
done
```

## 安全模型

此工具会执行一个独立的 `pi` 子进程，并带有委托的系统提示和工具/模型配置。

**项目本地代理**（`.pi/agents/*.md`）是仓库控制的提示，可以指示模型读取文件、运行 bash 命令等。

**默认行为**：仅从 `~/.pi/agent/agents` 加载**用户级代理**。

要启用项目本地代理，请传入 `agentScope: "both"`（或 `"project"`）。仅对您信任的仓库执行此操作。

以交互方式运行时，工具会在运行项目本地代理之前提示确认。设置 `confirmProjectAgents: false` 可禁用。

## 用法

### 单代理
```
使用 scout 查找所有身份验证代码
```

### 并行执行
```
并行运行 2 个 scout：一个查找模型，一个查找提供商
```

### 链式工作流
```
使用链：先让 scout 找到读取工具，然后让 planner 建议改进
```

### 工作流提示
```
/implement 在会话存储中添加 Redis 缓存
/scout-and-plan 重构 auth 以支持 OAuth
/implement-and-review 向 API 端点添加输入验证
```

## 工具模式

| 模式 | 参数 | 描述 |
|------|-----------|-------------|
| 单代理 | `{ agent, task }` | 一个代理，一个任务 |
| 并行 | `{ tasks: [...] }` | 多个代理同时运行（最多 8 个，4 个并发） |
| 链式 | `{ chain: [...] }` | 顺序执行，带 `{previous}` 占位符 |

## 输出显示

**折叠视图**（默认）：
- 状态图标（✓/✗/⏳）和代理名称
- 最后 5-10 项（工具调用和文本）
- 使用统计：`3 轮次 ↑输入 ↓输出 Rcache读取 Wcache写入 $成本 ctx:上下文令牌 模型`

**展开视图**（Ctrl+O）：
- 完整任务文本
- 所有工具调用及格式化参数
- 最终输出渲染为 Markdown
- 每个任务的使用统计（链式/并行）

**并行模式流式传输**：
- 显示所有任务及其实时状态（⏳ 运行中，✓ 完成，✗ 失败）
- 随着每个任务进展而更新
- 显示“2/3 完成，1 个运行中”状态
- 返回每个已完成任务的最终输出给父模型，每个任务上限 50 KB
- 当子进程在产生输出之前退出时，返回来自 stderr/错误消息的故障诊断

**工具调用格式**（模仿内置工具）：
- `$ command` 用于 bash
- `read ~/路径:1-10` 用于读取
- `grep /模式/ in ~/路径` 用于 grep
- 等等。

## 代理定义

代理是带 YAML 前置内容的 Markdown 文件：

```markdown
---
name: my-agent
description: 此代理的功能
tools: read, grep, find, ls
model: claude-haiku-4-5
---

此处放置代理的系统提示。
```

**位置：**
- `~/.pi/agent/agents/*.md` - 用户级（始终加载）
- `.pi/agents/*.md` - 项目级（仅当 `agentScope: "project"` 或 `"both"` 时）

当 `agentScope: "both"` 时，项目代理会覆盖同名的用户代理。

## 示例代理

| 代理 | 目的 | 模型 | 工具 |
|-------|---------|-------|-------|
| `scout` | 快速代码库侦查 | Haiku | read, grep, find, ls, bash |
| `planner` | 实施计划 | Sonnet | read, grep, find, ls |
| `reviewer` | 代码审查 | Sonnet | read, grep, find, ls, bash |
| `worker` | 通用 | Sonnet | （所有默认） |

## 工作流提示

| 提示 | 流程 |
|--------|------|
| `/implement <查询>` | scout → planner → worker |
| `/scout-and-plan <查询>` | scout → planner |
| `/implement-and-review <查询>` | worker → reviewer → worker |

## 错误处理

- **退出码 != 0**：工具返回包含 stderr/输出的错误
- **stopReason "error"**：LLM 错误随错误信息传播
- **stopReason "aborted"**：用户中止（Ctrl+C）杀死子进程，抛出错误
- **链式模式**：在第一个失败的步骤停止，报告哪个步骤失败

## 局限性

- 输出在折叠视图中截断为最后 10 项（展开可查看全部）
- 并行模式下模型可见的输出每任务上限 50 KB；完整结果保留在工具详细信息中
- 每次调用时重新发现代理（允许在会话期间编辑）
- 并行模式限制为 8 个任务，4 个并发
