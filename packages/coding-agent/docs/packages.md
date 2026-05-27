> pi 可以帮助你创建 pi 包。你可以用它来打包你的扩展、技能、提示模板或主题。

# Pi 包

Pi 包可以将扩展、技能、提示模板和主题打包，以便通过 npm 或 git 分享。包可以在 `package.json` 的 `pi` 键下声明资源，或使用约定目录。

## 目录

- [安装和管理](#安装和管理)
- [包来源](#包来源)
- [创建 Pi 包](#创建-pi-包)
- [包结构](#包结构)
- [依赖](#依赖)
- [包过滤](#包过滤)
- [启用和禁用资源](#启用和禁用资源)
- [作用域与去重](#作用域与去重)

## 安装和管理

> **安全：** Pi 包以完全系统权限运行。扩展会执行任意代码，技能可以指示模型执行任何操作，包括运行可执行文件。在安装第三方包之前，请审查源代码。

```bash
pi install npm:@foo/bar@1.0.0
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo  # 原始 URL 也可用
pi install /absolute/path/to/package
pi install ./relative/path/to/package

pi remove npm:@foo/bar
pi list                     # 显示设置中已安装的包
pi update                   # 更新 pi、更新包，并协调固定 git 引用
pi update --extensions      # 仅更新包并协调固定 git 引用
pi update --self            # 仅更新 pi
pi update --self --force    # 即使当前版本已安装也重新安装 pi
pi update npm:@foo/bar      # 更新单个包
pi update --extension npm:@foo/bar
```

这些命令管理 pi 包，而非 pi CLI 本身。要卸载 pi 自身，请参阅[快速入门](quickstart.md#卸载)。

默认情况下，`install` 和 `remove` 写入用户设置（`~/.pi/agent/settings.json`）。使用 `-l` 可改为写入项目设置（`.pi/settings.json`）。项目设置可以与团队共享，pi 会在启动时自动安装任何缺失的包。

若要试用包而不安装，可使用 `--extension` 或 `-e`。这会安装到临时目录，仅限本次运行：

```bash
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

## 包来源

Pi 接受设置和 `pi install` 中的三种来源类型。

### npm

```
npm:@scope/pkg@1.2.3
npm:pkg
```

- 指定版本的包会被固定，包更新（`pi update`、`pi update --extensions`）时跳过。
- 用户安装位置：`~/.pi/agent/npm/`。
- 项目安装位置：`.pi/npm/`。
- 在 `settings.json` 中设置 `npmCommand`，可将 npm 包查找和安装操作固定到特定的包装命令，例如 `mise` 或 `asdf`。

示例：

```json
{
  "npmCommand": ["mise", "exec", "node@20", "--", "npm"]
}
```

### git

```
git:github.com/user/repo@v1
git:git@github.com:user/repo@v1
https://github.com/user/repo@v1
ssh://git@github.com/user/repo@v1
```

- 没有 `git:` 前缀时，仅接受协议 URL（`https://`、`http://`、`ssh://`、`git://`）。
- 有 `git:` 前缀时，接受简写格式，包括 `github.com/user/repo` 和 `git@github.com:user/repo`。
- HTTPS 和 SSH URL 均支持。
- SSH URL 自动使用你配置的 SSH 密钥（遵循 `~/.ssh/config`）。
- 对于非交互式运行（例如 CI），你可以设置 `GIT_TERMINAL_PROMPT=0` 禁用凭据提示，并设置 `GIT_SSH_COMMAND`（例如 `ssh -o BatchMode=yes -o ConnectTimeout=5`）快速失败。
- 引用是固定的标签或提交。`pi update` 和 `pi update --extensions` 不会将其移动到新引用，但会协调现有克隆到配置的引用。
- 使用 `pi install git:host/user/repo@new-ref` 更新设置并将现有包移动到新的固定引用。
- 克隆到 `~/.pi/agent/git/<host>/<path>`（全局）或 `.pi/git/<host>/<path>`（项目）。
- 当协调导致检出变更时，pi 会重置并清理克隆，如果存在 `package.json`，则运行 `npm install`。

**SSH 示例：**
```bash
# git@host:path 简写格式（需要 git: 前缀）
pi install git:git@github.com:user/repo

# ssh:// 协议格式
pi install ssh://git@github.com/user/repo

# 带有版本引用
pi install git:git@github.com:user/repo@v1.0.0
```

### 本地路径

```
/absolute/path/to/package
./relative/path/to/package
```

本地路径指向磁盘上的文件或目录，并添加到设置中而不复制。相对路径相对于它们所在的设置文件进行解析。如果路径是文件，则作为单个扩展加载。如果是目录，则 pi 使用包规则加载资源。

## 创建 Pi 包

在 `package.json` 中添加 `pi` 清单，或使用约定目录。包含 `pi-package` 关键字以便于发现。

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

路径相对于包根目录。数组支持 glob 模式和 `!排除项`。

### 画廊元数据

[包画廊](https://pi.dev/packages) 会显示标记有 `pi-package` 的包。添加 `video` 或 `image` 字段以显示预览：

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "video": "https://example.com/demo.mp4",
    "image": "https://example.com/screenshot.png"
  }
}
```

- **video**：仅 MP4。桌面端在悬停时自动播放。点击打开全屏播放器。
- **image**：PNG、JPEG、GIF 或 WebP。显示为静态预览。

如果两者都设置，视频优先。

## 包结构

### 约定目录

如果没有 `pi` 清单，pi 会自动从以下目录发现资源：

- `extensions/` 加载 `.ts` 和 `.js` 文件
- `skills/` 递归查找 `SKILL.md` 文件夹，并加载顶层 `.md` 文件作为技能
- `prompts/` 加载 `.md` 文件
- `themes/` 加载 `.json` 文件

## 依赖

第三方运行时依赖应放在 `package.json` 的 `dependencies` 中。那些没有注册扩展、技能、提示模板或主题的依赖也放在 `dependencies` 中。当 pi 从 npm 或 git 安装包时，会运行 `npm install`，因此这些依赖会自动安装。

Pi 为扩展和技能提供了核心包。如果你导入了其中任何一个，请在 `peerDependencies` 中以 `"*"` 范围列出它们，并且不要打包它们：`@earendil-works/pi-ai`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`、`typebox`。

其他 pi 包必须打包在你的 tarball 中。将它们添加到 `dependencies` 和 `bundledDependencies`，然后通过 `node_modules/` 路径引用它们的资源。Pi 使用独立的模块根目录加载包，因此独立的安装不会冲突或共享模块。

示例：

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": ["extensions", "node_modules/shitty-extensions/extensions"],
    "skills": ["skills", "node_modules/shitty-extensions/skills"]
  }
}
```

## 包过滤

使用设置中的对象形式来过滤包加载的内容：

```json
{
  "packages": [
    "npm:simple-pkg",
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"],
      "themes": ["+themes/legacy.json"]
    }
  ]
}
```

`+path` 和 `-path` 是相对于包根目录的精确路径。

- 省略某个键表示加载该类型的所有内容。
- 使用 `[]` 表示不加载该类型的任何内容。
- `!pattern` 排除匹配项。
- `+path` 强制包含一个精确路径。
- `-path` 强制排除一个精确路径。
- 过滤在清单之上叠加。它们进一步缩小已允许的范围。

## 启用和禁用资源

使用 `pi config` 启用或禁用来自已安装包和本地目录的扩展、技能、提示模板和主题。适用于全局（`~/.pi/agent`）和项目（`.pi/`）作用域。

## 作用域与去重

包可以同时出现在全局和项目设置中。如果同一个包出现在两者中，项目条目优先。身份由以下方式确定：

- npm：包名
- git：不带引用的仓库 URL
- local：解析后的绝对路径
