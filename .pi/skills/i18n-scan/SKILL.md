---
name: i18n-scan
description: 扫描项目中的字符串字面量并进行汉化，兼容 TypeScript/JavaScript、Rust、Java、Python、Dart/Flutter、Go、C/C++、Ruby、PHP 等主流语言。
---

# i18n 字符串扫描与汉化

扫描项目中所有非 gitignore 文件，找出被各种语言的字符串包裹符包围的文本块，
定位其文件/行/列位置，并完成汉化（中文化）。

## 支持的字符串格式

### 1. 标准引号字符串（几乎所有语言）

| 包裹符 | 语言 | 说明 |
|--------|------|------|
| `"..."` | 全部 | 双引号，支持转义 |
| `'...'` | JS/TS/Python/Rust/PHP/Java 等 | 单引号 |
| `` `...` `` | JS/TS/Go | 反引号（Go 中为原生多行） |

### 2. 多行字符串

| 包裹符 | 语言 | 说明 |
|--------|------|------|
| `"""..."""` | Python/Dart/Java 13+/Swift | 三重双引号多行 |
| `'''...'''` | Python | 三重单引号多行 |

### 3. 带前缀的字符串

| 包裹符 | 语言 | 说明 |
|--------|------|------|
| `r"..."` / `r'...'` | Python/Rust | 原始字符串（不处理转义） |
| `b"..."` / `b'...'` | Python | 字节串 |
| `f"..."` / `f'...'` | Python | f-string（含插值表达式） |
| `rf"..."` | Python | 原始 f-string |
| `R"(...)"` | C++ | 原始字符串字面量 |
| `R"delim(...)delim"` | C++ | 带定界符的原始字符串 |

### 4. 语言专用格式

| 包裹符 | 语言 | 说明 |
|--------|------|------|
| `r#"..."#` / `r##"..."##` | Rust | 带 # 的原始字符串 |
| `@"..."` | C# | 逐字字符串 |
| `$"..."` / $@"..."` | C# | 插值字符串 |
| `%{...}` | Elixir | 字符串插值 |
| `q(...)` / `qq(...)` | Perl | 引号类运算符 |
| `<<~"EOF" ... EOF` | Ruby/PHP/Shell | Heredoc |
| `'...'` | Shell | 单引号（不展开变量） |

## 扫描方法

### 方法 A：逐行正则扫描（推荐）

对每个文件，逐行用正则匹配各种引号对：

```python
import re

# 常见字符串格式的正则
patterns = [
    # 三重引号（多行，优先匹配）
    (r'"""[\s\S]*?"""', 'python-triple-double'),
    (r"'''[\s\S]*?'''", 'python-triple-single'),
    # Rust 原始字符串 r#"..."#
    (r'r#"[^"]*"#', 'rust-raw'),
    # C++ 原始字符串 R"(...)"
    (r'R"\([^)]*\)"', 'cpp-raw'),
    # 标准引号（单行）
    (r'"([^"\\]|\\.)*"', 'double'),
    (r"'([^'\\]|\\.)*'", 'single'),
    # 反引号（JS/TS/Go）
    (r'`([^`\\]|\\.)*`', 'backtick'),
]
```

### 方法 B：逐字符扫描（精度更高）

对每行逐字符遍历，遇到引号起始符后开始累积，直到遇到匹配的结束符（考虑转义）。

```python
def scan_strings(text, quotes):
    """扫描文本中的所有字符串字面量。
    quotes: [("start", "end", escape, multiLine), ...]
    """
    hits = []
    lines = text.split("\n")
    for ln, line in enumerate(lines):
        col = 0
        while col < len(line):
            # 跳过 // 和 # 注释
            tail = line[col:].lstrip()
            if tail.startswith("//") or tail.startswith("#"):
                break
            for qs, qe, esc, ml in quotes:
                if not line[col:].startswith(qs):
                    continue
                start_col = col
                col += len(qs)
                buf = []
                if ml:
                    # 多行搜索
                    cl, ci = ln, col
                    while cl < len(lines):
                        ...
                else:
                    # 单行搜索
                    while col < len(line):
                        if esc and line[col] == "\\":
                            buf.append(line[col:col+2]); col += 2; continue
                        if line[col:].startswith(qe):
                            hits.append((ln+1, start_col+1, buf_str))
                            col += len(qe); break
                        buf.append(line[col]); col += 1
                break
            col += 1
    return hits
