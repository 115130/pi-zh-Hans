/**
 * 针对扩展注册的工具的工具包装器。
 *
 * 这些包装器仅调整工具执行，以便扩展工具接收运行器上下文。
 * 工具调用和工具结果拦截由 AgentSession 通过 agent-core hooks 处理。
 */

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { wrapToolDefinition, wrapToolDefinitions } from "../tools/tool-definition-wrapper.ts";
import type { ExtensionRunner } from "./runner.ts";
import type { RegisteredTool } from "./types.ts";

/**
 * 将 RegisteredTool 包装为 AgentTool。
 * 使用运行器的 createContext() 以确保在工具和事件处理器之间上下文一致。
 */
export function wrapRegisteredTool(registeredTool: RegisteredTool, runner: ExtensionRunner): AgentTool {
	return wrapToolDefinition(registeredTool.definition, () => runner.createContext());
}

/**
 * 将所有注册的工具包装为 AgentTool。
 * 使用运行器的 createContext() 以确保在工具和事件处理器之间上下文一致。
 */
export function wrapRegisteredTools(registeredTools: RegisteredTool[], runner: ExtensionRunner): AgentTool[] {
	return wrapToolDefinitions(
		registeredTools.map((registeredTool) => registeredTool.definition),
		() => runner.createContext(),
	);
}
