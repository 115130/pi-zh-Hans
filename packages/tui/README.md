# @earendil-works/pi-tui

采用差分渲染和同步输出的极简终端 UI 框架，实现无闪烁的交互式 CLI 应用。

## 特性

- **差分渲染**：三策略渲染系统，只更新变化的部分
- **同步输出**：使用 CSI 2026 实现原子化屏幕更新（无闪烁）
- **括号粘贴模式**：正确处理大段粘贴，超过 10 行的粘贴使用标记
- **基于组件**：通过简明的 Component 接口和 render() 方法
- **主题支持**：组件接受主题接口，可自定义样式
- **内置组件**：Text、TruncatedText、Input、Editor、Markdown、Loader、SelectList、SettingsList、Spacer、Image、Box、Container
- **内联图片**：在支持 Kitty 或 iTerm2 图形协议的终端中渲染图片
- **自动完成**：文件路径和斜杠命令

## 快速开始

```typescript
import { TUI, Text, Editor, ProcessTerminal, matchesKey } from "@earendil-works/pi-tui";

// 创建终端
const terminal = new ProcessTerminal();

// 创建 TUI
const tui = new TUI(terminal);

// 添加组件
tui.addChild(new Text("欢迎使用我的应用！"));

import { defaultEditorTheme as editorTheme } from './test/test-themes.ts';
const editor = new Editor(tui, editorTheme);
editor.onSubmit = (text) => {
  console.log("已提交:", text);
  tui.addChild(new Text(`你说: ${text}`));
};
tui.addChild(editor);

// 聚焦编辑器以接收键盘输入
tui.setFocus(editor);

// 在原始模式下 Ctrl+C 不会发送 SIGINT —— 在这里拦截以支持退出
tui.addInputListener((data) => {
  if (matchesKey(data, 'ctrl+c')) {
    tui.stop();
    process.exit(0);
  }
});

// 启动
tui.start();
```

## 核心 API

### TUI

管理组件和渲染的主容器。

```typescript
const tui = new TUI(terminal);
tui.addChild(component);
tui.removeChild(component);
tui.start();
tui.stop();
tui.requestRender(); // 请求重新渲染

// 全局调试键处理（Shift+Ctrl+D）
tui.onDebug = () => console.log("调试触发");
```

### 覆盖层

覆盖层在现有内容之上渲染组件，而不替换现有内容。适用于对话框、菜单和模态 UI。

```typescript
// 使用默认选项显示覆盖层（居中，最大 80 列）
const handle = tui.showOverlay(component);

// 自定义定位和大小的覆盖层
// 值可以是数字（绝对）或百分比字符串（例如 "50%"）
const handle = tui.showOverlay(component, {
  // 尺寸
  width: 60,              // 固定列宽
  width: "80%",           // 终端宽度的百分比
  minWidth: 40,           // 最小宽度下限
  maxHeight: 20,          // 最大行高
  maxHeight: "50%",       // 终端高度的百分比

  // 锚点定位（默认：'center'）
  anchor: 'bottom-right', // 相对锚点的位置
  offsetX: 2,             // 锚点的水平偏移
  offsetY: -1,            // 锚点的垂直偏移

  // 百分比定位（锚点的替代方案）
  row: "25%",             // 垂直位置（0%=顶部，100%=底部）
  col: "50%",             // 水平位置（0%=左侧，100%=右侧）

  // 绝对定位（覆盖锚点/百分比）
  row: 5,                 // 精确行位置
  col: 10,                // 精确列位置

  // 距终端边缘的边距
  margin: 2,              // 所有边
  margin: { top: 1, right: 2, bottom: 1, left: 2 },

  // 响应式可见性
  visible: (termWidth, termHeight) => termWidth >= 100  // 在窄终端上隐藏

  // 焦点行为
  nonCapturing: true       // 显示时不自动聚焦
});

// OverlayHandle 方法
handle.hide();              // 永久移除覆盖层
handle.setHidden(true);     // 临时隐藏（可再次显示）
handle.setHidden(false);    // 隐藏后再次显示
handle.isHidden();          // 检查是否临时隐藏
handle.focus();             // 聚焦并前置到视觉顶层
handle.unfocus();           // 释放焦点到之前的目标
handle.isFocused();         // 检查覆盖层是否获得焦点

// 隐藏最顶层的覆盖层
tui.hideOverlay();

// 检查是否有可见的覆盖层
tui.hasOverlay();
```

