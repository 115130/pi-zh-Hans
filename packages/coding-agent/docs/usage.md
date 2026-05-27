# 使用 Pi

此页面收集不适合快速入门页面的日常使用细节。

## 交互模式

<p align="center"><img src="images/interactive-mode.png" alt="交互模式" width="600"></p>

界面有四个主要区域：

- **启动头部** - 快捷方式、已加载的上下文文件、提示模板、技能和扩展
- **消息** - 用户消息、助手回复、工具调用、工具结果、通知、错误和扩展 UI
- **编辑器** - 您输入的地方；边框颜色指示当前思考级别
- **底部栏** - 工作目录、会话名称、令牌/缓存使用量、成本、上下文使用量和当前模型

编辑器可以被内置 UI（例如 `/settings`）或自定义扩展 UI 临时替换。

### 编辑器功能

| 功能 | 操作方法 |
|------|---------|
| 文件引用 | 输入 `@` 可模糊搜索项目文件 |
| 路径补全 | 按 Tab 完成路径 |
| 多行输入 | Shift+Enter，或在 Windows Terminal 上按 Ctrl+Enter |
| 图片 | 使用 Ctrl+V 粘贴，在 Windows 上使用 Alt+V，或拖入终端 |
| Shell 命令 | `!command` 运行并将输出发送给模型 |
| 隐藏的 Shell 命令 | `!!command` 运行但不将输出发送给模型 |
| 外部编辑器 | Ctrl+G 打开 `$VISUAL` 或 `$EDITOR` |

所有快捷键及自定义方法请参见 [键绑定](keybindings.md)。

## 斜杠命令

在编辑器中输入 `/` 可打开命令补全。扩展可以注册自定义命令，技能通过 `/skill:name` 使用，提示模板通过 `/templatename` 展开。

| 命令 | 描述 |
|------|------|
| `/login`, `/logout` | 管理 OAuth 或 API 密钥凭据 |
| `/model` | 切换模型 |
| `/scoped-models` | 启用/禁用用于 Ctrl+P 循环的模型 |
| `/settings` | 思考级别、主题、消息投递、传输 |
| `/resume` | 从以前的会话中选择 |
| `/new` | 开始新会话 |
| `/name <名称>` | 设置会话显示名称 |
| `/session` | 显示会话文件、ID、消息、令牌和成本 |
| `/tree` | 跳转到会话中的任意点并从此处继续 |
| `/fork` | 从之前的用户消息创建新会话 |
| `/clone` | 将当前活动分支复制到新会话中 |
| `/compact [提示]` | 手动压缩上下文，可选自定义指令 |
| `/copy` | 将最后一条助手消息复制到剪贴板 |
| `/export [文件]` | 将会话导出为 HTML |
| `/share` | 上传为私有 GitHub Gist 并提供可分享的 HTML 链接 |
| `/reload` | 重新加载键绑定、扩展、技能、提示和上下文文件 |
| `/hotkeys` | 显示所有键盘快捷键 |
| `/changelog` | 显示版本历史 |
| `/quit` | 退出 pi |

## 消息队列

您可以在代理工作时提交消息：

- **Enter** 排队一条引导消息，在当前助手轮次完成执行工具调用后投递。
- **Alt+Enter** 排队一条后续消息，在代理完成所有工作后投递。
- **Escape** 中止并将排队的消息恢复回编辑器。
- **Alt+Up** 将排队的消息取回编辑器。

在 Windows Terminal 上，Alt+Enter 默认为全屏。如果您希望 pi 接收此快捷键，请按照 [终端设置](terminal-setup.md) 中的说明重新映射。

通过 `steeringMode` 和 `followUpMode` 在 [设置](settings.md) 中配置投递方式。

## 会话

