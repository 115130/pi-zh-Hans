# 键绑定

所有键盘快捷键都可以通过 `~/.pi/agent/keybindings.json` 进行自定义。每个操作可以绑定到一个或多个键。

配置文件使用与 pi 内部相同的命名空间键绑定 ID，扩展作者在 `keyHint()` 和注入的 `keybindings` 管理器中也使用这些 ID。

使用旧的非命名空间 ID（如 `cursorUp` 或 `expandTools`）的旧配置在启动时会自动迁移到命名空间 ID。

编辑 `keybindings.json` 后，在 pi 中运行 `/reload` 即可应用更改，无需重启会话。

## 键格式

`修饰键+键`，其中修饰键可以是 `ctrl`、`shift`、`alt`（可组合），键可以是：

- **字母：** `a-z`
- **数字：** `0-9`
- **特殊键：** `escape`、`esc`、`enter`、`return`、`tab`、`space`、`backspace`、`delete`、`insert`、`clear`、`home`、`end`、`pageUp`、`pageDown`、`up`、`down`、`left`、`right`
- **功能键：** `f1`-`f12`
- **符号：** `` ` ``, `-`, `=`, `[`, `]`, `\`, `;`, `'`, `,`, `.`, `/`, `!`, `@`, `#`, `$`, `%`, `^`, `&`, `*`, `(`, `)`, `_`, `+`, `|`, `~`, `{`, `}`, `:`, `<`, `>`, `?`

修饰键组合：`ctrl+shift+x`、`alt+ctrl+x`、`ctrl+shift+alt+x`、`ctrl+1` 等。

## 所有操作

### TUI 编辑器光标移动

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `tui.editor.cursorUp` | `up` | 向上移动光标 |
| `tui.editor.cursorDown` | `down` | 向下移动光标 |
| `tui.editor.cursorLeft` | `left`, `ctrl+b` | 向左移动光标 |
| `tui.editor.cursorRight` | `right`, `ctrl+f` | 向右移动光标 |
| `tui.editor.cursorWordLeft` | `alt+left`, `ctrl+left`, `alt+b` | 向左移动一个单词 |
| `tui.editor.cursorWordRight` | `alt+right`, `ctrl+right`, `alt+f` | 向右移动一个单词 |
| `tui.editor.cursorLineStart` | `home`, `ctrl+a` | 移动到行首 |
| `tui.editor.cursorLineEnd` | `end`, `ctrl+e` | 移动到行尾 |
| `tui.editor.jumpForward` | `ctrl+]` | 向前跳转到字符 |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | 向后跳转到字符 |
| `tui.editor.pageUp` | `pageUp` | 向上翻页 |
| `tui.editor.pageDown` | `pageDown` | 向下翻页 |

### TUI 编辑器删除

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `tui.editor.deleteCharBackward` | `backspace` | 向后删除字符 |
| `tui.editor.deleteCharForward` | `delete`, `ctrl+d` | 向前删除字符 |
| `tui.editor.deleteWordBackward` | `ctrl+w`, `alt+backspace` | 向后删除单词 |
| `tui.editor.deleteWordForward` | `alt+d`, `alt+delete` | 向前删除单词 |
| `tui.editor.deleteToLineStart` | `ctrl+u` | 删除到行首 |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | 删除到行尾 |

### TUI 输入

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `tui.input.newLine` | `shift+enter` | 插入新行 |
| `tui.input.submit` | `enter` | 提交输入 |
| `tui.input.tab` | `tab` | 制表 / 自动补全 |

### TUI 删除环

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `tui.editor.yank` | `ctrl+y` | 粘贴最近删除的文本 |
| `tui.editor.yankPop` | `alt+y` | 在粘贴后循环浏览已删除的文本 |
| `tui.editor.undo` | `ctrl+-` | 撤销上次编辑 |

### TUI 剪贴板和选择

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `tui.input.copy` | `ctrl+c` | 复制选择 |
| `tui.select.up` | `up` | 向上移动选择 |
| `tui.select.down` | `down` | 向下移动选择 |
| `tui.select.pageUp` | `pageUp` | 在列表中向上翻页 |
| `tui.select.pageDown` | `pageDown` | 在列表中向下翻页 |
| `tui.select.confirm` | `enter` | 确认选择 |
| `tui.select.cancel` | `escape`, `ctrl+c` | 取消选择 |

