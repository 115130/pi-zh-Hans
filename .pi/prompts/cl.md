---
description: 发布前审计变更日志条目
---
审计自上次发布以来所有提交的变更日志条目。

## 流程

1. **找到最新的发布标签：**
   ```bash
   git tag --sort=-version:refname | head -1
   ```

2. **列出该标签以来的所有提交：**
   ```bash
   git log <tag>..HEAD --oneline
   ```

3. **阅读每个包的 [Unreleased] 章节：**
   - packages/ai/CHANGELOG.md
   - packages/tui/CHANGELOG.md
   - packages/coding-agent/CHANGELOG.md

4. **对每个提交，检查：**
   - 跳过：变更日志更新、仅文档变更、发布维护
   - 跳过：生成的模型目录变更（例如 `packages/ai/src/models.generated.ts`），除非同时有非生成的源码/文档中面向产品的有意变更
   - 确定该提交影响了哪些包（使用 `git show <hash> --stat`）
   - 验证受影响的包中存在相应的变更日志条目
   - 对于外部贡献（PR），验证格式：`Description ([#N](url) by [@user](url))`

5. **跨包复制规则：**
   `ai`、`agent` 或 `tui` 中影响最终用户的变更应复制到 `coding-agent` 的变更日志中，因为 coding-agent 是依赖它们的面向用户的包。

6. **在变更日志修复后添加"新功能"章节：**
   - 在 `packages/coding-agent/CHANGELOG.md` 的 `## [Unreleased]` 开头插入 `### New Features` 章节。
   - 在写入之前，向用户提议最值得关注的新功能以供确认。
   - 尽可能链接到相关文档和章节。

7. **报告：**
   - 列出缺少条目的提交
   - 列出需要跨包复制的条目
   - 直接添加任何缺失的条目

## 变更日志格式参考

章节（按顺序）：
- `### Breaking Changes` - 需要迁移的 API 变更
- `### Added` - 新功能
- `### Changed` - 现有功能的变更
- `### Fixed` - 错误修复
- `### Removed` - 移除的功能

归属：
- 内部：`Fixed foo ([#123](https://github.com/earendil-works/pi-mono/issues/123))`
- 外部：`Added bar ([#456](https://github.com/earendil-works/pi-mono/pull/456) by [@user](https://github.com/user))`
