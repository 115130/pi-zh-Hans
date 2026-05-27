#!/usr/bin/env node
/**
 * 重构版编码代理的 CLI 入口点。
 * 使用 main.ts，包含 AgentSession 和新的模式模块。
 *
 * 测试命令：npx tsx src/cli-new.ts [参数...]
 */
import { APP_NAME } from "./config.ts";
import { configureHttpDispatcher } from "./core/http-dispatcher.ts";
import { main } from "./main.ts";

process.title = APP_NAME;
process.env.PI_CODING_AGENT = "true";
process.emitWarning = (() => {}) as typeof process.emitWarning;

// 在提供商的 SDK 发出请求之前，先配置 undici 的全局分发器。
// 一旦 SettingsManager 加载了全局/项目设置，就会应用运行时设置。
configureHttpDispatcher();

main(process.argv.slice(2));
