# Termux (Android) 设置

Pi 通过 [Termux](https://termux.dev/) 在 Android 上运行，Termux 是一个适用于 Android 的终端模拟器和 Linux 环境。

## 前提条件

1. 从 GitHub 或 F-Droid 安装 [Termux](https://github.com/termux/termux-app#installation)（不要从 Google Play 安装，该版本已弃用）
2. 从 GitHub 或 F-Droid 安装 [Termux:API](https://github.com/termux/termux-api#installation)，用于剪贴板和其他设备集成

## 安装

```bash
# 更新软件包
pkg update && pkg upgrade

# 安装依赖
pkg install nodejs termux-api git

# 安装 Pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 创建配置目录
mkdir -p ~/.pi/agent

# 运行 Pi
pi
```

## 剪贴板支持

在 Termux 中运行时，剪贴板操作使用 `termux-clipboard-set` 和 `termux-clipboard-get`。需要安装 Termux:API 应用才能使用。

Termux 不支持图像剪贴板（`ctrl+v` 图像粘贴功能将无法使用）。

## 针对 Termux 的 AGENTS.md 示例

创建 `~/.pi/agent/AGENTS.md`，帮助代理理解 Termux 环境：

````markdown
# 代理环境：Android 上的 Termux

## 位置
- **操作系统**：Android（Termux 终端模拟器）
- **家目录**：`/data/data/com.termux/files/home`
- **前缀目录**：`/data/data/com.termux/files/usr`
- **共享存储**：`/storage/emulated/0`（Downloads、Documents 等）

## 打开 URL
```bash
termux-open-url "https://example.com"
```

## 打开文件
```bash
termux-open file.pdf          # 使用默认应用打开
termux-open --chooser image.jpg      # 选择应用打开
```

## 剪贴板
```bash
termux-clipboard-set "文本"   # 复制
termux-clipboard-get          # 粘贴
```

## 通知
```bash
termux-notification -t "标题" -c "内容"
```

## 设备信息
```bash
termux-battery-status         # 电池信息
termux-wifi-connectioninfo    # WiFi 信息
termux-telephony-deviceinfo   # 设备信息
```

## 分享
```bash
termux-share -a send file.txt # 分享文件
```

## 其他有用的命令
```bash
termux-toast "消息"           # 快速 Toast 弹窗
termux-vibrate                # 设备震动
termux-tts-speak "你好"       # 文字转语音
termux-camera-photo out.jpg   # 拍照
```

## 注意事项
- 必须安装 Termux:API 应用才能使用 `termux-*` 命令
- 使用 `pkg install termux-api` 安装命令行工具
- 需要存储权限才能访问 `/storage/emulated/0`
````

## 限制

- **无图像剪贴板**：Termux 剪贴板 API 仅支持文本
- **无原生二进制文件**：某些可选的本地依赖项（如剪贴板模块）在 Android ARM64 上不可用，安装时会跳过
- **存储访问**：要访问 `/storage/emulated/0`（Downloads 等）中的文件，请运行 `termux-setup-storage` 一次以授予权限

## 故障排除

### 剪贴板不工作

确保已安装两个应用：
1. Termux（来自 GitHub 或 F-Droid）
2. Termux:API（来自 GitHub 或 F-Droid）

然后安装 CLI 工具：
```bash
pkg install termux-api
```

### 共享存储权限被拒绝

运行一次以授予存储权限：
```bash
termux-setup-storage
```

### Node.js 安装问题

如果 npm 失败，请尝试清除缓存：
```bash
npm cache clean --force
```