会话会自动保存到 `~/.pi/agent/sessions/`，按工作目录组织。

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览并选择一个会话
pi --no-session        # 临时模式；不保存
pi --session <路径|ID> # 使用特定的会话文件或会话 ID
pi --fork <路径|ID>    # 将会话分支到新的会话文件中
```

有用的会话命令：

- `/session` 显示当前会话文件和 ID。
- `/tree` 导航文件内的会话树，并可汇总放弃的分支。
- `/fork` 从较早的用户消息创建新会话。
- `/clone` 将当前活动分支复制到新的会话文件中。
- `/compact` 汇总较早的消息以释放上下文。

详情请参见 [会话](sessions.md) 和 [压缩](compaction.md)。

## 上下文文件

Pi 在启动时从以下位置加载 `AGENTS.md` 或 `CLAUDE.md`：

- `~/.pi/agent/AGENTS.md` 用于全局指令
- 从当前工作目录向上遍历的父目录
- 当前目录

使用上下文文件来包含项目约定、命令、安全规则和偏好。使用 `--no-context-files` 或 `-nc` 禁用加载。

### 系统提示文件

通过以下方式替换默认系统提示：

- 项目中的 `.pi/SYSTEM.md`
- 全局的 `~/.pi/agent/SYSTEM.md`

使用以上两个位置的 `APPEND_SYSTEM.md` 追加到默认提示而不替换它。

## 导出和分享会话

使用 `/export [文件]` 将会话写入 HTML。

使用 `/share` 上传到私有 GitHub Gist 并提供可分享的 HTML 链接。

如果您将 pi 用于开源工作，并希望发布会话用于模型、提示、工具和评估研究，请参阅 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。它会将会话发布到 Hugging Face 数据集。

## CLI 参考

```bash
pi [选项] [@文件...] [消息...]
```

### 包命令

```bash
pi install <源> [-l]     # 安装包，-l 为项目本地安装
pi remove <源> [-l]      # 移除包
pi uninstall <源> [-l]   # remove 的别名
pi update [源|self|pi]   # 更新 pi 和包；协调固定的 git ref
pi update --extensions   # 仅更新包；协调固定的 git ref
pi update --self         # 仅更新 pi
pi update --extension <源> # 更新一个包
pi list                  # 列出已安装的包
pi config                # 启用/禁用包资源
```

这些命令管理 pi 包，而不是 pi CLI 安装本身。要卸载 pi 本身，请参见 [快速入门](quickstart.md#uninstall)。

有关包源和安全说明，请参见 [Pi 包](packages.md)。

### 模式

| 标志 | 描述 |
|------|------|
| 默认 | 交互模式 |
| `-p`, `--print` | 打印响应并退出 |
| `--mode json` | 将所有事件输出为 JSON 行；请参见 [JSON 模式](json.md) |
| `--mode rpc` | 通过 stdin/stdout 的 RPC 模式；请参见 [RPC 模式](rpc.md) |
| `--export <输入> [输出]` | 将会话导出为 HTML |

在打印模式下，pi 还会读取通过管道输入的 stdin 并将其合并到初始提示中：

```bash
cat README.md | pi -p "总结这段文本"
```

### 模型选项

| 选项 | 描述 |
|------|------|
| `--provider <名称>` | 提供商，例如 `anthropic`、`openai` 或 `google` |
| `--model <模式>` | 模型模式或 ID；支持 `provider/id` 和可选的 `:<思考级别>` |
| `--api-key <密钥>` | API 密钥，覆盖环境变量 |
| `--thinking <级别>` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh` |
| `--models <模式>` | 用于 Ctrl+P 循环的逗号分隔模式 |
| `--list-models [搜索]` | 列出可用模型 |

### 会话选项

| 选项 | 描述 |
|------|------|
| `-c`, `--continue` | 继续最近的会话 |
| `-r`, `--resume` | 浏览并选择一个会话 |
| `--session <路径\|ID>` | 使用特定的会话文件或部分 UUID |
| `--fork <路径\|ID>` | 将会话文件或部分 UUID 分支到新会话 |
| `--session-dir <目录>` | 自定义会话存储目录 |
| `--no-session` | 临时模式；不保存 |

