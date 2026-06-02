# 开发

参见 [AGENTS.md](../../../AGENTS.md) 获取额外指南。

## 设置

```bash
git clone https://github.com/earendil-works/pi-mono
cd pi-mono
npm install
npm run build
```

从源码运行：

```bash
/path/to/pi-mono/pi-test.sh
```

该脚本可从任意目录运行。Pi 会保留调用者的当前工作目录。

## 分支 / 重命名

通过 `package.json` 进行配置：

```json
{
  "piConfig": {
    "name": "pi",
    "configDir": ".pi"
  }
}
```

为其分支更改 `name`、`configDir` 和 `bin` 字段。会影响 CLI 横幅、配置路径和环境变量名称。

## 路径解析

三种执行模式：npm 安装、独立二进制文件、通过 tsx 从源码运行。

**始终使用 `src/config.ts`** 来引用包资源：

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

切勿直接使用 `__dirname` 引用包资源。

## 调试命令

`/debug`（隐藏）写入 `~/.pi/agent/pi-debug.log`：
- 渲染的 TUI 行（含 ANSI 转义码）
- 发送给 LLM 的最后消息

## 测试

```bash
./test.sh                         # 运行非 LLM 测试（无需 API 密钥）
npm test                          # 运行所有测试
npm test -- test/specific.test.ts # 运行特定测试
```

## 项目结构

```
packages/
  ai/           # LLM 提供者抽象层
  agent/        # Agent 循环和消息类型
  tui/          # 终端 UI 组件
  coding-agent/ # CLI 和交互模式
```
