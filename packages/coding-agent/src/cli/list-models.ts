// 已将文件中的用户可见字符串翻译为中文，包括错误消息、提示信息和表格头。
// 保持变量名、类型、导入导出、技术术语和代码逻辑不变。

/**
 * List available models with optional fuzzy search
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import chalk from "chalk";
import { formatNoModelsAvailableMessage } from "../core/auth-guidance.ts";
import type { ModelRegistry } from "../core/model-registry.ts";

/**
 * Format a number as human-readable (e.g., 200000 -> "200K", 1000000 -> "1M")
 */
function formatTokenCount(count: number): string {
	if (count >= 1_000_000) {
		const millions = count / 1_000_000;
		return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
	}
	if (count >= 1_000) {
		const thousands = count / 1_000;
		return thousands % 1 === 0 ? `${thousands}K` : `${thousands.toFixed(1)}K`;
	}
	return count.toString();
}

/**
 * List available models, optionally filtered by search pattern
 */
export async function listModels(modelRegistry: ModelRegistry, searchPattern?: string): Promise<void> {
	const loadError = modelRegistry.getError();
	if (loadError) {
		console.error(chalk.yellow(`警告：加载 models.json 出错：\n${loadError}`));
	}

	const models = modelRegistry.getAvailable();

	if (models.length === 0) {
		console.log(formatNoModelsAvailableMessage());
		return;
	}

	// Apply fuzzy filter if search pattern provided
	let filteredModels: Model<Api>[] = models;
	if (searchPattern) {
		filteredModels = fuzzyFilter(models, searchPattern, (m) => `${m.provider} ${m.id}`);
	}

	if (filteredModels.length === 0) {
		console.log(`没有匹配 "${searchPattern}" 的模型`);
		return;
	}

	// Sort by provider, then by model id
	filteredModels.sort((a, b) => {
		const providerCmp = a.provider.localeCompare(b.provider);
		if (providerCmp !== 0) return providerCmp;
		return a.id.localeCompare(b.id);
	});

	// Calculate column widths
	const rows = filteredModels.map((m) => ({
		provider: m.provider,
		model: m.id,
		context: formatTokenCount(m.contextWindow),
		maxOut: formatTokenCount(m.maxTokens),
		thinking: m.reasoning ? "是" : "否",
		images: m.input.includes("image") ? "是" : "否",
	}));

	const headers = {
		provider: "提供商",
		model: "模型",
		context: "上下文",
		maxOut: "最大输出",
		thinking: "推理",
		images: "图片",
	};

	const widths = {
		provider: Math.max(headers.provider.length, ...rows.map((r) => r.provider.length)),
		model: Math.max(headers.model.length, ...rows.map((r) => r.model.length)),
		context: Math.max(headers.context.length, ...rows.map((r) => r.context.length)),
		maxOut: Math.max(headers.maxOut.length, ...rows.map((r) => r.maxOut.length)),
		thinking: Math.max(headers.thinking.length, ...rows.map((r) => r.thinking.length)),
		images: Math.max(headers.images.length, ...rows.map((r) => r.images.length)),
	};

	// Print header
	const headerLine = [
		headers.provider.padEnd(widths.provider),
		headers.model.padEnd(widths.model),
		headers.context.padEnd(widths.context),
		headers.maxOut.padEnd(widths.maxOut),
		headers.thinking.padEnd(widths.thinking),
		headers.images.padEnd(widths.images),
	].join("  ");
	console.log(headerLine);

	// Print rows
	for (const row of rows) {
		const line = [
			row.provider.padEnd(widths.provider),
			row.model.padEnd(widths.model),
			row.context.padEnd(widths.context),
			row.maxOut.padEnd(widths.maxOut),
			row.thinking.padEnd(widths.thinking),
			row.images.padEnd(widths.images),
		].join("  ");
		console.log(line);
	}
}
