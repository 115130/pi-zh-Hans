<p align="center">
  <a href="https://pi.dev">
    <img alt="pi 标志" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-社区-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> 域名由以下组织慷慨捐赠
  <br /><br />
  <a href="https://exe.dev"><img src="docs/images/exy.png" alt="Exy 吉祥物" width="48" /><br />exe.dev</a>
</p>

> 默认情况下，新贡献者提交的新 issue 和 PR 会被自动关闭。维护者会每天审查自动关闭的 issue。请参阅 [CONTRIBUTING.md](../../CONTRIBUTING.md)。

---

Pi 是一个极简的终端编码工具。让 pi 适应你的工作流程，而不是反过来，且无需 fork 并修改 pi 的内部实现。你可以通过 TypeScript [扩展](#extensions)、[技能](#skills)、[提示模板](#prompt-templates) 和 [主题](#themes) 来扩展它。将你的扩展、技能、提示模板和主题放在 [Pi 包](#pi-packages) 中，并通过 npm 或 git 与他人分享。

Pi 提供了强大的默认功能，但省略了子代理和计划模式等功能。相反，你可以让 pi 构建你想要的东西，或者安装符合你工作流程的第三方 pi 包。

Pi 以四种模式运行：交互模式、打印或 JSON 模式、用于进程集成的 RPC 模式，以及用于嵌入到自有应用中的 SDK 模式。请参阅 [openclaw/openclaw](https://github.com/openclaw/openclaw) 了解真实的 SDK 集成示例。

## 分享你的 OSS 编码代理会话

如果你将 pi 用于开源工作，请分享你的编码代理会话。

公开的 OSS 会话数据有助于利用真实开发工作流程改进模型、提示、工具和评估。

完整说明请参阅 [这篇 X 帖子](https://x.com/badlogicgames/status/2037811643774652911)。

要发布会话，请使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。阅读其 README.md 了解设置说明。你只需要一个 Hugging Face 账号、Hugging Face CLI 和 `pi-share-hf`。

你也可以观看 [这个视频](https://x.com/badlogicgames/status/2041151967695634619)，其中展示了如何发布我的 `pi-mono` 会话。

我定期在此发布自己的 `pi-mono` 工作会话：

- [Hugging Face 上的 badlogicgames/pi-mono](https://huggingface.co/datasets/badlogicgames/pi-mono)

## 目录

- [快速开始](#quick-start)
- [提供商和模型](#providers--models)
- [交互模式](#interactive-mode)
  - [编辑器](#editor)
  - [命令](#commands)
  - [键盘快捷键](#keyboard-shortcuts)
  - [消息队列](#message-queue)
- [会话](#sessions)
  - [分支](#branching)
  - [压缩](#compaction)
- [设置](#settings)
- [上下文文件](#context-files)
- [自定义](#customization)
  - [提示模板](#prompt-templates)
  - [技能](#skills)
  - [扩展](#extensions)
  - [主题](#themes)
  - [Pi 包](#pi-packages)
- [编程使用](#programmatic-usage)
- [理念](#philosophy)
- [CLI 参考](#cli-reference)

---

## 快速开始

npm install -g --ignore-scripts @earendil-works/pi-coding-agent

`--ignore-scripts` 在安装过程中禁用依赖生命周期脚本。Pi 在正常 npm 安装中不需要安装脚本。

备用安装方式：

curl -fsSL https://pi.dev/install.sh | sh

使用 API 密钥进行身份验证：

export ANTHROPIC_API_KEY=sk-ant-...
pi

或使用你现有的订阅：

pi
/login  # 然后选择提供商

然后直接与 pi 对话。默认情况下，pi 为模型提供四个工具：`read`、`write`、`edit` 和 `bash`。模型使用这些工具来执行你的请求。通过 [技能](#skills)、[提示模板](#prompt-templates)、[扩展](#extensions) 或 [pi 包](#pi-packages) 添加功能。

**平台说明：** [Windows](docs/windows.md) | [Termux (Android)](docs/termux.md) | [tmux](docs/tmux.md) | [终端设置](docs/terminal-setup.md) | [Shell 别名](docs/shell-aliases.md)

---

## 提供商和模型

对于每个内置提供商，pi 维护了一个支持工具的模型列表，并随每次发布更新。通过订阅 (`/login`) 或 API 密钥进行身份验证，然后通过 `/model`（或 Ctrl+L）从该提供商选择任何模型。

**订阅：**
- Anthropic Claude Pro/Max
- OpenAI ChatGPT Plus/Pro (Codex)
- GitHub Copilot

**API 密钥：**
- Anthropic
- OpenAI
- Azure OpenAI
- DeepSeek
- Google Gemini
- Google Vertex
- Amazon Bedrock
- Mistral
- Groq
- Cerebras
- Cloudflare AI Gateway
- Cloudflare Workers AI
- xAI
- OpenRouter
- Vercel AI Gateway
- ZAI
- OpenCode Zen
- OpenCode Go
- Hugging Face
- Fireworks
- Together AI
- Kimi For Coding
- MiniMax
- 小米 MiMo
- 小米 MiMo 令牌计划（中国）
- 小米 MiMo 令牌计划（阿姆斯特丹）
- 小米 MiMo 令牌计划（新加坡）

详细设置说明请参阅 [docs/providers.md](docs/providers.md)。

**自定义提供商和模型：** 如果供应商使用受支持的 API（OpenAI、Anthropic、Google），可通过 `~/.pi/agent/models.json` 添加提供商。对于自定义 API 或 OAuth，请使用扩展。请参阅 [docs/models.md](docs/models.md) 和 [docs/custom-provider.md](docs/custom-provider.md)。

---

## 交互模式

<p align="center"><img src="docs/images/interactive-mode.png" alt="交互模式" width="600"></p>

界面从上到下：

- **启动标题** - 显示快捷键（所有快捷键见 `/hotkeys`）、加载的 AGENTS.md 文件、提示模板、技能和扩展
- **消息** - 你的消息、助手响应、工具调用和结果、通知、错误以及扩展 UI
- **编辑器** - 输入区域；边框颜色表示思考级别
- **页脚** - 工作目录、会话名称、总令牌/缓存使用量、成本、上下文使用量、当前模型

编辑器可以被其他 UI 临时替换，例如内置的 `/settings` 或来自扩展的自定义 UI（例如，一个问答工具，允许用户以结构化格式回答模型的问题）。[扩展](#extensions) 还可以替换编辑器、在其上方/下方添加小部件、状态行、自定义页脚或覆盖层。

### 编辑器

| 功能 | 操作方法 |
|------|----------|
| 文件引用 | 输入 `@` 进行模糊搜索项目文件 |
| 路径补全 | 按 Tab 补全路径 |
| 多行 | Shift+Enter（或在 Windows Terminal 上按 Ctrl+Enter） |
| 图片 | Ctrl+V 粘贴（Windows 上为 Alt+V），或拖拽到终端 |
| Bash 命令 | `!command` 运行并将输出发送给 LLM，`!!command` 运行但不发送 |

标准编辑快捷键，如删除单词、撤销等。请参阅 [docs/keybindings.md](docs/keybindings.md)。

### 命令

在编辑器中输入 `/` 可触发命令。[扩展](#extensions) 可以注册自定义命令，[技能](#skills) 可通过 `/skill:name` 使用，[提示模板](#prompt-templates) 可通过 `/templatename` 展开。

| 命令 | 描述 |
|------|------|
| `/login`、`/logout` | OAuth 身份验证 |
| `/model` | 切换模型 |
| `/scoped-models` | 启用/禁用 Ctrl+P 循环的模型 |
| `/settings` | 思考级别、主题、消息投递、传输方式 |
| `/resume` | 从之前的会话中选取 |
| `/new` | 开始新会话 |
| `/name <name>` | 设置会话显示名称 |
| `/session` | 显示会话信息（文件、ID、消息、令牌、费用） |
| `/tree` | 跳转到会话中的任意点并从中继续 |
| `/fork` | 从之前的用户消息创建一个新会话 |
| `/clone` | 将当前活动分支复制到一个新会话中 |
| `/compact [prompt]` | 手动压缩上下文，可附带自定义指令 |
| `/copy` | 复制最后一条助手消息到剪贴板 |
| `/export [file]` | 将会话导出为 HTML 文件 |
| `/share` | 上传为私有 GitHub Gist，并附带可分享的 HTML 链接 |
| `/reload` | 重新加载快捷键、扩展、技能、提示和上下文文件（主题会自动热重载） |
| `/hotkeys` | 显示所有键盘快捷键 |
| `/changelog` | 显示版本历史 |
| `/quit` | 退出 pi |

### 键盘快捷键

完整列表请参阅 `/hotkeys`。可通过 `~/.pi/agent/keybindings.json` 自定义。请参阅 [docs/keybindings.md](docs/keybindings.md)。

**常用快捷键：**

| 按键 | 操作 |
|------|------|
| Ctrl+C | 清空编辑器 |
| Ctrl+C 两次 | 退出 |
| Escape | 取消/中止 |
| Escape 两次 | 打开 `/tree` |
| Ctrl+L | 打开模型选择器 |
| Ctrl+P / Shift+Ctrl+P | 前后循环作用域内的模型 |
| Shift+Tab | 循环思考级别 |
| Ctrl+O | 折叠/展开工具输出 |
| Ctrl+T | 折叠/展开思考块 |

### 消息队列

在代理工作时提交消息：

- **Enter** 排队一条*引导*消息，在当前助手轮次执行完其工具调用后投递
- **Alt+Enter** 排队一条*后续*消息，仅在代理完成所有工作后投递
- **Escape** 中止并恢复排队的消息到编辑器
- **Alt+Up** 将排队的消息取回编辑器

在 Windows Terminal 上，`Alt+Enter` 默认是全屏。在 [docs/terminal-setup.md](docs/terminal-setup.md) 中重新映射它，以便 pi 可以接收后续快捷键。

在 [设置](docs/settings.md) 中配置投递方式：`steeringMode` 和 `followUpMode` 可以是 `"one-at-a-time"`（默认，等待响应）或 `"all"`（一次性投递所有排队的消息）。`transport` 为支持多种传输方式的提供商选择首选传输方式（`"sse"`、`"websocket"` 或 `"auto"`）。

---

## 会话

会话以 JSONL 文件形式存储，并具有树形结构。每个条目都有一个 `id` 和 `parentId`，从而可以在原地分支而无需创建新文件。文件格式请参阅 [docs/session-format.md](docs/session-format.md)。

### 管理

会话自动保存到 `~/.pi/agent/sessions/`，按工作目录组织。

pi -c                  # 继续最近的会话
pi -r                  # 浏览并选择过去的会话
pi --no-session        # 临时模式（不保存）
pi --session <path|id> # 使用特定的会话文件或 ID
pi --fork <path|id>    # 将特定的会话文件或 ID 分支到一个新会话

在交互模式下使用 `/session` 查看当前会话 ID，然后可将其用于 `--session <id>` 或 `--fork <id>`。

### 分支

**`/tree`** - 在原地导航会话树。选择之前的任意点，从那里继续，并在分支之间切换。所有历史记录都保存在一个文件中。

<p align="center"><img src="docs/images/tree-view.png" alt="树形视图" width="600"></p>

- 通过输入进行搜索，使用 Ctrl+←/Ctrl+→ 或 Alt+←/Alt+→ 折叠/展开并在分支间跳转，使用 ←/→ 翻页
- 筛选模式（Ctrl+O）：默认 → 无工具 → 仅用户 → 仅带标签 → 全部
- 按 Shift+L 将条目标记为书签，按 Shift+T 切换标签时间戳

**`/fork`** - 从活动分支上的前一条用户消息创建新的会话文件。打开一个选择器，复制到该点的活动路径，并将选中的提示放入编辑器以供修改。

**`/clone`** - 将当前活动分支复制为当前位置的一个新会话文件。新会话保留完整的活动路径历史，并打开一个空编辑器。

**`--fork <path|id>`** - 直接从 CLI 分支一个现有的会话文件或部分会话 UUID。这会将整个源会话复制到当前项目中的新会话文件中。

### 压缩

长会话可能耗尽上下文窗口。压缩会总结较旧的消息，同时保留较新的消息。

**手动：** `/compact` 或 `/compact <自定义指令>`

**自动：** 默认启用。在上下文溢出时触发（恢复并重试），或在接近限制时主动触发。可通过 `/settings` 或 `settings.json` 配置。

压缩是有损的。完整历史记录仍保留在 JSONL 文件中；使用 `/tree` 重新查看。可通过 [扩展](#extensions) 自定义压缩行为。内部实现请参阅 [docs/compaction.md](docs/compaction.md)。

---

## 设置

使用 `/settings` 修改常见选项，或直接编辑 JSON 文件：

| 位置 | 作用域 |
|------|-------|
| `~/.pi/agent/settings.json` | 全局（所有项目） |
| `.pi/settings.json` | 项目（覆盖全局） |

所有选项请参阅 [docs/settings.md](docs/settings.md)。

### 遥测和更新检查

Pi 有两个独立的启动功能：

- **更新检查：** 获取 `https://pi.dev/api/latest-version` 以检查是否有更新的 Pi 版本。通过 `PI_SKIP_VERSION_CHECK=1` 禁用它。禁用更新检查仅关闭此检查。
- **安装/更新遥测：** 首次安装或 changelog 检测到更新后，向 `https://pi.dev/api/report-install` 发送匿名版本 ping。在 `settings.json` 中将 `enableInstallTelemetry` 设置为 `false`，或设置 `PI_TELEMETRY=0` 来选择退出。这不会禁用更新检查；除非禁用更新检查或启用离线模式，Pi 仍可能联系 `pi.dev` 获取最新版本。

使用 `--offline` 或 `PI_OFFLINE=1` 可禁用此处描述的所有启动网络操作，包括更新检查、包更新检查和安装/更新遥测。

---

## 上下文文件

Pi 在启动时从以下位置加载 `AGENTS.md`（或 `CLAUDE.md`）：
- `~/.pi/agent/AGENTS.md`（全局）
- 父目录（从 cwd 向上遍历）
- 当前目录

用于项目说明、约定、常用命令。所有匹配的文件会被拼接在一起。

使用 `--no-context-files`（或 `-nc`）禁用上下文文件加载。

### 系统提示

使用 `.pi/SYSTEM.md`（项目）或 `~/.pi/agent/SYSTEM.md`（全局）替换默认的系统提示。通过 `APPEND_SYSTEM.md` 追加而不替换。

---

## 自定义

### 提示模板

可重用的提示，以 Markdown 文件形式存在。输入 `/name` 展开。

<!-- ~/.pi/agent/prompts/review.md -->
审查此代码的漏洞、安全问题和性能问题。
重点关注：{{focus}}

放置在 `~/.pi/agent/prompts/`、`.pi/prompts/` 或 [pi 包](#pi-packages) 中与他人分享。请参阅 [docs/prompt-templates.md](docs/prompt-templates.md)。

### 技能

按需功能包，遵循 [Agent Skills 标准](https://agentskills.io)。通过 `/skill:name` 调用，或让代理自动加载它们。

<!-- ~/.pi/agent/skills/my-skill/SKILL.md -->
# 我的技能
当用户询问关于 X 时，使用此技能。

## 步骤
1. 执行此操作
2. 然后执行那个操作

放置在 `~/.pi/agent/skills/`、`~/.agents/skills/`、`.pi/skills/` 或 `.agents/skills/`（从 `cwd` 向上遍历父目录）或 [pi 包](#pi-packages) 中与他人分享。请参阅 [docs/skills.md](docs/skills.md)。

### 扩展

<p align="center"><img src="docs/images/doom-extension.png" alt="Doom 扩展" width="600"></p>

用于扩展 pi 的 TypeScript 模块，可添加自定义工具、命令、键盘快捷键、事件处理器和 UI 组件。

export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}

默认导出也可以是 `async`。pi 会在启动继续之前等待异步扩展工厂，这对于一次性初始化（例如在调用 `pi.registerProvider()` 之前获取远程模型列表）很有用。

**可以做什么：**
- 自定义工具（或完全替换内置工具）
- 子代理和计划模式
- 自定义压缩和总结
- 权限门和路径保护
- 自定义编辑器和 UI 组件
- 状态行、头部、页脚
- Git 检查点和自动提交
- SSH 和沙箱执行
- MCP 服务器集成
- 让 pi 看起来像 Claude Code
- 等待时玩游戏（是的，Doom 可以运行）
- ...任何你能想到的

放置在 `~/.pi/agent/extensions/`、`.pi/extensions/` 或 [pi 包](#pi-packages) 中与他人分享。请参阅 [docs/extensions.md](docs/extensions.md) 和 [examples/extensions/](examples/extensions/)。

### 主题

内置主题：`dark`、`light`。主题热重载：修改活动主题文件，pi 会立即应用更改。

放置在 `~/.pi/agent/themes/`、`.pi/themes/` 或 [pi 包](#pi-packages) 中与他人分享。请参阅 [docs/themes.md](docs/themes.md)。

### Pi 包

打包并通过 npm 或 git 分享扩展、技能、提示和主题。在 [npmjs.com](https://www.npmjs.com/search?q=keywords%3Api-package) 或 [Discord](https://discord.com/channels/1456806362351669492/1457744485428629628) 上查找包。

> **安全：** Pi 包以完全的系统权限运行。扩展可以执行任意代码，技能可以指示模型执行任何操作，包括运行可执行文件。在安装第三方包之前，请审查源代码。

pi install npm:@foo/pi-tools
pi install npm:@foo/pi-tools@1.2.3      # 固定版本
pi install git:github.com/user/repo
pi install git:github.com/user/repo@v1  # 标签或提交
pi install git:git@github.com:user/repo
pi install git:git@github.com:user/repo@v1  # 标签或提交
pi install https://github.com/user/repo
pi install https://github.com/user/repo@v1      # 标签或提交
pi install ssh://git@github.com/user/repo
pi install ssh://git@github.com/user/repo@v1    # 标签或提交
pi remove npm:@foo/pi-tools
pi uninstall npm:@foo/pi-tools          # 移除的别名
pi list
pi update                               # 更新 pi 和包（跳过固定版本的包）
pi update --extensions                  # 仅更新包
pi update --self                        # 仅更新 pi
pi update --self --force                # 即使当前版本也重新安装 pi
pi update npm:@foo/pi-tools             # 更新单个包
pi config                               # 启用/禁用扩展、技能、提示、主题

包安装到 `~/.pi/agent/git/`（git）或 `~/.pi/agent/npm/`（npm）。使用 `-l` 进行项目本地安装（`.pi/git/`、`.pi/npm/`）。Git `@ref` 值是固定的标签或提交；固定版本的包会被 `pi update` 跳过，因此使用 `pi install git:host/user/repo@new-ref` 来将现有包移动到新的引用。Git 包默认使用 `npm install --omit=dev` 安装依赖，因此运行时依赖必须在 `dependencies` 下列出；当配置了 `npmCommand` 时，git 包使用普通的 `install` 以保证与包装器的兼容性。如果你使用 Node 版本管理器并希望包安装使用稳定的 npm 环境，请在 `settings.json` 中设置 `npmCommand`，例如 `["mise", "exec", "node@20", "--", "npm"]`。

通过向 `package.json` 添加 `pi` 键来创建包：

{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}

如果没有 `pi` 清单，pi 会自动从标准目录（`extensions/`、`skills/`、`prompts/`、`themes/`）发现。

请参阅 [docs/packages.md](docs/packages.md)。

---

## 编程使用

### SDK

import { AuthStorage, createAgentSession, ModelRegistry, SessionManager } from "@earendil-works/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
});

await session.prompt("当前目录中有哪些文件？");

对于高级的多会话运行时替换，请使用 `createAgentSessionRuntime()` 和 `AgentSessionRuntime`。

请参阅 [docs/sdk.md](docs/sdk.md) 和 [examples/sdk/](examples/sdk/)。

### RPC 模式

对于非 Node.js 集成，请通过 stdin/stdout 使用 RPC 模式：

pi --mode rpc

RPC 模式使用严格以换行符分隔的 JSONL 帧格式。客户端必须仅在 `\n` 上分割记录。不要使用像 Node `readline` 这样的通用行读取器，它们也会在 JSON 负载内的 Unicode 分隔符上分割。

协议请参阅 [docs/rpc.md](docs/rpc.md)。

---

## 理念

Pi 具有高度可扩展性，因此它不必规定你的工作流程。其他工具内置的功能可以通过 [扩展](#extensions)、[技能](#skills) 构建，或从第三方 [pi 包](#pi-packages) 安装。这保持了核心的简洁性，同时让你能够塑造 pi 来适合你的工作方式。

**没有 MCP。** 构建带有 README 的 CLI 工具（请参阅 [技能](#skills)），或构建一个添加 MCP 支持的扩展。[为什么？](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

**没有子代理。** 实现方式有很多。通过 tmux 生成 pi 实例，或使用 [扩展](#extensions) 构建你自己的，或安装一个以你方式实现的包。

**没有权限弹窗。** 在容器中运行，或使用 [扩展](#extensions) 构建符合你环境和安全要求的确认流程。

**没有计划模式。** 将计划写入文件，或使用 [扩展](#extensions) 构建，或安装一个包。

**没有内置待办事项列表。** 它们会混淆模型。使用 TODO.md 文件，或使用 [扩展](#extensions) 构建你自己的。

**没有后台 bash。** 使用 tmux。完全可观测，直接交互。

阅读 [博客文章](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) 了解完整理由。

---

## CLI 参考

pi [options] [@files...] [messages...]

### 包命令

pi install <source> [-l]     # 安装包，-l 表示项目本地安装
pi remove <source> [-l]      # 移除包
pi uninstall <source> [-l]   # 移除的别名
pi update [source|self|pi]   # 更新 pi 和包（跳过固定版本的包）
pi update --extensions       # 仅更新包
pi update --self             # 仅更新 pi
pi update --self --force     # 即使当前版本也重新安装 pi
pi update --extension <src>  # 更新单个包
pi list                      # 列出已安装的包
pi config                    # 启用/禁用包资源

### 模式

| 标志 | 描述 |
|------|------|
| (默认) | 交互模式 |
| `-p`、`--print` | 打印响应并退出 |
| `--mode json` | 将所有事件输出为 JSON 行（请参阅 [docs/json.md](docs/json.md)） |
| `--mode rpc` | 用于进程集成的 RPC 模式（请参阅 [docs/rpc.md](docs/rpc.md)） |
| `--export <in> [out]` | 将会话导出为 HTML |

在打印模式下，pi 也会读取通过管道输入的 stdin 并将其合并到初始提示中：

cat README.md | pi -p "总结这段文本"

### 模型选项

| 选项 | 描述 |
|------|------|
| `--provider <name>` | 提供商（anthropic、openai、google 等） |
| `--model <pattern>` | 模型模式或 ID（支持 `provider/id` 和可选的 `:<thinking>`） |
| `--api-key <key>` | API 密钥（覆盖环境变量） |
| `--thinking <level>` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh` |
| `--models <patterns>` | 用于 Ctrl+P 循环的逗号分隔的模式 |
| `--list-models [search]` | 列出可用模型 |

### 会话选项

| 选项 | 描述 |
|------|------|
| `-c`、`--continue` | 继续最近的会话 |
| `-r`、`--resume` | 浏览并选择会话 |
| `--session <path\|id>` | 使用特定的会话文件或部分 UUID |
| `--fork <path\|id>` | 将特定的会话文件或部分 UUID 分支到一个新会话 |
| `--session-dir <dir>` | 自定义会话存储目录 |
| `--no-session` | 临时模式（不保存） |

### 工具选项

| 选项 | 描述 |
|------|------|
| `--tools <list>`、`-t <list>` | 允许列表，指定内置、扩展和自定义工具中的特定工具名 |
| `--no-builtin-tools`、`-nbt` | 默认禁用内置工具，但保持扩展和自定义工具启用 |
| `--no-tools`、`-nt` | 默认禁用所有工具 |

可用的内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`

### 资源选项

| 选项 | 描述 |
|------|------|
| `-e`、`--extension <source>` | 从路径、npm 或 git 加载扩展（可重复） |
| `--no-extensions` | 禁用扩展发现 |
| `--skill <path>` | 加载技能（可重复） |
| `--no-skills` | 禁用技能发现 |
| `--prompt-template <path>` | 加载提示模板（可重复） |
| `--no-prompt-templates` | 禁用提示模板发现 |
| `--theme <path>` | 加载主题（可重复） |
| `--no-themes` | 禁用主题发现 |
| `--no-context-files`、`-nc` | 禁用 AGENTS.md 和 CLAUDE.md 上下文文件发现 |

将 `--no-*` 与显式标志结合使用，可以忽略 settings.json 只加载你需要的组件（例如 `--no-extensions -e ./my-ext.ts`）。

### 其他选项

| 选项 | 描述 |
|------|------|
| `--system-prompt <text>` | 替换默认提示（上下文文件和技能仍会追加） |
| `--append-system-prompt <text>` | 追加到系统提示后 |
| `--verbose` | 强制显示详细启动信息 |
| `-h`、`--help` | 显示帮助 |
| `-v`、`--version` | 显示版本 |

### 文件参数

在文件前加 `@` 以包含在消息中：

pi @prompt.md "回答这个问题"
pi -p @screenshot.png "这张图片里有什么？"
pi @code.ts @test.ts "审查这些文件"

### 示例

# 交互模式，附带初始提示
pi "列出 src/ 中所有 .ts 文件"

# 非交互模式
pi -p "总结这个代码库"

# 非交互模式，带管道 stdin
cat README.md | pi -p "总结这段文本"

# 不同模型
pi --provider openai --model gpt-4o "帮我重构"

# 带提供商前缀的模型（不需要 --provider）
pi --model openai/gpt-4o "帮我重构"

# 带思考级别简写的模型
pi --model sonnet:high "解决这个复杂问题"

# 限制模型循环
pi --models "claude-*,gpt-4o"

# 只读模式
pi --tools read,grep,find,ls -p "审查代码"

# 高思考级别
pi --thinking high "解决这个复杂问题"

### 环境变量

| 变量 | 描述 |
|------|------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录（默认：`~/.pi/agent`） |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话存储目录（被 `--session-dir` 覆盖） |
| `PI_PACKAGE_DIR` | 覆盖包目录（对于 Nix/Guix 等商店路径标记化不佳的情况很有用） |
| `PI_OFFLINE` | 禁用启动网络操作，包括更新检查、包更新检查和安装/更新遥测 |
| `PI_SKIP_VERSION_CHECK` | 跳过启动时的 Pi 版本更新检查。防止 `pi.dev` 最新版本请求 |
| `PI_TELEMETRY` | 覆盖安装/更新遥测。使用 `1`/`true`/`yes` 启用，或 `0`/`false`/`no` 禁用。这不会禁用更新检查 |
| `PI_CACHE_RETENTION` | 设置为 `long` 以延长提示缓存时间（Anthropic：1h，OpenAI：24h） |
| `VISUAL`、`EDITOR` | Ctrl+G 的外部编辑器 |

---

## 贡献与开发

请参阅 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解指南，以及 [docs/development.md](docs/development.md) 了解设置、分支和调试。

---

## 许可证

MIT

## 另请参见

- [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai)：核心 LLM 工具包
- [@earendil-works/pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core)：代理框架
- [@earendil-works/pi-tui](https://www.npmjs.com/package/@earendil-works/pi-tui)：终端 UI 组件
