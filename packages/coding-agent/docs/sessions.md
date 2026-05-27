# 会话

Pi 将会话保存为会话，以便您可以继续工作、从之前的轮次中分支，并重新访问之前的路径。

## 会话存储

会话自动保存到 `~/.pi/agent/sessions/`，按工作目录组织。每个会话是一个 JSONL 文件，具有树结构。

```bash
pi -c                  # Continue most recent session
pi -r                  # Browse and select from past sessions
pi --no-session        # Ephemeral mode; do not save
pi --session <path|id> # Use a specific session file or partial session ID
pi --fork <path|id>    # Fork a session file or partial session ID into a new session
```

在交互模式下使用 `/session` 查看当前会话文件、会话 ID、消息数量、令牌数和成本。

关于 JSONL 文件格式和 SessionManager API，请参阅[会话格式](session-format.md)。

## 会话命令

| 命令 | 描述 |
|---------|-------------|
| `/resume` | 浏览并选择之前的会话 |
| `/new` | 开始新会话 |
| `/name <名称>` | 设置当前会话的显示名称 |
| `/session` | 显示会话信息 |
| `/tree` | 导航当前会话树 |
| `/fork` | 从之前的用户消息创建新会话 |
| `/clone` | 将当前活动分支复制到新会话 |
| `/compact [提示]` | 总结较旧的上下文；请参阅[压缩](compaction.md) |
| `/export [文件]` | 将会话导出为 HTML |
| `/share` | 作为私有 GitHub Gist 上传并提供可共享的 HTML 链接 |

## 恢复和删除会话

`/resume` 打开当前项目的交互式会话选择器。`pi -r` 在启动时打开相同的选择器。

在选择器中，您可以：

- 通过键入搜索
- 使用 Ctrl+P 切换路径显示
- 使用 Ctrl+S 切换排序模式
- 使用 Ctrl+N 过滤到已命名的会话
- 使用 Ctrl+R 重命名
- 使用 Ctrl+D 删除，然后确认

当可用时，pi 使用 `trash` CLI 进行删除，而不是永久删除文件。

## 命名会话

使用 `/name <名称>` 设置人类可读的会话名称：

```text
/name Refactor auth module
```

命名的会话在 `/resume` 和 `pi -r` 中更容易找到。

## 使用 `/tree` 分支

会话以树的形式存储。每个条目都有一个 `id` 和 `parentId`，当前位置是活动叶子节点。`/tree` 允许您跳转到任何先前的点并从中继续，而无需创建新文件。

<p align="center"><img src="images/tree-view.png" alt="树视图" width="600"></p>

示例形状：

```text
├─ user: "Hello, can you help..."
│  └─ assistant: "Of course! I can..."
│     ├─ user: "Let's try approach A..."
│     │  └─ assistant: "For approach A..."
│     │     └─ user: "That worked..."  ← active
│     └─ user: "Actually, approach B..."
│        └─ assistant: "For approach B..."
```

### 树控件

| 按键 | 操作 |
|-----|--------|
| ↑/↓ | 导航可见条目 |
| ←/→ | 向上/向下翻页 |
| Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ | 折叠/展开或在分支段之间跳转 |
| Shift+L | 设置或清除所选条目标签 |
| Shift+T | 切换标签时间戳 |
| Enter | 选择条目 |
| Escape/Ctrl+C | 取消 |
| Ctrl+O | 循环过滤模式 |

过滤模式有：默认、无工具、仅用户、仅标签和全部。使用 [Settings](settings.md) 中的 `treeFilterMode` 配置默认模式。

### 选择行为

选择用户或自定义消息：

1. 将叶子节点移动到所选消息的父节点。
2. 将所选消息文本放入编辑器中。
3. 允许您编辑并重新提交，创建新分支。

选择助手、工具、压缩或其他非用户条目：

1. 将叶子节点移动到该条目。
2. 将编辑器留空。
3. 允许您从该点继续。

选择根用户消息会将叶子节点重置为空对话，并将原始提示放入编辑器中。

## `/tree`、`/fork` 和 `/clone`

| 特性 | `/tree` | `/fork` | `/clone` |
|---------|---------|---------|----------|
| 输出 | 相同的会话文件 | 新会话文件 | 新会话文件 |
| 视图 | 完整树 | 用户消息选择器 | 当前活动分支 |
| 典型用途 | 原地探索替代方案 | 从较早的提示开始新会话 | 在继续前复制当前工作 |
| 摘要 | 可选分支摘要 | 无 | 无 |

当您想将替代方案保持在一起时使用 `/tree`。当您想要单独的会话文件时使用 `/fork` 或 `/clone`。

## 分支摘要

当 `/tree` 从一个分支切换到另一个分支时，pi 可以总结被放弃的分支，并将该摘要附加到新位置。这保留了您离开的路径中的重要上下文，而无需重放整个分支。

当提示时，选择以下之一：

1. 不摘要
2. 使用默认提示进行摘要
3. 使用自定义关注指令进行摘要

请参阅[压缩](compaction.md)了解分支摘要的内部机制和扩展钩子。

## 会话格式

会话文件是 JSONL 格式，包含消息条目、模型更改、思考级别更改、标签、压缩、分支摘要和扩展条目。

关于解析器、扩展、SDK 使用以及完整的 SessionManager API，请参阅[会话格式](session-format.md)。
