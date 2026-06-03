<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> 域名由以下组织友情捐赠
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy 吉祥物" width="48" /><br />exe.dev</a>
</p>

> 新贡献者提交的 Issue 和 PR 默认自动关闭。维护者每日都会审核这些自动关闭的 Issue。详情请见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

# Pi 代理框架单体仓库

这里是 pi 代理框架项目的所在地，包含我们可扩展的编码代理。

* **[@earendil-works/pi-coding-agent](packages/coding-agent)**：交互式编码代理命令行工具
* **[@earendil-works/pi-agent-core](packages/agent)**：支持工具调用和状态管理的代理运行时
* **[@earendil-works/pi-ai](packages/ai)**：统一的多提供商 LLM API（OpenAI、Anthropic、Google 等）

进一步了解 pi：

* [访问 pi.dev](https://pi.dev)——项目官网，含演示
* [阅读文档](https://pi.dev/docs/latest)，你也可以直接让代理自己解释

## 分享你的开源编码代理会话

如果你在开源项目中使用 pi 或其他编码代理，欢迎分享你的会话。

公开的开源会话数据有助于用真实世界的任务、工具使用场景和故障修复来改进编码代理，而不是依赖玩具级的基准测试。

详细说明请参见 [X 上的这篇文章](https://x.com/badlogicgames/status/2037811643774652911)。

要发布会话，请使用 [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf)。阅读其 README.md 了解设置步骤。你只需要一个 Hugging Face 账号、Hugging Face 命令行工具和 `pi-share-hf`。

也可以观看[这个视频](https://x.com/badlogicgames/status/2041151967695634619)，里面演示了如何发布我的 `pi-mono` 会话。

我定期在这里发布自己的 `pi-mono` 工作会话：

- [badlogicgames/pi-mono 上的 Hugging Face 数据集](https://huggingface.co/datasets/badlogicgames/pi-mono)

## 所有包

| 包 | 说明 |
|---------|------|
| **[@earendil-works/pi-ai](packages/ai)** | 统一的多提供商 LLM API（OpenAI、Anthropic、Google 等） |
| **[@earendil-works/pi-agent-core](packages/agent)** | 支持工具调用和状态管理的代理运行时 |
| **[@earendil-works/pi-coding-agent](packages/coding-agent)** | 交互式编码代理命令行工具 |
| **[@earendil-works/pi-tui](packages/tui)** | 支持差分渲染的终端 UI 库 |

Slack/聊天自动化和工作流相关请参见 [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat)。

## 参与贡献

贡献指南请见 [CONTRIBUTING.md](CONTRIBUTING.md)，项目规则（面向人和代理）请见 [AGENTS.md](AGENTS.md)。

## 开发

```bash
npm install --ignore-scripts  # 安装所有依赖，不执行生命周期脚本
npm run build                 # 构建所有包
npm run check                 # 代码检查、格式化和类型检查
./test.sh                     # 运行测试（无 API 密钥时跳过依赖 LLM 的测试）
./pi-test.sh                  # 从源码运行 pi（可在任意目录执行）
```

## 供应链安全

我们将 npm 依赖变更视同代码变更来审核。

- 直接外部依赖固定到精确版本。内部工作区包保持版本范围。
- `.npmrc` 设置了 `save-exact=true` 和 `min-release-age=2`，避免在 npm 解析时用到当天的依赖发布。
- `package-lock.json` 是依赖的权威来源。pre-commit 会拦截意外的锁文件提交，除非设置了 `PI_ALLOW_LOCKFILE_CHANGE=1`。
- `npm run check` 会验证固定的直接依赖、原生 TypeScript 导入兼容性以及生成的 coding-agent shrinkwrap。
- 发布的 CLI 包包含 `packages/coding-agent/npm-shrinkwrap.json`（从根锁文件生成），为 npm 用户锁定传递依赖。
- 发布冒烟测试使用 `npm run release:local` 在发布前构建、打包，并在仓库外创建隔离的 npm 和 Bun 安装。
- 本地发布安装、文档中记录的 npm 安装以及 `pi update --self` 在支持处使用 `--ignore-scripts`。
- CI 使用 `npm ci --ignore-scripts` 安装，定时运行的 GitHub 工作流会执行 `npm audit --omit=dev` 和 `npm audit signatures --omit=dev`。
- Shrinkwrap 生成包含依赖生命周期脚本的显式白名单；带有生命周期脚本的新依赖在审核前会检查失败。

## 许可证

MIT