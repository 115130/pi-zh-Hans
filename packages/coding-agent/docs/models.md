# 自定义模型

通过 `~/.pi/agent/models.json` 添加自定义提供商和模型（Ollama、vLLM、LM Studio、代理）。

## 目录

- [最小示例](#minimal-example)
- [完整示例](#full-example)
- [支持的 API](#supported-apis)
- [提供商配置](#provider-configuration)
- [模型配置](#model-configuration)
- [覆盖内置提供商](#overriding-built-in-providers)
- [模型级覆盖](#per-model-overrides)
- [Anthropic Messages 兼容性](#anthropic-messages-compatibility)
- [OpenAI 兼容性](#openai-compatibility)

## 最小示例

对于本地模型（Ollama、LM Studio、vLLM），每个模型只需 `id`：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "llama3.1:8b" },
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

`apiKey` 是必需的，但 Ollama 会忽略它，因此任意值均可。

部分兼容 OpenAI 的服务器无法理解用于推理模型的 `developer` 角色。对于这些提供商，请将 `compat.supportsDeveloperRole` 设置为 `false`，这样 pi 会以 `system` 消息的形式发送系统提示。如果服务器也不支持 `reasoning_effort`，请同时将 `compat.supportsReasoningEffort` 设置为 `false`。

您可以在提供商级别设置 `compat` 以应用于所有模型，或在模型级别设置以覆盖特定模型。这通常适用于 Ollama、vLLM、SGLang 及类似兼容 OpenAI 的服务器。

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "gpt-oss:20b",
          "reasoning": true
        }
      ]
    }
  }
}
```

## 完整示例

当需要特定值时覆盖默认设置：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        {
          "id": "llama3.1:8b",
          "name": "Llama 3.1 8B (本地)",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 32000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

每次打开 `/model` 时文件会重新加载。可在会话中编辑，无需重启。

## Google AI Studio 示例

使用带有 `baseUrl` 的 `google-generative-ai` 添加来自 Google AI Studio 的模型，包括自定义的 Gemma 4 条目：

```json
{
  "providers": {
    "my-google": {
      "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
      "api": "google-generative-ai",
      "apiKey": "GEMINI_API_KEY",
      "models": [
        {
          "id": "gemma-4-31b-it",
          "name": "Gemma 4 31B",
          "input": ["text", "image"],
          "contextWindow": 262144,
          "reasoning": true
        }
      ]
    }
  }
}
```

向 `google-generative-ai` API 类型添加自定义模型时，`baseUrl` 是必需的。

## 支持的 API

| API | 描述 |
|-----|------|
| `openai-completions` | OpenAI Chat Completions (最兼容) |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |
| `google-generative-ai` | Google Generative AI |

在提供商级别设置 `api`（所有模型的默认值）或模型级别设置（按模型覆盖）。

## 提供商配置

| 字段 | 描述 |
|------|------|
| `baseUrl` | API 端点 URL |
| `api` | API 类型（见上文） |
| `apiKey` | API 密钥（值解析见下文） |
| `headers` | 自定义请求头（值解析见下文） |
| `authHeader` | 设置为 `true` 以自动添加 `Authorization: Bearer <apiKey>` |
| `models` | 模型配置数组 |
| `modelOverrides` | 针对该提供商内置模型的按模型覆盖 |

### 值解析

`apiKey` 和 `headers` 字段支持三种格式：

- **Shell 命令：** `"!command"` 执行并取 stdout
  ```json
  "apiKey": "!security find-generic-password -ws 'anthropic'"
  "apiKey": "!op read 'op://vault/item/credential'"
  ```
- **环境变量：** 使用指定变量的值
  ```json
  "apiKey": "MY_API_KEY"
  ```
- **字面值：** 直接使用
  ```json
  "apiKey": "sk-..."
  ```

对于 `models.json`，Shell 命令在请求时解析。pi 有意不对任意命令应用内置的 TTL、过期重用或恢复逻辑。不同的命令需要不同的缓存和失败策略，pi 无法推断出正确的方法。

如果您的命令较慢、开销较大、有频率限制，或者希望在临时故障时继续使用之前的值，请将其包装到实现所需缓存或 TTL 行为的脚本或命令中。

`/model` 的可用性检查会使用已配置的身份认证信息，但不会执行 Shell 命令。

### 自定义请求头

```json
{
  "providers": {
    "custom-proxy": {
      "baseUrl": "https://proxy.example.com/v1",
      "apiKey": "MY_API_KEY",
      "api": "anthropic-messages",
      "headers": {
        "x-portkey-api-key": "PORTKEY_API_KEY",
        "x-secret": "!op read 'op://vault/item/secret'"
      },
      "models": [...]
    }
  }
}
```

## 模型配置

| 字段 | 必需 | 默认值 | 描述 |
|------|------|--------|------|
| `id` | 是 | — | 模型标识符（传递给 API） |
| `name` | 否 | `id` | 人类可读的模型标签。用于匹配（`--model` 模式）并显示在模型详情/状态文本中。 |
| `api` | 否 | 提供商的 `api` | 覆盖该模型的提供商 API |
| `reasoning` | 否 | `false` | 是否支持扩展思考 |
| `thinkingLevelMap` | 否 | 省略 | 将 pi 思考级别映射到提供商的值，并标记不支持的级别（见下文） |
| `input` | 否 | `["text"]` | 输入类型：`["text"]` 或 `["text", "image"]` |
| `contextWindow` | 否 | `128000` | 上下文窗口大小（token） |
| `maxTokens` | 否 | `16384` | 最大输出 token |
| `cost` | 否 | 全零 | `{"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0}`（每百万 token） |
| `compat` | 否 | 提供商的 `compat` | 提供商兼容性覆盖。当同时设置时，与提供商级别的 `compat` 合并。 |

当前行为：
- `/model` 和 `--list-models` 按模型的 `id` 列出条目。
- 配置的 `name` 用于模型匹配和详情/状态文本。

### 思考级别映射

在模型上使用 `thinkingLevelMap` 来描述模型特定的思考控制。键是 pi 的思考级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`。

值为三态：

| 值 | 含义 |
|----|------|
| 省略 | 该级别受支持，并使用提供商的默认映射 |
| 字符串 | 该级别受支持，并将此值发送给提供商 |
| `null` | 该级别不受支持，将被隐藏/跳过/钳制 |

示例：一个仅支持关闭、高和最大推理的模型：

```json
{
  "id": "deepseek-v4-pro",
  "reasoning": true,
  "thinkingLevelMap": {
    "minimal": null,
    "low": null,
    "medium": null,
    "high": "high",
    "xhigh": "max"
  }
}
```

示例：一个无法关闭思考的模型：

```json
{
  "id": "always-thinking-model",
  "reasoning": true,
  "thinkingLevelMap": {
    "off": null
  }
}
```

迁移：旧配置中使用了 `compat.reasoningEffortMap` 的，应将映射移至模型级别的 `thinkingLevelMap`。对于不应出现在 UI 中的级别，使用 `null`。

## 覆盖内置提供商

通过代理路由内置提供商，无需重新定义模型：

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1"
    }
  }
}
```

所有内置的 Anthropic 模型仍然可用。现有的 OAuth 或 API 密钥认证继续有效。

要将自定义模型合并到内置提供商中，请包含 `models` 数组：

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "https://my-proxy.example.com/v1",
      "apiKey": "ANTHROPIC_API_KEY",
      "api": "anthropic-messages",
      "models": [...]
    }
  }
}
```

合并语义：
- 保留内置模型。
- 自定义模型按提供商的 `id` 进行 upsert（更新或插入）。
- 如果自定义模型的 `id` 与内置模型的 `id` 匹配，则自定义模型替换该内置模型。
- 如果自定义模型的 `id` 是新的，则将其添加到内置模型旁边。

## 模型级覆盖

使用 `modelOverrides` 来自定义特定的内置模型，而无需替换提供商的完整模型列表。

```json
{
  "providers": {
    "openrouter": {
      "modelOverrides": {
        "anthropic/claude-sonnet-4": {
          "name": "Claude Sonnet 4 (Bedrock 路由)",
          "compat": {
            "openRouterRouting": {
              "only": ["amazon-bedrock"]
            }
          }
        }
      }
    }
  }
}
```

`modelOverrides` 每个模型支持以下字段：`name`、`reasoning`、`input`、`cost`（部分）、`contextWindow`、`maxTokens`、`headers`、`compat`。

行为说明：
- `modelOverrides` 应用于内置提供商模型。
- 未知的模型 ID 会被忽略。
- 可以将提供商级别的 `baseUrl`/`headers` 与 `modelOverrides` 结合使用。
- 如果也为提供商定义了 `models`，则在应用内置覆盖后合并自定义模型。具有相同 `id` 的自定义模型会替换被覆盖的内置模型条目。

## Anthropic Messages 兼容性

对于使用 `api: "anthropic-messages"` 的提供商或代理，使用 `compat` 来控制 Anthropic 特定的请求兼容性。

默认情况下，pi 会发送每个工具的 `eager_input_streaming: true`。如果代理或兼容 Anthropic 的后端拒绝该字段，请将 `supportsEagerToolInputStreaming` 设置为 `false`。pi 将省略 `tools[].eager_input_streaming`，并在启用工具的请求中发送旧的 `fine-grained-tool-streaming-2025-05-14` beta 请求头。

某些 Anthropic 模型需要自适应思考（`thinking.type: "adaptive"` 加上 `output_config.effort`）而不是基于预算的思考载荷。内置模型会自动设置。对于路由到这些模型的自定义提供商或别名，请将 `forceAdaptiveThinking` 设置为 `true`。

```json
{
  "providers": {
    "anthropic-proxy": {
      "baseUrl": "https://proxy.example.com",
      "api": "anthropic-messages",
      "apiKey": "ANTHROPIC_PROXY_KEY",
      "compat": {
        "supportsEagerToolInputStreaming": false,
        "supportsLongCacheRetention": true,
        "forceAdaptiveThinking": true
      },
      "models": [
        {
          "id": "claude-opus-4-7",
          "reasoning": true,
          "input": ["text", "image"]
        }
      ]
    }
  }
}
```

| 字段 | 描述 |
|------|------|
| `supportsEagerToolInputStreaming` | 提供商是否接受每个工具的 `eager_input_streaming`。默认：`true`。设置为 `false` 以省略该字段，并在启用工具的请求中使用旧的细粒度工具流式传输 beta 请求头。 |
| `supportsLongCacheRetention` | 当缓存保持设置为 `long` 时，提供商是否接受 Anthropic 长缓存保留（`cache_control.ttl: "1h"`）。默认：`true`。 |
| `sendSessionAffinityHeaders` | 在缓存启用时，是否从会话 ID 发送 `x-session-affinity`。默认：对已知提供商自动检测。 |
| `supportsCacheControlOnTools` | 提供商是否接受工具定义上的 Anthropic 风格 `cache_control` 标记。默认：`true`。 |
| `forceAdaptiveThinking` | 是否为此模型发送自适应思考（`thinking.type: "adaptive"` 加上 `output_config.effort`）。内置自适应模型会自动设置。默认：`false`。 |

## OpenAI 兼容性

对于部分兼容 OpenAI 的提供商，请使用 `compat` 字段。

- 提供商级别的 `compat` 将该提供商下的所有模型应用默认值。
- 模型级别的 `compat` 会覆盖该模型的提供商级别值。

```json
{
  "providers": {
    "local-llm": {
      "baseUrl": "http://localhost:8080/v1",
      "api": "openai-completions",
      "compat": {
        "supportsUsageInStreaming": false,
        "maxTokensField": "max_tokens"
      },
      "models": [...]
    }
  }
}
```

| 字段 | 描述 |
|------|------|
| `supportsStore` | 提供商是否支持 `store` 字段 |
| `supportsDeveloperRole` | 使用 `developer` 角色还是 `system` 角色 |
| `supportsReasoningEffort` | 是否支持 `reasoning_effort` 参数 |
| `supportsUsageInStreaming` | 是否支持 `stream_options: { include_usage: true }`（默认：`true`） |
| `maxTokensField` | 使用 `max_completion_tokens` 还是 `max_tokens` |
| `requiresToolResultName` | 是否在工具结果消息中包含 `name` |
| `requiresAssistantAfterToolResult` | 在工具结果后，是否在用户消息前插入一条助手消息 |
| `requiresThinkingAsText` | 是否将思考块转换为纯文本 |
| `requiresReasoningContentOnAssistantMessages` | 当推理启用时，是否在重放的所有助手消息中包含空的 `reasoning_content` |
| `thinkingFormat` | 使用 `reasoning_effort`、`openrouter`、`deepseek`、`together`、`zai`、`qwen` 或 `qwen-chat-template` 思考参数 |
| `cacheControlFormat` | 是否在系统提示、最后一个工具定义以及最后一个用户/助手的文本内容上使用 Anthropic 风格的 `cache_control` 标记。目前仅支持 `anthropic`。 |
| `supportsStrictMode` | 是否在工具定义中包含 `strict` 字段 |
| `supportsLongCacheRetention` | 当缓存保持设置为 `long` 时，提供商是否接受长缓存保留：对于 OpenAI 提示缓存为 `prompt_cache_retention: "24h"`，或者当 `cacheControlFormat` 为 `anthropic` 时为 `cache_control.ttl: "1h"`。默认：`true`。 |
| `openRouterRouting` | OpenRouter 提供商路由偏好。此对象按原样作为 [OpenRouter API 请求](https://openrouter.ai/docs/guides/routing/provider-selection) 的 `provider` 字段发送。 |
| `vercelGatewayRouting` | Vercel AI Gateway 的提供商选择路由配置（`only`、`order`） |

`openrouter` 使用 `reasoning: { effort }`。`together` 使用 `reasoning: { enabled }`，同时当 `supportsReasoningEffort` 启用时也使用 `reasoning_effort`。`qwen` 使用顶级 `enable_thinking`。对于需要 `chat_template_kwargs.enable_thinking` 的本地 Qwen 兼容服务器，请使用 `qwen-chat-template`。

`cacheControlFormat: "anthropic"` 适用于那些通过文本内容和工具定义上的 `cache_control` 标记暴露 Anthropic 风格提示缓存的兼容 OpenAI 的提供商。

示例：

```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "OPENROUTER_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "openrouter/anthropic/claude-3.5-sonnet",
          "name": "OpenRouter Claude 3.5 Sonnet",
          "compat": {
            "openRouterRouting": {
              "allow_fallbacks": true,
              "require_parameters": false,
              "data_collection": "deny",
              "zdr": true,
              "enforce_distillable_text": false,
              "order": ["anthropic", "amazon-bedrock", "google-vertex"],
              "only": ["anthropic", "amazon-bedrock"],
              "ignore": ["gmicloud", "friendli"],
              "quantizations": ["fp16", "bf16"],
              "sort": {
                "by": "price",
                "partition": "model"
              },
              "max_price": {
                "prompt": 10,
                "completion": 20
              },
              "preferred_min_throughput": {
                "p50": 100,
                "p90": 50
              },
              "preferred_max_latency": {
                "p50": 1,
                "p90": 3,
                "p99": 5
              }
            }
          }
        }
      ]
    }
  }
}
```

Vercel AI Gateway 示例：

```json
{
  "providers": {
    "vercel-ai-gateway": {
      "baseUrl": "https://ai-gateway.vercel.sh/v1",
      "apiKey": "AI_GATEWAY_API_KEY",
      "api": "openai-completions",
      "models": [
        {
          "id": "moonshotai/kimi-k2.5",
          "name": "Kimi K2.5 (通过 Vercel 的 Fireworks)",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": { "input": 0.6, "output": 3, "cacheRead": 0, "cacheWrite": 0 },
          "contextWindow": 262144,
          "maxTokens": 262144,
          "compat": {
            "vercelGatewayRouting": {
              "only": ["fireworks", "novita"],
              "order": ["fireworks", "novita"]
            }
          }
        }
      ]
    }
  }
}
```
