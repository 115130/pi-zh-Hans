# 扩展示例

pi-coding-agent 的扩展示例。

## 使用方法

```bash
# 使用 --extension 标志加载扩展
pi --extension examples/extensions/permission-gate.ts

# 或复制到扩展目录实现自动发现
cp permission-gate.ts ~/.pi/agent/extensions/
```

## 示例

### 生命周期与安全

| 扩展 | 描述 |
|-----------|-------------|
| `permission-gate.ts` | 在危险 bash 命令（rm -rf、sudo 等）前弹窗确认 |
| `protected-paths.ts` | 阻止写入受保护路径（.env、.git/、node_modules/） |
| `confirm-destructive.ts` | 在执行破坏性会话操作（clear、switch、fork）前确认 |
| `dirty-repo-guard.ts` | 当 git 有未提交变更时阻止会话切换 |
| `sandbox/` | 基于操作系统层级的沙箱，使用 `@anthropic-ai/sandbox-runtime` 并支持按项目配置 |

### 自定义工具

| 扩展 | 描述 |
|-----------|-------------|
| `todo.ts` | 待办列表工具 + `/todos` 命令，支持自定义渲染和状态持久化 |
| `hello.ts` | 最小化自定义工具示例 |
| `question.ts` | 演示使用 `ctx.ui.select()` 向用户提问并显示自定义 UI |
| `questionnaire.ts` | 多问题输入，通过标签栏在问题间导航 |
| `tool-override.ts` | 重写内置工具（例如为 `read` 添加日志/访问控制） |
| `dynamic-tools.ts` | 启动后（`session_start`）及运行时通过命令注册工具，支持提示片段和工具专用提示指南 |
| `structured-output.ts` | 最终的结构化输出工具，返回 `terminate: true` 让智能体可在工具调用时结束 |
| `built-in-tool-renderer.ts` | 为内置工具（read、bash、edit、write）提供紧凑自定义渲染，同时保留原有行为 |
| `minimal-mode.ts` | 重写内置工具渲染以实现极简显示（仅显示工具调用，折叠模式下无输出） |
| `truncated-tool.ts` | 包装 ripgrep 并正确截断输出（50KB/2000 行） |
| `ssh.ts` | 通过 SSH 将全部工具委托给远程机器，使用可插拔操作 |
| `subagent/` | 将任务委托给专门的子智能体，拥有独立上下文窗口 |

### 命令与 UI

| 扩展 | 描述 |
|-----------|-------------|
| `preset.ts` | 通过 `--preset` 标志和 `/preset` 命令为模型、思考深度、工具和指令提供命名预设 |
| `plan-mode/` | 类 Claude Code 的计划模式，用于只读探索，支持 `/plan` 命令和步骤追踪 |
| `tools.ts` | 交互式 `/tools` 命令，可启用/禁用工具并支持会话持久化 |
| `handoff.ts` | 通过 `/handoff <目标>` 将上下文转移到新的聚焦会话 |
| `qna.ts` | 使用 `ctx.ui.setEditorText()` 将上次回复中的问题提取到编辑器中 |
| `status-line.ts` | 在底部栏通过 `ctx.ui.setStatus()` 展示轮次进度，支持主题色 |
| `github-issue-autocomplete.ts` | 添加 `#1234` issue 补全，通过叠加自定义自动补全提供者，预加载 `gh issue list` 的开放 issue |
| `widget-placement.ts` | 通过 `ctx.ui.setWidget()` 定位在编辑器上方和下方显示微件 |
| `hidden-thinking-label.ts` | 通过 `ctx.ui.setHiddenThinkingLabel()` 自定义折叠思考的标签 |
| `working-indicator.ts` | 通过 `ctx.ui.setWorkingIndicator()` 自定义流式工作指示器 |
| `model-status.ts` | 通过 `model_select` 钩子在状态栏显示模型变更 |
| `snake.ts` | 贪吃蛇游戏，包含自定义 UI、键盘处理和会话持久化 |
| `tic-tac-toe.ts` | 与智能体对战井字棋，使用 `executionMode: "sequential"` 工具防止共享光标状态的竞态条件 |
| `send-user-message.ts` | 演示从扩展发送用户消息的 `pi.sendUserMessage()` |
| `timed-confirm.ts` | 演示使用 AbortSignal 自动关闭 `ctx.ui.confirm()` 和 `ctx.ui.select()` 对话框 |
| `rpc-demo.ts` | 实践所有支持 RPC 的扩展 UI 方法；配合 [`examples/rpc-extension-ui.ts`](../rpc-extension-ui.ts) 使用 |
| `modal-editor.ts` | 通过 `ctx.ui.setEditorComponent()` 实现类 vim 模态编辑器 |
| `rainbow-editor.ts` | 通过自定义编辑器实现动画彩虹文字效果 |
| `notify.ts` | 当智能体完成工作时通过 OSC 777 发送桌面通知（Ghostty、iTerm2、WezTerm） |
| `titlebar-spinner.ts` | 智能体工作时在终端标题显示盲文旋转动画 |
| `summarize.ts` | 使用 GPT-5.2 总结对话并以瞬态 UI 展示 |
| `custom-footer.ts` | 通过 `ctx.ui.setFooter()` 自定义底部栏，显示 git 分支和令牌统计 |
| `custom-header.ts` | 通过 `ctx.ui.setHeader()` 自定义顶部栏 |
| `overlay-test.ts` | 测试叠加合成，包含内联文本输入和边界情况 |
| `overlay-qa-tests.ts` | 全面的叠加质量测试：锚点、边距、堆叠、溢出、动画 |
| `doom-overlay/` | 以 35 FPS 运行的 DOOM 游戏作为叠加层（演示实时游戏渲染） |
| `shutdown-command.ts` | 添加 `/quit` 命令，演示 `ctx.shutdown()` |
| `reload-runtime.ts` | 添加 `/reload-runtime` 和 `reload_runtime` 工具，展示安全重载流程 |
| `interactive-shell.ts` | 通过 `user_bash` 钩子以完整终端运行交互式命令（vim、htop） |
| `inline-bash.ts` | 通过 `input` 事件转换在提示中展开 `!{command}` 模式 |

