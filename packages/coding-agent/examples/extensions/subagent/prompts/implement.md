---
description: Full implementation workflow - scout gathers context, planner creates plan, worker implements
---
使用带有 chain 参数的 subagent 工具来执行此工作流：

1. 首先，使用 "scout" agent 查找所有与 $@ 相关的代码。
2. 然后，使用 "planner" agent 根据上一步的上下文（使用 {previous} 占位符）为 "$@" 创建实现计划。
3. 最后，使用 "worker" agent 实现上一步的计划（使用 {previous} 占位符）。

作为链式任务执行，通过 {previous} 在步骤间传递输出。
