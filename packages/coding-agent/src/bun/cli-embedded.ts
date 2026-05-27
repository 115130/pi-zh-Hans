#!/usr/bin/env node
/**
 * 内嵌版入口点 — 用于 bun build --compile
 *
 * 1. 先加载嵌入资产（设置 globalThis 桥接变量）
 * 2. 然后启动常规 CLI
 */

// 必须在导入任何可能触发 config.ts 的模块之前加载嵌入资产
process.title = "pi";
process.emitWarning = (() => {}) as typeof process.emitWarning;

await import("./embedded-assets.generated.ts");

import { restoreSandboxEnv } from "./restore-sandbox-env.ts";

restoreSandboxEnv();

await import("./register-bedrock.ts");
await import("../cli.ts");