**锚点值**：`'center'`、`'top-left'`、`'top-right'`、`'bottom-left'`、`'bottom-right'`、`'top-center'`、`'bottom-center'`、`'left-center'`、`'right-center'`

**解析顺序**：
1. `minWidth` 在宽度计算后作为下限
2. 定位优先级：绝对 `row`/`col` > 百分比 `row`/`col` > `anchor`
3. `margin` 将最终位置限制在终端边界内
4. `visible` 回调控制覆盖层是否渲染（每帧调用）

### 组件接口

所有组件实现：

```typescript
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  invalidate?(): void;
}
```

| 方法 | 说明 |
|--------|------|
| `render(width)` | 返回字符串数组，每行一个。每行**不能超过 `width`**，否则 TUI 会报错。使用 `truncateToWidth()` 或手动换行确保行宽合规。 |
| `handleInput?(data)` | 当组件获得焦点并收到键盘输入时调用。`data` 字符串包含原始终端输入（可能包含 ANSI 转义序列）。 |
| `invalidate?()` | 调用以清除任何缓存的渲染状态。组件应在下一次 `render()` 调用时从头重新渲染。 |

TUI 会在每行渲染内容的末尾追加完整的 SGR 重置和 OSC 8 重置。样式不会跨行延续。如果你要渲染带样式的多行文本，需要每行重新应用样式，或使用 `wrapTextWithAnsi()` 以便每行都能保留样式。

### Focusable 接口（IME 支持）

需要显示文本光标并支持 IME（输入法）的组件应实现 `Focusable` 接口：

