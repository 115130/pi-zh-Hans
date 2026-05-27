# 示例

pi-coding-agent SDK 和扩展的示例代码。

## 目录

### [sdk/](sdk/)
通过 `createAgentSession()` 进行编程使用。展示如何自定义模型、提示、工具、扩展和会话管理。

### [extensions/](extensions/)
示例扩展展示：
- 生命周期事件处理程序（工具拦截、安全门、上下文修改）
- 自定义工具（待办列表、提问、子代理、输出截断）
- 命令和键盘快捷键
- 自定义 UI（页脚、页眉、编辑器、叠加层）
- Git 集成（检查点、自动提交）
- 系统提示修改和自定义压缩
- 外部集成（SSH、文件监视器、系统主题同步）
- 自定义提供商（Anthropic 自定义流式传输、GitLab Duo）

## 文档

- [SDK 参考](sdk/README.md)
- [扩展文档](../docs/extensions.md)
- [技能文档](../docs/skills.md)
