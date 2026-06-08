---
name: add-llm-provider
description: 向 packages/ai 添加新 LLM 提供者的清单。涵盖核心类型、提供者实现、延迟注册、模型生成、完整测试矩阵、coding-agent 接入和文档。
---

# 添加新 LLM 提供者（packages/ai）

新的提供者涉及多个文件。按顺序完成以下步骤。

## 1. 核心类型（`packages/ai/src/types.ts`）

- 在 `Api` 类型联合中添加 API 标识符（例如 `"bedrock-converse-stream"`）。
- 创建继承 `StreamOptions` 的选项接口。
- 添加到 `ApiOptionsMap` 映射。
- 在 `KnownProvider` 类型联合中添加提供者名称。

## 2. 提供者实现（`packages/ai/src/providers/`）

创建提供者文件，导出：

- `stream<Provider>()` 返回 `AssistantMessageEventStream`。
- `streamSimple<Provider>()` 用于 `SimpleStreamOptions` 映射。
- 提供者特定的选项接口。
- 消息/工具转换函数。
- 响应解析，发出标准化事件（`text`、`tool_call`、`thinking`、`usage`、`stop`）。

## 3. 提供者导出与延迟注册

- 在 `packages/ai/package.json` 中添加包子路径导出，指向 `./dist/providers/<provider>.js`。
- 在 `packages/ai/src/index.ts` 中添加 `export type` 重新导出，用于那些应从根入口保持可用的提供者选项类型。
- 在 `packages/ai/src/providers/register-builtins.ts` 中通过延迟加载包装器注册提供者；不要在那里静态导入提供者实现模块。
- 在 `packages/ai/src/env-api-keys.ts` 中添加凭据检测。

## 4. 模型生成（`packages/ai/scripts/generate-models.ts`）

- 添加从提供者源获取/解析模型的逻辑。
- 映射到标准化的 `Model` 接口。

## 5. 测试（`packages/ai/test/`）

- 始终将提供者添加到 `stream.test.ts` 中，至少使用一个代表性模型，即使它复用了现有的 API 实现（如 `openai-completions`）。
- 在适用的地方将提供者添加到更广泛的测试矩阵中：`tokens.test.ts`、`abort.test.ts`、`empty.test.ts`、`context-overflow.test.ts`、`unicode-surrogate.test.ts`、`tool-call-without-result.test.ts`、`image-tool-result.test.ts`、`total-tokens.test.ts`、`cross-provider-handoff.test.ts`。
- 对于 `cross-provider-handoff.test.ts`，添加至少一个提供者/模型对。如果提供者暴露多个模型系列（例如 GPT 和 Claude），每个系列添加至少一个对。
- 对于非标准认证，创建一个带凭据检测的工具函数（例如 `bedrock-utils.ts`）。

## 6. 编码代理（`packages/coding-agent/`）

- `src/core/model-resolver.ts`：在 `defaultModelPerProvider` 中添加默认模型 ID。
- `src/core/provider-display-names.ts`：添加 API 密钥登录显示名称，使 `/login` 和相关 UI 为内置 API 密钥认证显示提供者名称。
- `src/cli/args.ts`：添加环境变量文档。
- `README.md`：添加提供者设置说明。
- `docs/providers.md`：添加设置说明、环境变量和 `auth.json` 密钥。

## 7. 文档

- `packages/ai/README.md`：添加到提供者表格，记录选项/认证，添加环境变量。
- `packages/ai/CHANGELOG.md`：在 `## [Unreleased]` 下添加条目。
