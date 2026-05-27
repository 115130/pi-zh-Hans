# 计划模式扩展

用于安全代码分析的只读探索模式。

## 功能特性

- **只读工具**：限制可用工具为读取、bash、grep、find、ls、question
- **Bash 白名单**：仅允许只读的 bash 命令
- **计划提取**：从 `Plan:` 部分提取带编号的步骤
- **进度追踪**：小部件在执行期间显示完成状态
- **[DONE:n] 标记**：显式步骤完成追踪
- **会话持久性**：状态在会话恢复后依然保留

## 命令

- `/plan` - 切换计划模式
- `/todos` - 显示当前计划进度
- `Ctrl+Alt+P` - 切换计划模式（快捷键）

## 使用方法

1. 使用 `/plan` 或 `--plan` 标志启用计划模式
2. 要求智能体分析代码并创建计划
3. 智能体应在 `Plan:` 标题下输出带编号的计划：

```
Plan:
1. 第一步描述
2. 第二步描述
3. 第三步描述
```

4. 在提示时选择“执行计划”
5. 执行期间，智能体使用 `[DONE:n]` 标签标记步骤完成
6. 进度小部件显示完成状态

## 工作原理

### 计划模式（只读）
- 仅提供只读工具
- Bash 命令通过白名单过滤
- 智能体创建计划，但不做任何更改

### 执行模式
- 恢复全部工具访问权限
- 智能体按顺序执行步骤
- `[DONE:n]` 标记追踪完成情况
- 小部件显示进度

### 命令白名单

安全命令（允许）：
- 文件检查：`cat`、`head`、`tail`、`less`、`more`
- 搜索：`grep`、`find`、`rg`、`fd`
- 目录：`ls`、`pwd`、`tree`
- Git 只读：`git status`、`git log`、`git diff`、`git branch`
- 包信息：`npm list`、`npm outdated`、`yarn info`
- 系统信息：`uname`、`whoami`、`date`、`uptime`

禁止的命令：
- 文件修改：`rm`、`mv`、`cp`、`mkdir`、`touch`
- Git 写入：`git add`、`git commit`、`git push`
- 包安装：`npm install`、`yarn add`、`pip install`
- 系统：`sudo`、`kill`、`reboot`
- 编辑器：`vim`、`nano`、`code`
