> pi 可以创建技能。让它为您构建一个技能。

# 技能

技能是自包含的能力包，代理会根据需要按需加载。一个技能为特定任务提供专门的工作流程、设置说明、辅助脚本和参考文档。

Pi 实现了 [Agent Skills 标准](https://agentskills.io/specification)，对大多数违规行为发出警告但保持宽容。Pi 允许技能名称与父目录不同，即使标准禁止这样做；该规则对于跨多个代理框架使用的共享技能目录来说并不理想。

## 目录

- [位置](#位置)
- [技能如何工作](#技能如何工作)
- [技能命令](#技能命令)
- [技能结构](#技能结构)
- [前置元数据](#前置元数据)
- [验证](#验证)
- [示例](#示例)
- [技能仓库](#技能仓库)

## 位置

> **安全：** 技能可以指示模型执行任何操作，并可能包含模型调用的可执行代码。使用前请检查技能内容。

Pi 从以下位置加载技能：

- 全局：
  - `~/.pi/agent/skills/`
  - `~/.agents/skills/`
- 项目：
  - `.pi/skills/`
  - `cwd` 及其父目录中的 `.agents/skills/`（直到 git 仓库根目录，若不在仓库中则到文件系统根目录）
- 包：`skills/` 目录或 `package.json` 中的 `pi.skills` 条目
- 设置：包含文件或目录的 `skills` 数组
- CLI：`--skill <路径>`（可重复，即使使用 `--no-skills` 也会叠加）

发现规则：
- 在 `~/.pi/agent/skills/` 和 `.pi/skills/` 中，直接的根目录 `.md` 文件作为单个技能被发现
- 在所有技能位置，包含 `SKILL.md` 的目录会被递归发现
- 在 `~/.agents/skills/` 和项目 `.agents/skills/` 中，根目录的 `.md` 文件被忽略

使用 `--no-skills` 禁用手动发现（明确通过 `--skill` 指定的路径仍会加载）。

### 使用其他框架的技能

要使用来自 Claude Code 或 OpenAI Codex 的技能，将其目录添加到设置中：

```json
{
  "skills": [
    "~/.claude/skills",
    "~/.codex/skills"
  ]
}
```

对于项目级别的 Claude Code 技能，添加到 `.pi/settings.json`：

```json
{
  "skills": ["../.claude/skills"]
}
```

## 技能如何工作

1. 启动时，pi 扫描技能位置并提取名称和描述
2. 系统提示包含可用技能，以 XML 格式呈现，符合[规范](https://agentskills.io/integrate-skills)
3. 当任务匹配时，代理使用 `read` 加载完整的 SKILL.md（模型并不总是这样做；使用提示或 `/skill:name` 来强制执行）
4. 代理遵循说明，使用相对路径引用脚本和资源

这是渐进式披露：只有描述始终在上下文内，完整说明按需加载。

## 技能命令

技能注册为 `/skill:name` 命令：

```bash
/skill:brave-search           # 加载并执行技能
/skill:pdf-tools extract      # 加载技能并带参数
```

命令后的参数会作为 `User: <参数>` 附加到技能内容中。

在交互模式或 `settings.json` 中通过 `/settings` 切换技能命令：

```json
{
  "enableSkillCommands": true
}
```

## 技能结构

一个技能是一个包含 `SKILL.md` 文件的目录。其他一切自由发挥。

```
my-skill/
├── SKILL.md              # 必需：前置元数据 + 说明
├── scripts/              # 辅助脚本
│   └── process.sh
├── references/            # 按需加载的详细文档
│   └── api-reference.md
└── assets/
    └── template.json
```

### SKILL.md 格式

````markdown
---
name: my-skill
description: 该技能的作用及何时使用。请具体描述。
---

# 我的技能

## 设置

首次使用前运行一次：
```bash
cd /path/to/skill && npm install
```

## 用法

```bash
./scripts/process.sh <输入>
```
````

使用技能目录的相对路径：

```markdown
详见[参考指南](references/REFERENCE.md)。
```

## 前置元数据

根据 [Agent Skills 规范](https://agentskills.io/specification#frontmatter-required)：

| 字段 | 必需 | 描述 |
|-------|----------|-------------|
| `name` | 是 | 最多64个字符。仅限小写字母a-z、数字0-9、连字符。与标准不同，Pi 不要求与父目录名称匹配，因为该标准对于共享技能目录而言并不理想。 |
| `description` | 是 | 最多1024个字符。技能的作用及何时使用。 |
| `license` | 否 | 许可证名称或对打包文件的引用。 |
| `compatibility` | 否 | 最多500个字符。环境要求。 |
| `metadata` | 否 | 任意键值映射。 |
| `allowed-tools` | 否 | 空格分隔的预批准工具列表（实验性）。 |
| `disable-model-invocation` | 否 | 当设置为 `true` 时，技能对系统提示隐藏。用户必须使用 `/skill:name`。 |

### 名称规则

- 1-64 个字符
- 仅限小写字母、数字和连字符
- 无前导或尾随连字符
- 无连续连字符
Pi 不要求名称与父目录匹配。Agent Skills 标准要求如此，但对于多个工具使用的共享技能目录来说，这一要求并不理想。

有效：`pdf-processing`、`data-analysis`、`code-review`
无效：`PDF-Processing`、`-pdf`、`pdf--processing`

### 描述最佳实践

描述决定了代理何时加载技能。请具体说明。

良好：
```yaml
description: 从 PDF 文件中提取文本和表格，填写 PDF 表单，合并多个 PDF 文件。处理 PDF 文档时使用。
```

欠佳：
```yaml
description: 帮助处理 PDF。
```

## 验证

Pi 根据 Agent Skills 标准验证技能。大多数问题会产生警告，但技能仍会加载：

- 名称超过64个字符或包含无效字符
- 名称以连字符开头/结尾，或包含连续连字符
- 描述超过1024个字符

未知的前置元数据字段会被忽略。

**例外：** 缺少描述的技能不会被加载。

名称冲突（不同位置的同名技能）会发出警告并保留最先找到的技能。

## 示例

```
brave-search/
├── SKILL.md
├── search.js
└── content.js
```

**SKILL.md:**
````markdown
---
name: brave-search
description: 通过 Brave Search API 进行网络搜索和内容提取。用于搜索文档、资料或任何网络内容。
---

# Brave 搜索

## 设置

```bash
cd /path/to/brave-search && npm install
```

## 搜索

```bash
./search.js "查询词"              # 基本搜索
./search.js "查询词" --content    # 包含页面内容
```

## 提取页面内容

```bash
./content.js https://example.com
```
````

## 技能仓库

- [Anthropic Skills](https://github.com/anthropics/skills) - 文档处理（docx、pdf、pptx、xlsx），Web 开发
- [Pi Skills](https://github.com/badlogic/pi-skills) - Web 搜索，浏览器自动化，Google API，转录
