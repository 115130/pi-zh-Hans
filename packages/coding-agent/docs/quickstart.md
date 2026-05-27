# 快速入门

本页面将引导您从安装到完成第一个实用的 Pi 会话。

## 安装

Pi 以 npm 包的形式分发：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

`--ignore-scripts` 在安装过程中禁用依赖生命周期脚本。Pi 在常规 npm 安装中不需要安装脚本。

### 卸载

使用安装 Pi 的包管理器。curl 安装器使用全局 npm，因此 curl 和 npm 安装的 Pi 可以通过 npm 卸载：

```bash
# curl 安装器或 npm install -g
npm uninstall -g @earendil-works/pi-coding-agent

# pnpm
pnpm remove -g @earendil-works/pi-coding-agent

# Yarn
yarn global remove @earendil-works/pi-coding-agent

# Bun
bun uninstall -g @earendil-works/pi-coding-agent
```

卸载 Pi 会保留设置、凭据、会话以及已安装的 Pi 包在 `~/.pi/agent/` 中。

然后在您希望 Pi 工作的项目目录中启动它：

```bash
cd /path/to/project
pi
```

## 身份验证

Pi 可以通过 `/login` 使用订阅提供商，或通过环境变量或身份验证文件使用 API 密钥提供商。

### 选项 1：订阅登录

启动 Pi 并运行：

```text
/login
```

然后选择一个提供商。内置的订阅登录包括 Claude Pro/Max、ChatGPT Plus/Pro (Codex) 和 GitHub Copilot。

### 选项 2：API 密钥

在启动 Pi 之前设置 API 密钥：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

您也可以运行 `/login` 并选择一个 API 密钥提供商，将密钥存储在 `~/.pi/agent/auth.json` 中。

请参阅[提供商](providers.md)了解所有支持的提供商、环境变量以及云提供商设置。

## 第一个会话

当 Pi 启动后，输入一个请求并按 Enter：

```text
总结这个仓库，并告诉我如何运行其检查。
```

默认情况下，Pi 为模型提供四种工具：

- `read` - 读取文件
- `write` - 创建或覆盖文件
- `edit` - 修补文件
- `bash` - 运行 shell 命令

其他内置的只读工具（`grep`、`find`、`ls`）可通过工具选项使用。Pi 会在您当前的工作目录中运行，并可以修改其中的文件。如果您希望轻松回滚，请使用 git 或其他检查点工作流程。

## 为 Pi 提供项目说明

Pi 在启动时加载上下文文件。添加一个 `AGENTS.md` 文件来告诉它如何在项目中工作：

```markdown
# 项目说明

- 代码更改后运行 `npm run check`。
- 不要在本机运行生产迁移。
- 保持回复简洁。
```

Pi 加载：

- `~/.pi/agent/AGENTS.md` 作为全局说明
- 父目录和当前目录中的 `AGENTS.md` 或 `CLAUDE.md`

更改上下文文件后，重新启动 Pi，或运行 `/reload`。

## 常见尝试事项

### 引用文件

在编辑器中输入 `@` 可以模糊搜索文件，或者在命令行中传递文件：

```bash
pi @README.md "总结这个"
pi @src/app.ts @src/app.test.ts "一起审查这两个"
```

图像可以通过 Ctrl+V（Windows 上为 Alt+V）粘贴，或拖放到支持的终端中。

### 运行 shell 命令

在交互模式下：

```text
!npm run lint
```

命令输出会发送给模型。使用 `!!command` 可以运行命令但不将其输出添加到模型上下文中。

### 切换模型

使用 `/model` 或 Ctrl+L 选择模型。使用 Shift+Tab 循环切换思考级别。使用 Ctrl+P / Shift+Ctrl+P 循环切换域内模型。

### 稍后继续

会话会自动保存：

```bash
pi -c                  # 继续最近的会话
pi -r                  # 浏览之前的会话
pi --session <path|id> # 打开特定会话
```

在 Pi 内部，使用 `/resume`、`/new`、`/tree`、`/fork` 和 `/clone` 来管理会话。

### 非交互模式

用于单次提示：

```bash
pi -p "总结这个代码库"
cat README.md | pi -p "总结这段文字"
pi -p @screenshot.png "这张图片里有什么？"
```

使用 `--mode json` 获取 JSON 事件输出，或使用 `--mode rpc` 进行进程集成。

## 下一步

- [使用 Pi](usage.md) - 交互模式、斜杠命令、会话、上下文文件和 CLI 参考。
- [提供商](providers.md) - 身份验证和模型设置。
- [设置](settings.md) - 全局和项目配置。
- [快捷键](keybindings.md) - 快捷键和自定义。
- [Pi 包](packages.md) - 安装共享扩展、技能、提示和主题。

平台说明：[Windows](windows.md)、[Termux](termux.md)、[tmux](tmux.md)、[终端设置](terminal-setup.md)、[Shell 别名](shell-aliases.md)。
