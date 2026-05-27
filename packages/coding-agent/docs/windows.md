# Windows 设置

Pi 需要在 Windows 上拥有一个 bash 环境。已检查的位置（按顺序）：

1. 来自 `~/.pi/agent/settings.json` 的自定义路径
2. Git Bash（`C:\Program Files\Git\bin\bash.exe`）
3. PATH 中的 `bash.exe`（Cygwin、MSYS2、WSL）

对大多数用户而言，[Git for Windows](https://git-scm.com/download/win) 已经足够。

## 自定义 Shell 路径

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```
