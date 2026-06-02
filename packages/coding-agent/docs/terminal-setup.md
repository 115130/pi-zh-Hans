# 终端设置

Pi 使用 [Kitty 键盘协议](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) 实现可靠的修饰键检测。大多数现代终端支持该协议，但有些需要配置。

## Kitty, iTerm2

开箱即用。

## Apple Terminal

Pi 会在可用时启用增强按键报告。如果 Terminal.app 仍为 `Shift+Enter` 发送普通回车，Pi 会使用本地 macOS 修饰键后备方案，将该回车视为 `Shift+Enter`。

此后备方案仅在 Pi 与 Terminal.app 运行于同一台 Mac 上时生效。无法通过远程 SSH 检测本地键盘。

## Apple Terminal

Pi enables enhanced key reporting when available. If Terminal.app still sends plain Return for `Shift+Enter`, pi uses a local macOS modifier fallback to treat that Return as `Shift+Enter`.

This fallback only works when pi runs on the same Mac as Terminal.app. It cannot detect the local keyboard over remote SSH.

## Ghostty

添加到你的 Ghostty 配置中（macOS 上为 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 上为 `~/.config/ghostty/config`）：

```
keybind = alt+backspace=text:\x1b\x7f
```

较旧的 Claude Code 版本可能添加了此 Ghostty 映射：

```
keybind = shift+enter=text:\n
```

该映射发送原始换行字节。在 Pi 中，这与 `Ctrl+J` 无法区分，因此 tmux 和 Pi 不再看到真正的 `shift+enter` 按键事件。

如果你添加该映射的唯一原因是 Claude Code 2.x 或更新版本，则可以移除它，除非你想在 tmux 中使用 Claude Code，因为 tmux 仍需要该 Ghostty 映射。

如果你希望通过该重映射使 `Shift+Enter` 在 tmux 中继续生效，请在 `~/.pi/agent/keybindings.json` 中为 Pi 的 `newLine` 按键绑定添加 `ctrl+j`：

```json
{
  "newLine": ["shift+enter", "ctrl+j"]
}
```

## WezTerm

创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

## VS Code（集成终端）

`keybindings.json` 位置：
- macOS：`~/Library/Application Support/Code/User/keybindings.json`
- Linux：`~/.config/Code/User/keybindings.json`
- Windows：`%APPDATA%\\Code\\User\\keybindings.json`

添加到 `keybindings.json` 以启用 `Shift+Enter` 进行多行输入：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

## Windows Terminal

添加到 `settings.json` 中（使用 Ctrl+Shift+, 或通过设置 → 打开 JSON 文件）以转发 Pi 使用的修改后 Enter 键：

```json
{
  "actions": [
    {
      "command": { "action": "sendInput", "input": "\u001b[13;2u" },
      "keys": "shift+enter"
    },
    {
      "command": { "action": "sendInput", "input": "\u001b[13;3u" },
      "keys": "alt+enter"
    }
  ]
}
```

- `Shift+Enter` 插入新行。
- Windows Terminal 默认将 `Alt+Enter` 绑定为全屏。这会阻止 Pi 接收用于后续排队的 `Alt+Enter`。
- 将 `Alt+Enter` 重映射为 `sendInput` 可以将真实的按键组合转发给 Pi。

如果你已有 `actions` 数组，请将对象添加到其中。如果旧的全屏行为仍然存在，请完全关闭并重新打开 Windows Terminal。

## xfce4-terminal, terminator

这些终端对转义序列支持有限。像 `Ctrl+Enter` 和 `Shift+Enter` 这样的修改后 Enter 键无法与普通 `Enter` 区分，导致诸如 `submit: ["ctrl+enter"]` 的自定义按键绑定无法生效。

为获得最佳体验，请使用支持 Kitty 键盘协议的终端：
- [Kitty](https://sw.kovidgoyal.net/kitty/)
- [Ghostty](https://ghostty.org/)
- [WezTerm](https://wezfurlong.org/wezterm/)
- [iTerm2](https://iterm2.com/)
- [Alacritty](https://github.com/alacritty/alacritty)（需要编译时启用 Kitty 协议支持）

## IntelliJ IDEA（集成终端）

内置终端对转义序列支持有限。Shift+Enter 无法与 Enter 在 IntelliJ 终端中区分。

如果你希望显示硬件光标，请在运行 pi 之前设置 `PI_HARDWARE_CURSOR=1`（默认禁用以便兼容）。

考虑使用专用终端模拟器以获得最佳体验。
