---
description: Worker implements, reviewer reviews, worker applies feedback
---
使用带有 `chain` 参数的 `subagent` 工具来执行此工作流：

1. 首先，使用 "worker" 代理来实现：$@
2. 然后，使用 "reviewer" 代理来审查上一步的实现（使用 {previous} 占位符）
3. 最后，使用 "worker" 代理来应用审查中的反馈（使用 {previous} 占位符）

以链式方式执行，通过 {previous} 在步骤之间传递输出。