```

## 引号定义表（通用配置）

```python
QUOTES = [
    # (名称, 起始, 结束, 转义, 多行)
    ("双引号", '"', '"', True, True),
    ("单引号", "'", "'", True, True),
    ("反引号", "`", "`", True, True),
    ("三重双引号", '"""', '"""', True, True),
    ("三重单引号", "'''", "'''", True, True),
    ("Python 原始字符串", 'r"', '"', False, False),
    ("Python 字节串", "b'", "'", False, False),
    ("Rust 原始字符串", 'r#"', '"#', False, False),
    ("C++ 原始字符串", 'R"(', ')"', False, False),
]
```

## 过滤规则

扫描到字符串后，按以下规则决定是否汉化：

### 跳过（不汉化）
- **import/require 路径**：以 `@`、`./`、`../`、`/` 开头，或以 `.ts`、`.js`、`.py` 等结尾
- **URL/URI**：以 `http://`、`https://`、`ftp://` 开头
- **颜色值**：如 `#ff0000`、`rgb(...)`
- **代码标识符**：纯字母数字下划线（如变量名、函数名）
- **CLI flag**：以 `--` 或 `-` 开头
- **模型 ID/API 名**：如 `amazon-bedrock`、`gpt-4o`
- **配置枚举值**：如 `"auto"`、`"one-at-a-time"`
- **数字/符号**：纯数字或纯符号的字符串
- **正则表达式**：以 `/` 开头并以 `/` 结尾（JS）
- **版本号**：如 `"1.0.0"`、`"v0.78.0"`

### 需要汉化（用户面向文本）
- **错误消息**：`throw new Error("...")`、`showError("...")`
- **状态提示**：`showStatus("...")`、`console.log("...")`
- **UI 标签**：`"skill:"`、`"user:"`、`"assistant:"`
- **工具描述**：tool 的 description、参数 description
- **提示/警告**：`showWarning("...")`
- **注释文字**：`// ...` 和 `/** ... */` 中的英文句子
- **配置描述**：JSON/JSON5/YAML 中的 `description` 字段
- **文档标题/描述**：Markdown 中的标题和段落

## 汉化流程

1. **全量扫描**：用 `scan_strings` 工具或脚本扫描所有非 gitignore 文件
2. **按文件分组**：将结果按英文数量降序排列
3. **逐批处理**：每批 20 个文件，先处理英文最多的
4. **筛选用户面向文本**：过滤掉 import/路径/颜色/ID 等非用户内容
5. **逐条汉化**：
   - 错误消息 → 中文错误消息
   - UI 标签 → 中文标签
   - 注释 → 中文注释
   - 描述 → 中文描述
6. **类型安全**：汉化字符串时确保不改变变量名、配置枚举值、API 协议值
7. **编译检查**：汉化后运行 `npm run check` 或对应语言的编译/类型检查

## 注意事项

- **配置值不汉化**：`"one-at-a-time"`、`"auto"` 等枚举值保持英文
- **协议/标准值不汉化**：HTTP 方法名、MIME 类型等
- **模型/API 标识符不汉化**：`"amazon-bedrock"`、`"gpt-4o"`
- **终端转义序列不汉化**：`\x1b]8;;${url}\x07`
- **HTML/XML 标签不汉化**：`<div>`、`<span>` 等
- **CSS 类名不汉化**：`.tool-name`、`.tree-content`
- **JSDoc/文档注释中的 `@param`、`@returns` 等标签保留英文**
- **`biome-ignore`、`eslint-disable` 等工具注释保留英文**
- **变更日志（CHANGELOG）保留英文**
- **测试文件（`*.test.ts`）中的测试描述可汉化也可保留英文**