### Git 集成

| 扩展 | 描述 |
|-----------|-------------|
| `git-checkpoint.ts` | 每轮创建 git stash 检查点，以便在分支切换时恢复代码 |
| `auto-commit-on-exit.ts` | 退出时自动提交，使用最后一条助手消息作为提交信息 |

### 系统提示与压缩

| 扩展 | 描述 |
|-----------|-------------|
| `pirate.ts` | 演示使用 `systemPromptAppend` 动态修改系统提示 |
| `claude-rules.ts` | 扫描 `.claude/rules/` 文件夹并在系统提示中列出规则 |
| `custom-compaction.ts` | 自定义压缩，总结整个对话 |
| `trigger-compact.ts` | 当上下文用量超过 100k 令牌时触发压缩，并添加 `/trigger-compact` 命令 |

### 系统集成

| 扩展 | 描述 |
|-----------|-------------|
| `mac-system-theme.ts` | 将 pi 主题与 macOS 深色/浅色模式同步 |

### 资源

| 扩展 | 描述 |
|-----------|-------------|
| `dynamic-resources/` | 使用 `resources_discover` 加载技能、提示和主题 |

### 消息与通信

| 扩展 | 描述 |
|-----------|-------------|
| `message-renderer.ts` | 通过 `registerMessageRenderer` 自定义消息渲染，支持颜色和可展开详情 |
| `event-bus.ts` | 通过 `pi.events` 实现扩展间通信 |

### 会话元数据

| 扩展 | 描述 |
|-----------|-------------|
| `session-name.ts` | 为会话选择器中的会话命名，使用 `setSessionName` |
| `bookmark.ts` | 通过 `setLabel` 为条目添加书签标签，用于 `/tree` 导航 |

### 自定义提供商

| 扩展 | 描述 |
|-----------|-------------|
| `custom-provider-anthropic/` | 自定义 Anthropic 提供商，支持 OAuth 和自定义流式实现 |
| `custom-provider-gitlab-duo/` | GitLab Duo 提供商，使用 pi-ai 内置的 Anthropic/OpenAI 流式代理 |

### 外部依赖

| 扩展 | 描述 |
|-----------|-------------|
| `with-deps/` | 自带 package.json 和依赖的扩展（演示 jiti 模块解析） |
| `file-trigger.ts` | 监视触发文件并注入内容到对话中 |

## 编写扩展

完整文档请参见 [docs/extensions.md](../../docs/extensions.md)。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to lifecycle events
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });

  // Register custom tools
  pi.registerTool({
    name: "greet",
    label: "Greeting",
    description: "Generate a greeting",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(toolCallId, params, onUpdate, ctx, signal) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // Register commands
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });
}
```

## 关键模式

**对字符串参数使用 StringEnum**（兼容 Google API 的必要要求）：
```typescript
import { StringEnum } from "@earendil-works/pi-ai";

// 好
action: StringEnum(["list", "add"] as const)

// 不好 – 与 Google 不兼容
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

**通过 details 实现状态持久化：**
```typescript
// 将状态存储在工具结果 details 中，以便正确支持分支
return {
  content: [{ type: "text", text: "Done" }],
  details: { todos: [...todos], nextId },  // 持久化到会话中
};

// 在会话事件中重建
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      const details = entry.message.details;
      // 从 details 重建状态
    }
  }
});
```