### 工具选项

| 选项 | 描述 |
|------|------|
| `--tools <列表>`, `-t <列表>` | 允许列表特定的内置、扩展和自定义工具 |
| `--no-builtin-tools`, `-nbt` | 禁用内置工具但保留扩展/自定义工具 |
| `--no-tools`, `-nt` | 禁用所有工具 |

内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。

### 资源选项

| 选项 | 描述 |
|------|------|
| `-e`, `--extension <源>` | 从路径、npm 或 git 加载扩展；可重复 |
| `--no-extensions` | 禁用扩展发现 |
| `--skill <路径>` | 加载技能；可重复 |
| `--no-skills` | 禁用技能发现 |
| `--prompt-template <路径>` | 加载提示模板；可重复 |
| `--no-prompt-templates` | 禁用提示模板发现 |
| `--theme <路径>` | 加载主题；可重复 |
| `--no-themes` | 禁用主题发现 |
| `--no-context-files`, `-nc` | 禁用 `AGENTS.md` 和 `CLAUDE.md` 发现 |

结合 `--no-*` 和显式标志，仅加载所需内容，忽略设置。示例：

```bash
pi --no-extensions -e ./my-extension.ts
```

### 其他选项

| 选项 | 描述 |
|------|------|
| `--system-prompt <文本>` | 替换默认提示；上下文文件和技能仍会被附加 |
| `--append-system-prompt <文本>` | 追加到系统提示 |
| `--verbose` | 强制详细启动 |
| `-h`, `--help` | 显示帮助 |
| `-v`, `--version` | 显示版本 |

### 文件参数

在消息中包含文件时，在文件名前加上 `@`：

```bash
pi @prompt.md "回答这个问题"
pi -p @screenshot.png "这个图片里有什么？"
pi @code.ts @test.ts "审查这些文件"
```

### 示例

```bash
# 交互模式并附带初始提示
pi "列出 src/ 下所有 .ts 文件"

# 非交互模式
pi -p "总结这个代码库"

# 非交互模式并附带管道输入
cat README.md | pi -p "总结这段文本"

# 使用不同模型
pi --provider openai --model gpt-4o "帮我重构"

# 模型加提供商前缀
pi --model openai/gpt-4o "帮我重构"

# 模型加思考级别简写
pi --model sonnet:high "解决这个复杂问题"

# 限制模型循环
pi --models "claude-*,gpt-4o"

# 只读模式
pi --tools read,grep,find,ls -p "审查代码"
```

### 环境变量

| 变量 | 描述 |
|------|------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录；默认为 `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话存储目录；被 `--session-dir` 覆盖 |
| `PI_PACKAGE_DIR` | 覆盖包目录，适用于 Nix/Guix store 路径 |
| `PI_OFFLINE` | 禁用启动时的网络操作，包括更新检查、包更新检查和安装/更新遥测 |
| `PI_SKIP_VERSION_CHECK` | 跳过启动时的 Pi 版本更新检查。这可以阻止向 `pi.dev` 请求最新版本 |
| `PI_TELEMETRY` | 覆盖安装/更新遥测：`1`/`true`/`yes` 或 `0`/`false`/`no`。这不禁用更新检查 |
| `PI_CACHE_RETENTION` | 设置为 `long` 以在支持的情况下延长提示缓存 |
| `VISUAL`, `EDITOR` | 用于 Ctrl+G 的外部编辑器 |

## 设计原则

Pi 保持核心小巧，将工作流特定行为推向扩展、技能、提示模板和包。

它有意不包含内置的 MCP、子代理、权限弹窗、计划模式、待办事项或后台 bash。您可以构建或安装这些工作流作为扩展或包，或使用外部工具如容器和 tmux。

完整理由请阅读 [博客文章](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)。