### 应用程序

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.interrupt` | `escape` | 取消 / 中止 |
| `app.clear` | `ctrl+c` | 清空编辑器 |
| `app.exit` | `ctrl+d` | 退出（当编辑器为空时） |
| `app.suspend` | `ctrl+z` (Windows 上无) | 挂起到后台 |
| `app.editor.external` | `ctrl+g` | 在外部编辑器中打开（`$VISUAL` 或 `$EDITOR`） |
| `app.clipboard.pasteImage` | `ctrl+v`（Windows 上为 `alt+v`） | 从剪贴板粘贴图片 |

### 会话

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.session.new` | *(none)* | 启动新会话（`/new`） |
| `app.session.tree` | *(none)* | 打开会话树导航器（`/tree`） |
| `app.session.fork` | *(none)* | 分叉当前会话（`/fork`） |
| `app.session.resume` | *(none)* | 打开会话恢复选择器（`/resume`） |
| `app.session.togglePath` | `ctrl+p` | 切换路径显示 |
| `app.session.toggleSort` | `ctrl+s` | 切换排序模式 |
| `app.session.toggleNamedFilter` | `ctrl+n` | 切换仅命名过滤器 |
| `app.session.rename` | `ctrl+r` | 重命名会话 |
| `app.session.delete` | `ctrl+d` | 删除会话 |
| `app.session.deleteNoninvasive` | `ctrl+backspace` | 当查询为空时删除会话 |

### 模型与思考

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.model.select` | `ctrl+l` | 打开模型选择器 |
| `app.model.cycleForward` | `ctrl+p` | 切换到下一个模型 |
| `app.model.cycleBackward` | `shift+ctrl+p` | 切换到上一个模型 |
| `app.thinking.cycle` | `shift+tab` | 切换思考级别 |
| `app.thinking.toggle` | `ctrl+t` | 折叠或展开思考块 |

### 显示与消息队列

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.tools.expand` | `ctrl+o` | 折叠或展开工具输出 |
| `app.message.followUp` | `alt+enter` | 将后续消息加入队列 |
| `app.message.dequeue` | `alt+up` | 将队列中的消息恢复到编辑器 |

### 树导航

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.tree.foldOrUp` | `ctrl+left`, `alt+left` | 折叠当前分支段，或跳转到前一个段的开始 |
| `app.tree.unfoldOrDown` | `ctrl+right`, `alt+right` | 展开当前分支段，或跳转到下一个段的开始或分支末尾 |
| `app.tree.editLabel` | `shift+l` | 编辑所选树节点的标签 |
| `app.tree.toggleLabelTimestamp` | `shift+t` | 切换树中的标签时间戳 |
| `app.tree.filter.default` | `ctrl+d` | 将树过滤器设置为默认视图 |
| `app.tree.filter.noTools` | `ctrl+t` | 切换隐藏工具结果的树过滤器 |
| `app.tree.filter.userOnly` | `ctrl+u` | 切换仅显示用户消息的树过滤器 |
| `app.tree.filter.labeledOnly` | `ctrl+l` | 切换仅显示已标记条目的树过滤器 |
| `app.tree.filter.all` | `ctrl+a` | 切换显示所有条目的树过滤器 |
| `app.tree.filter.cycleForward` | `ctrl+o` | 向前循环树过滤器 |
| `app.tree.filter.cycleBackward` | `shift+ctrl+o` | 向后循环树过滤器 |

### 作用域模型选择器

在作用域模型选择器内部使用（通过 `/scoped-models` 打开）。

| Keybinding id | Default | Description |
|--------|---------|-------------|
| `app.models.save` | `ctrl+s` | 将当前模型选择保存到设置 |
| `app.models.enableAll` | `ctrl+a` | 启用所有模型（或所有匹配当前搜索的模型） |
| `app.models.clearAll` | `ctrl+x` | 清除所有模型（或所有匹配当前搜索的模型） |
| `app.models.toggleProvider` | `ctrl+p` | 切换当前提供商的所有模型 |
| `app.models.reorderUp` | `alt+up` | 将所选模型在循环顺序中上移 |
| `app.models.reorderDown` | `alt+down` | 将所选模型在循环顺序中下移 |

## 自定义配置

创建 `~/.pi/agent/keybindings.json`：

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.deleteWordBackward": ["ctrl+w", "alt+backspace"]
}
```

每个操作可以绑定单个键或键数组。用户配置会覆盖默认设置。

在原生 Windows 上，`app.suspend` 没有默认绑定，因为 Windows 终端不支持 Unix 作业控制。如果手动绑定它，pi 会显示状态消息而不是挂起。在 WSL 中，正常的 Linux `ctrl+z`/`fg` 行为仍然适用。

### Emacs 示例

```json
{
  "tui.editor.cursorUp": ["up", "ctrl+p"],
  "tui.editor.cursorDown": ["down", "ctrl+n"],
  "tui.editor.cursorLeft": ["left", "ctrl+b"],
  "tui.editor.cursorRight": ["right", "ctrl+f"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+f"],
  "tui.editor.deleteCharForward": ["delete", "ctrl+d"],
  "tui.editor.deleteCharBackward": ["backspace", "ctrl+h"],
  "tui.input.newLine": ["shift+enter", "ctrl+j"]
}
```

### Vim 示例

```json
{
  "tui.editor.cursorUp": ["up", "alt+k"],
  "tui.editor.cursorDown": ["down", "alt+j"],
  "tui.editor.cursorLeft": ["left", "alt+h"],
  "tui.editor.cursorRight": ["right", "alt+l"],
  "tui.editor.cursorWordLeft": ["alt+left", "alt+b"],
  "tui.editor.cursorWordRight": ["alt+right", "alt+w"]
}
```
