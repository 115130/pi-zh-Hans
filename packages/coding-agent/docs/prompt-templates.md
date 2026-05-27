> pi 可以创建提示模板。请让它为你的工作流程构建一个模板。

# 提示模板

提示模板是可扩展为完整提示的 Markdown 片段。在编辑器中输入 `/名称` 即可调用模板，其中 `名称` 是不带 `.md` 的文件名。

## 位置

Pi 从以下位置加载提示模板：

- 全局：`~/.pi/agent/prompts/*.md`
- 项目：`.pi/prompts/*.md`
- 包：`prompts/` 目录或 `package.json` 中的 `pi.prompts` 条目
- 设置：包含文件或目录的 `prompts` 数组
- CLI：`--prompt-template <路径>`（可重复）

使用 `--no-prompt-templates` 禁用自动发现。

## 格式

```markdown
---
description: 审查已暂存的 Git 变更
---
审查已暂存的变更（`git diff --cached`）。重点关注：
- 错误和逻辑缺陷
- 安全问题
- 错误处理漏洞
```

- 文件名即命令名称。`review.md` 对应 `/review`。
- `description` 为可选字段。若缺失，则使用第一个非空行。
- `argument-hint` 为可选字段。设置后，提示将在自动完成下拉列表中显示在描述之前。

### 参数提示

在 frontmatter 中使用 `argument-hint` 可在自动完成中显示预期参数。使用 `<尖括号>` 表示必需参数，`[方括号]` 表示可选参数：

```markdown
---
description: 从 URL 审查 PR，进行结构化问题与代码分析
argument-hint: "<PR-URL>"
---
```

这会在自动完成下拉列表中呈现为：

```
→ pr   <PR-URL>       — 从 URL 审查 PR，进行结构化问题与代码分析
  is   <issue>        — 分析 GitHub 问题（缺陷或功能请求）
  wr   [instructions] — 端到端完成当前任务
  cl   — 发布前审计变更日志条目
```

## 用法

在编辑器中输入 `/` 后跟模板名称。自动完成功能会显示可用模板及其描述。

```
/review                           # 展开 review.md
/component Button                 # 带参数展开
/component Button "click handler" # 多个参数
```

## 参数

模板支持位置参数和简单切片：

- `$1`, `$2`, ... 位置参数
- `$@` 或 `$ARGUMENTS` 表示所有参数拼接
- `${@:N}` 表示从第 N 个位置开始的参数（从 1 开始计数）
- `${@:N:L}` 表示从 N 开始的 L 个参数

示例：

```markdown
---
description: 创建一个组件
---
创建一个名为 $1 的 React 组件，具备以下功能：$@
```

用法：`/component Button "onClick handler" "disabled support"`

## 加载规则

- 在 `prompts/` 中的模板发现是非递归的。
- 若需要子目录中的模板，请通过 `prompts` 设置或包清单显式添加它们。