```typescript
import { CURSOR_MARKER, type Component, type Focusable } from "@earendil-works/pi-tui";

class MyInput implements Component, Focusable {
  focused: boolean = false;  // 由 TUI 在焦点变化时设置

  render(width: number): string[] {
    const marker = this.focused ? CURSOR_MARKER : "";
    // 在假光标前发出标记
    return [`> ${beforeCursor}${marker}\x1b[7m${atCursor}\x1b[27m${afterCursor}`];
  }
}
```

当 `Focusable` 组件获得焦点时，TUI 会：
1. 在组件上设置 `focused = true`
2. 在渲染输出中扫描 `CURSOR_MARKER`（一个零宽度的 APC 转义序列）
3. 将硬件终端光标定位到该位置
4. 显示硬件光标

这使得 IME 候选窗口能够在正确的位置显示，对中文、日文、韩文等输入法至关重要。`Editor` 和 `Input` 内置组件已实现此接口。

**包含内嵌输入的容器组件：** 当容器组件（对话框、选择器 etc.）包含 `Input` 或 `Editor` 子组件时，容器必须实现 `Focusable` 并将焦点状态传播给子组件：

```typescript
import { Container, type Focusable, Input } from "@earendil-works/pi-tui";

class SearchDialog extends Container implements Focusable {
  private searchInput: Input;

  // 将焦点传播到子输入组件以实现 IME 光标定位
  private _focused = false;
  get focused(): boolean { return this._focused; }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  constructor() {
    super();
    this.searchInput = new Input();
    this.addChild(this.searchInput);
  }
}
```

如果不传播焦点，使用 IME（中文、日文、韩文 etc.）输入时，候选窗口会出现在错误的位置。

## 内置组件

### Container

分组子组件的容器。

```typescript
const container = new Container();
container.addChild(component);
container.removeChild(component);
```

### Box

为所有子组件应用内边距和背景色的容器。

```typescript
const box = new Box(
  1,                              // paddingX（默认：1）
  1,                              // paddingY（默认：1）
  (text) => chalk.bgGray(text)   // 可选的背景函数
);
box.addChild(new Text("内容"));
box.setBgFn((text) => chalk.bgBlue(text));  // 动态更改背景
```

### Text

显示多行文本，支持自动换行和内边距。

```typescript
const text = new Text(
  "你好世界",                       // 文本内容
  1,                              // paddingX（默认：1）
  1,                              // paddingY（默认：1）
  (text) => chalk.bgGray(text)   // 可选的背景函数
);
text.setText("已更新文本");
text.setCustomBgFn((text) => chalk.bgBlue(text));
```

### TruncatedText

单行文本，超出视口宽度时自动截断。适用于状态行和标题。

```typescript
const truncated = new TruncatedText(
  "这是一行很长的文本，会被截断...",
  0,  // paddingX（默认：0）
  0   // paddingY（默认：0）
);
```

### Input

支持水平滚动的单行文本输入框。

```typescript
const input = new Input();
input.onSubmit = (value) => console.log(value);
input.setValue("初始值");
input.getValue();
```

**按键绑定：**
- `Enter` — 提交
- `Ctrl+A` / `Ctrl+E` — 行首/行尾
- `Ctrl+W` 或 `Alt+Backspace` — 向后删除单词
- `Ctrl+U` — 删除到行首
- `Ctrl+K` — 删除到行尾
- `Ctrl+Left` / `Ctrl+Right` — 单词导航
- `Alt+Left` / `Alt+Right` — 单词导航
- 方向键、Backspace、Delete 按预期工作

### Editor

多行文本编辑器，支持自动完成、文件补全、粘贴处理，以及内容超出终端高度时的垂直滚动。

```typescript
interface EditorTheme {
  borderColor: (str: string) => string;
  selectList: SelectListTheme;
}

interface EditorOptions {
  paddingX?: number;  // 水平内边距（默认：0）
}

const editor = new Editor(tui, theme, options?);  // tui 为高度感知滚动所必需
editor.onSubmit = (text) => console.log(text);
editor.onChange = (text) => console.log("已更改:", text);
editor.disableSubmit = true; // 临时禁用提交
editor.setAutocompleteProvider(provider);
editor.borderColor = (s) => chalk.blue(s); // 动态更改边框
editor.setPaddingX(1); // 动态更新水平内边距
editor.getPaddingX();  // 获取当前内边距
```

**特性：**
- 多行编辑，自动换行
- 斜杠命令自动完成（输入 `/`）
- 文件路径自动完成（按 `Tab`）
- 大段粘贴处理（超过 10 行创建 `[paste #1 +50 lines]` 标记）
- 编辑器上方和下方的水平线
- 假光标渲染（隐藏真实光标）

**按键绑定：**
- `Enter` — 提交
- `Shift+Enter`、`Ctrl+Enter` 或 `Alt+Enter` — 换行（取决于终端，Alt+Enter 最可靠）
- `Tab` — 自动完成
- `Ctrl+K` — 删除到行尾
- `Ctrl+U` — 删除到行首
- `Ctrl+W` 或 `Alt+Backspace` — 向后删除单词
- `Alt+D` 或 `Alt+Delete` — 向前删除单词
- `Ctrl+A` / `Ctrl+E` — 行首/行尾
- `Ctrl+]` — 向前跳转到字符（等待下一个按键，然后将光标移到第一个出现位置）
- `Ctrl+Alt+]` — 向后跳转到字符
- 方向键、Backspace、Delete 按预期工作

### Markdown

渲染 Markdown，支持语法高亮和主题。

```typescript
interface MarkdownTheme {
  heading: (text: string) => string;
  link: (text: string) => string;
  linkUrl: (text: string) => string;
  code: (text: string) => string;
  codeBlock: (text: string) => string;
  codeBlockBorder: (text: string) => string;
  quote: (text: string) => string;
  quoteBorder: (text: string) => string;
  hr: (text: string) => string;
  listBullet: (text: string) => string;
  bold: (text: string) => string;
  italic: (text: string) => string;
  strikethrough: (text: string) => string;
  underline: (text: string) => string;
  highlightCode?: (code: string, lang?: string) => string[];
}

interface DefaultTextStyle {
  color?: (text: string) => string;
  bgColor?: (text: string) => string;
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

const md = new Markdown(
  "# 你好\n\n一些**加粗**文本",
  1,              // paddingX
  1,              // paddingY
  theme,          // MarkdownTheme
  defaultStyle    // 可选的 DefaultTextStyle
);
md.setText("已更新的 markdown");
```

**特性：**
- 标题、加粗、斜体、代码块、列表、链接、引用
- HTML 标签作为纯文本渲染
- 通过 `highlightCode` 可选语法高亮
- 支持内边距
- 渲染缓存以提升性能

### Loader

动画加载旋转指示器。

```typescript
const loader = new Loader(
  tui,                              // 用于渲染更新的 TUI 实例
  (s) => chalk.cyan(s),            // 旋转器颜色函数
  (s) => chalk.gray(s),            // 消息颜色函数
  "加载中..."                        // 消息（默认："Loading..."）
);
loader.start();
loader.setMessage("仍在加载...");
loader.stop();
```

### CancellableLoader

扩展 Loader，支持 Escape 键处理和用于取消异步操作的 AbortSignal。

```typescript
const loader = new CancellableLoader(
  tui,                              // 用于渲染更新的 TUI 实例
  (s) => chalk.cyan(s),            // 旋转器颜色函数
  (s) => chalk.gray(s),            // 消息颜色函数
 "工作中..."                         // 消息
);
loader.onAbort = () => done(null); // 用户按 Escape 时调用
doAsyncWork(loader.signal).then(done);
```

**属性：**
- `signal: AbortSignal` — 用户按 Escape 时中止
- `aborted: boolean` — 加载器是否被中止
- `onAbort?: () => void` — 用户按 Escape 时的回调

### SelectList

支持键盘导航的交互式选择列表。

```typescript
interface SelectItem {
  value: string;
  label: string;
  description?: string;
}

interface SelectListTheme {
  selectedPrefix: (text: string) => string;
  selectedText: (text: string) => string;
  description: (text: string) => string;
  scrollInfo: (text: string) => string;
  noMatch: (text: string) => string;
}

const list = new SelectList(
  [
    { value: "opt1", label: "选项 1", description: "第一个选项" },
    { value: "opt2", label: "选项 2", description: "第二个选项" },
  ],
  5,      // maxVisible
  theme   // SelectListTheme
);

list.onSelect = (item) => console.log("已选择:", item);
list.onCancel = () => console.log("已取消");
list.onSelectionChange = (item) => console.log("已高亮:", item);
list.setFilter("opt"); // 筛选项目
```

**控制：**
- 方向键：导航
- Enter：选择
- Escape：取消

### SettingsList

支持值循环和子菜单的设置面板。

```typescript
interface SettingItem {
  id: string;
  label: string;
  description?: string;
  currentValue: string;
  values?: string[];  // 如果提供，Enter/Space 会循环值
  submenu?: (currentValue: string, done: (selectedValue?: string) => void) => Component;
}

interface SettingsListTheme {
  label: (text: string, selected: boolean) => string;
  value: (text: string, selected: boolean) => string;
  description: (text: string) => string;
  cursor: string;
  hint: (text: string) => string;
}

const settings = new SettingsList(
  [
    { id: "theme", label: "主题", currentValue: "dark", values: ["dark", "light"] },
    { id: "model", label: "模型", currentValue: "gpt-4", submenu: (val, done) => modelSelector },
  ],
  10,      // maxVisible
  theme,   // SettingsListTheme
  (id, newValue) => console.log(`${id} 改为 ${newValue}`),
  () => console.log("已取消")
);
settings.updateValue("theme", "light");
```

**控制：**
- 方向键：导航
- Enter/Space：激活（循环值或打开子菜单）
- Escape：取消

### Spacer

用于垂直间距的空行。

```typescript
const spacer = new Spacer(2); // 2 个空行（默认：1）
```

### Image

在支持 Kitty 图形协议（Kitty、Ghostty、WezTerm）或 iTerm2 内联图片的终端中渲染图片。在不支持的终端中回退到文本占位符。

```typescript
interface ImageTheme {
  fallbackColor: (str: string) => string;
}

interface ImageOptions {
  maxWidthCells?: number;
  maxHeightCells?: number;
  filename?: string;
}

const image = new Image(
  base64Data,       // base64 编码的图片数据
  "image/png",      // MIME 类型
  theme,            // ImageTheme
  options           // 可选的 ImageOptions
);
tui.addChild(image);
```

支持的格式：PNG、JPEG、GIF、WebP。尺寸从图片头部自动解析。

## 自动完成

### CombinedAutocompleteProvider

同时支持斜杠命令和文件路径。

```typescript
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";

const provider = new CombinedAutocompleteProvider(
  [
    { name: "help", description: "显示帮助" },
    { name: "clear", description: "清屏" },
    { name: "delete", description: "删除最后一条消息" },
  ],
  process.cwd() // 文件补全的基础路径
);

editor.setAutocompleteProvider(provider);
```

**特性：**
- 输入 `/` 查看斜杠命令
- 按 `Tab` 进行文件路径补全
- 支持 `~/`、`./`、`../` 和 `@` 前缀
- `@` 前缀筛选可附加的文件

## 按键检测

使用 `matchesKey()` 配合 `Key` 辅助函数来检测键盘输入（支持 Kitty 键盘协议）：

```typescript
import { matchesKey, Key } from "@earendil-works/pi-tui";

if (matchesKey(data, Key.ctrl("c"))) {
  process.exit(0);
}

if (matchesKey(data, Key.enter)) {
  submit();
} else if (matchesKey(data, Key.escape)) {
  cancel();
} else if (matchesKey(data, Key.up)) {
  moveUp();
}
```

**按键标识符**（使用 `Key.*` 获得自动完成，或直接使用字符串）：
- 基本键：`Key.enter`、`Key.escape`、`Key.tab`、`Key.space`、`Key.backspace`、`Key.delete`、`Key.home`、`Key.end`
- 方向键：`Key.up`、`Key.down`、`Key.left`、`Key.right`
- 带修饰键：`Key.ctrl("c")`、`Key.shift("tab")`、`Key.alt("left")`、`Key.ctrlShift("p")`
- 字符串格式也可用：`"enter"`、`"ctrl+c"`、`"shift+tab"`、`"ctrl+shift+p"`

## 差分渲染

TUI 使用三种渲染策略：

1. **首次渲染**：输出所有行，不清除滚动缓冲区
2. **宽度变化或视口上方变化**：清屏并完全重新渲染
3. **正常更新**：将光标移动到第一个变化行，清除到末尾，渲染变化的行

所有更新都包裹在**同步输出**（`\x1b[?2026h` ... `\x1b[?2026l`）中，实现原子化、无闪烁渲染。

## 终端接口

TUI 可以配合任何实现 `Terminal` 接口的对象使用：

```typescript
interface Terminal {
  start(onInput: (data: string) => void, onResize: () => void): void;
  stop(): void;
  write(data: string): void;
  get columns(): number;
  get rows(): number;
  moveBy(lines: number): void;
  hideCursor(): void;
  showCursor(): void;
  clearLine(): void;
  clearFromCursor(): void;
  clearScreen(): void;
}
```

**内置实现：**
- `ProcessTerminal` — 使用 `process.stdin/stdout`
- `VirtualTerminal` — 用于测试（使用 `@xterm/headless`）

## 工具函数

```typescript
import { visibleWidth, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

// 获取字符串的可见宽度（忽略 ANSI 代码）
const width = visibleWidth("\x1b[31m你好\x1b[0m"); // 2

// 截断字符串到指定宽度（保留 ANSI 代码，添加省略号）
const truncated = truncateToWidth("Hello World", 8); // "Hello..."

// 不添加省略号截断
const truncatedNoEllipsis = truncateToWidth("Hello World", 8, ""); // "Hello Wo"

// 将文本换行到指定宽度（跨行保留 ANSI 代码）
const lines = wrapTextWithAnsi("这是一行需要换行的长文本", 20);
// ["这是一行需要换行", "的长文本"]
```

## 创建自定义组件

创建自定义组件时，**`render()` 返回的每行都不能超过 `width` 参数**。如果任何一行超过终端宽度，TUI 会报错。

### 处理输入

使用 `matchesKey()` 配合 `Key` 辅助函数处理键盘输入：

```typescript
import { matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

class MyInteractiveComponent implements Component {
  private selectedIndex = 0;
  private items = ["选项 1", "选项 2", "选项 3"];

  public onSelect?: (index: number) => void;
  public onCancel?: () => void;

  handleInput(data: string): void {
    if (matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    } else if (matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
    } else if (matchesKey(data, Key.enter)) {
      this.onSelect?.(this.selectedIndex);
    } else if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    return this.items.map((item, i) => {
      const prefix = i === this.selectedIndex ? "> " : "  ";
      return truncateToWidth(prefix + item, width);
    });
  }
}
```

### 处理行宽

使用提供的工具函数确保行宽合适：

```typescript
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";

class MyComponent implements Component {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  render(width: number): string[] {
    // 方案 1：截断长行
    return [truncateToWidth(this.text, width)];

    // 方案 2：检查并填充到精确宽度
    const line = this.text;
    const visible = visibleWidth(line);
    if (visible > width) {
      return [truncateToWidth(line, width)];
    }
    // 填充到精确宽度（可选，用于背景色）
    return [line + " ".repeat(width - visible)];
  }
}
```

### ANSI 代码处理

`visibleWidth()` 和 `truncateToWidth()` 都能正确处理 ANSI 转义码：

- `visibleWidth()` 在计算宽度时忽略 ANSI 代码
- `truncateToWidth()` 保留 ANSI 代码并在截断时正确闭合它们

```typescript
import chalk from "chalk";

const styled = chalk.red("Hello") + " " + chalk.blue("World");
const width = visibleWidth(styled); // 11（不计算 ANSI 代码）
const truncated = truncateToWidth(styled, 8); // 红色 "Hello" + " W..." 带正确重置
```

### 缓存

为提升性能，组件应缓存渲染输出，仅在必要时重新渲染：

```typescript
class CachedComponent implements Component {
  private text: string;
  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines = [truncateToWidth(this.text, width)];

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
```

## 示例

参见 `test/chat-simple.ts` 获取完整的聊天界面示例，包含：
- 带自定义背景色的 Markdown 消息
- 响应时的加载旋转器
- 带自动完成和斜杠命令的编辑器
- 消息之间的间距

运行方式：
```bash
npx tsx test/chat-simple.ts
```

## 开发

```bash
# 安装依赖（在单体仓库根目录）
npm install

# 运行类型检查
npm run check

# 运行演示
npx tsx test/chat-simple.ts
```

### 调试日志

设置 `PI_TUI_WRITE_LOG` 来捕获写入标准输出的原始 ANSI 流。

```bash
PI_TUI_WRITE_LOG=/tmp/tui-ansi.log npx tsx test/chat-simple.ts
```