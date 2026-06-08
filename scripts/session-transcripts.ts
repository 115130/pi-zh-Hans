#!/usr/bin/env node
/**
 * 提取指定 cwd 的会话记录，按上下文大小拆分文件，
 * 可选地生成子代理来分析模式。
 *
 * 用法：node scripts/session-transcripts.ts [--analyze] [--output <dir>] [cwd]
 *   --analyze      生成 pi 子代理来分析每个记录文件
 *   --output <dir> 记录文件输出目录（默认：./session-transcripts）
 *   cwd            要提取会话的工作目录（默认：当前目录）
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import { createInterface } from "node:readline";
import { homedir } from "os";
import { join, resolve } from "path";
import { parseSessionEntries, type SessionMessageEntry } from "../packages/coding-agent/src/core/session-manager.ts";
import chalk from "chalk";

const MAX_CHARS_PER_FILE = 100_000; // 约 20k token，为提示 + 分析 + 输出留出空间

function cwdToSessionDir(cwd: string): string {
	const normalized = resolve(cwd).replace(/\//g, "-");
	return `--${normalized.slice(1)}--`; // 去掉前导斜杠，用 -- 包裹
}

function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text!)
		.join("\n");
}

function parseSession(filePath: string): string[] {
	const content = readFileSync(filePath, "utf8");
	const entries = parseSessionEntries(content);
	const messages: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msgEntry = entry as SessionMessageEntry;
		const { role, content } = msgEntry.message;

		if (role !== "user" && role !== "assistant") continue;

		const text = extractTextContent(content as string | Array<{ type: string; text?: string }>);
		if (!text.trim()) continue;

		messages.push(`[${role.toUpperCase()}]\n${text}`);
	}

	return messages;
}

const MAX_DISPLAY_WIDTH = 100;

function truncateLine(text: string, maxWidth: number): string {
	const singleLine = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
	if (singleLine.length <= maxWidth) return singleLine;
	return singleLine.slice(0, maxWidth - 3) + "...";
}

interface JsonEvent {
	type: string;
	assistantMessageEvent?: { type: string; delta?: string };
	toolName?: string;
	args?: {
		path?: string;
		offset?: number;
		limit?: number;
		content?: string;
	};
}

function runSubagent(prompt: string, cwd: string): Promise<{ success: boolean }> {
	return new Promise((resolve) => {
		const child = spawn("pi", ["--mode", "json", "--tools", "read,write", "-p", prompt], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let textBuffer = "";

		const rl = createInterface({ input: child.stdout });

		rl.on("line", (line) => {
			try {
				const event: JsonEvent = JSON.parse(line);

				if (event.type === "message_update" && event.assistantMessageEvent) {
					const msgEvent = event.assistantMessageEvent;
					if (msgEvent.type === "text_delta" && msgEvent.delta) {
						textBuffer += msgEvent.delta;
					}
				} else if (event.type === "tool_execution_start" && event.toolName) {
					// 在工具开始前打印累积的文本
					if (textBuffer.trim()) {
						console.log(chalk.dim("  " + truncateLine(textBuffer, MAX_DISPLAY_WIDTH)));
						textBuffer = "";
					}
					// 格式化工具调用及参数
					let argsStr = "";
					if (event.args) {
						if (event.toolName === "read") {
							argsStr = event.args.path || "";
							if (event.args.offset) argsStr += ` offset=${event.args.offset}`;
							if (event.args.limit) argsStr += ` limit=${event.args.limit}`;
						} else if (event.toolName === "write") {
							argsStr = event.args.path || "";
						}
					}
					console.log(chalk.cyan(`  [${event.toolName}] ${argsStr}`));
				} else if (event.type === "turn_end") {
					// 在轮次结束时打印剩余文本
					if (textBuffer.trim()) {
						console.log(chalk.dim("  " + truncateLine(textBuffer, MAX_DISPLAY_WIDTH)));
					}
					textBuffer = "";
				}
			} catch {
				// 忽略格式错误的 JSON
			}
		});

		child.stderr.on("data", (data) => {
			process.stderr.write(chalk.red(data.toString()));
		});

		child.on("close", (code) => {
			resolve({ success: code === 0 });
		});

		child.on("error", (err) => {
			console.error(chalk.red(`  生成 pi 失败：${err.message}`));
			resolve({ success: false });
		});
	});
}

async function main() {
	const args = process.argv.slice(2);
	const analyzeFlag = args.includes("--analyze");

	// 解析 --output <dir>
	const outputIdx = args.indexOf("--output");
	let outputDir = resolve("./session-transcripts");
	if (outputIdx !== -1 && args[outputIdx + 1]) {
		outputDir = resolve(args[outputIdx + 1]);
	}

	// 查找 cwd（位置参数，不是标志或标志值）
	const flagIndices = new Set<number>();
	flagIndices.add(args.indexOf("--analyze"));
	if (outputIdx !== -1) {
		flagIndices.add(outputIdx);
		flagIndices.add(outputIdx + 1);
	}
	const cwdArg = args.find((a, i) => !flagIndices.has(i) && !a.startsWith("--"));
	const cwd = resolve(cwdArg || process.cwd());

	mkdirSync(outputDir, { recursive: true });
	const sessionsBase = join(homedir(), ".pi/agent/sessions");
	const sessionDirName = cwdToSessionDir(cwd);
	const sessionDir = join(sessionsBase, sessionDirName);

	if (!existsSync(sessionDir)) {
		console.error(`在 ${cwd} 中未找到会话`);
		console.error(`预期路径：${sessionDir}`);
		process.exit(1);
	}

	const sessionFiles = readdirSync(sessionDir)
		.filter((f) => f.endsWith(".jsonl"))
		.sort();

	console.log(`在 ${sessionDir} 中找到 ${sessionFiles.length} 个会话文件`);

	// 收集所有记录
	const allTranscripts: string[] = [];
	for (const file of sessionFiles) {
		const filePath = join(sessionDir, file);
		const messages = parseSession(filePath);
		if (messages.length > 0) {
			allTranscripts.push(`=== 会话：${file} ===\n${messages.join("\n---\n")}\n=== 会话结束 ===`);
		}
	}

	if (allTranscripts.length === 0) {
		console.error("未找到记录");
		process.exit(1);
	}

	// 按 MAX_CHARS_PER_FILE 拆分为文件
	const outputFiles: string[] = [];
	let currentContent = "";
	let fileIndex = 0;

	for (const transcript of allTranscripts) {
		// 如果添加此记录会超出限制，写入当前文件并开始新文件
		if (currentContent.length > 0 && currentContent.length + transcript.length + 2 > MAX_CHARS_PER_FILE) {
			const filename = `session-transcripts-${String(fileIndex).padStart(3, "0")}.txt`;
			writeFileSync(join(outputDir, filename), currentContent);
			outputFiles.push(filename);
			console.log(`已写入 ${filename}（${currentContent.length} 字符）`);
			currentContent = "";
			fileIndex++;
		}

		// 如果单条记录超出限制，写入单独的文件
		if (transcript.length > MAX_CHARS_PER_FILE) {
			// 先写入待处理的内容
			if (currentContent.length > 0) {
				const filename = `session-transcripts-${String(fileIndex).padStart(3, "0")}.txt`;
				writeFileSync(join(outputDir, filename), currentContent);
				outputFiles.push(filename);
				console.log(`已写入 ${filename}（${currentContent.length} 字符）`);
				currentContent = "";
				fileIndex++;
			}
			// 将大记录写入单独的文件
			const filename = `session-transcripts-${String(fileIndex).padStart(3, "0")}.txt`;
			writeFileSync(join(outputDir, filename), transcript);
			outputFiles.push(filename);
			console.log(chalk.yellow(`已写入 ${filename}（${transcript.length} 字符）- 超大`));
			fileIndex++;
			continue;
		}

		currentContent += (currentContent ? "\n\n" : "") + transcript;
	}

	// 写入剩余内容
	if (currentContent.length > 0) {
		const filename = `session-transcripts-${String(fileIndex).padStart(3, "0")}.txt`;
		writeFileSync(join(outputDir, filename), currentContent);
		outputFiles.push(filename);
		console.log(`已写入 ${filename}（${currentContent.length} 字符）`);
	}

	console.log(`\n已在 ${outputDir} 中创建 ${outputFiles.length} 个记录文件`);

	if (!analyzeFlag) {
		console.log("\n使用 --analyze 参数可生成 pi 子代理进行模式分析。");
		return;
	}

	// 查找 AGENTS.md 文件以进行对比
	const globalAgentsMd = join(homedir(), ".pi/agent/AGENTS.md");
	const localAgentsMd = join(cwd, "AGENTS.md");
	const agentsMdFiles = [globalAgentsMd, localAgentsMd].filter(existsSync);
	const agentsMdSection =
		agentsMdFiles.length > 0
			? `步骤 1：阅读现有的 AGENTS.md 文件，了解已编码的内容：\n${agentsMdFiles.join("\n")}\n\n步骤 2：`
			: "";

	// 生成子代理来分析每个文件
	const analysisPrompt = `你正在分析会话记录，以识别可以自动化的重复用户指令。

${agentsMdSection}阅读记录：
记录文件很大。使用 offset/limit 参数以 1000 行为单位分块读取：
1. 首先：读取 limit=1000（第 1-1000 行）
2. 然后：读取 offset=1001、limit=1000（第 1001-2000 行）
3. 继续每次递增 offset 1000，直到读取完毕
4. 只有在阅读完整个文件后，才能执行分析并写入摘要

分析任务：
寻找用户重复给出相似指令的模式。这些可以成为：
- AGENTS.md 条目：编码风格规则、行为指南、项目约定
- Skills：带外部工具的多步骤工作流（搜索、浏览器、API）
- 提示模板：常用任务的复用提示

将每个模式与现有的 AGENTS.md 内容进行比较，判断是新的还是已有的。

输出格式（严格）：
使用如下结构写入文件。模式之间用 --- 分隔。

PATTERN: <简短描述性名称>
STATUS: NEW | EXISTING
TYPE: agents-md | skill | prompt-template
FREQUENCY: <观察次数>
EVIDENCE:
- "<精确引用 1>"
- "<精确引用 2>"
- "<精确引用 3>"
DRAFT:
<AGENTS.md 条目、SKILL.md 或提示模板的拟议内容>
---

规则：
- 只包含出现 2+ 次的模式
- 如果不在 AGENTS.md 中则 STATUS 为 NEW，如果已覆盖则为 EXISTING
- EVIDENCE 必须包含记录的精确引用
- DRAFT 必须是可直接使用的内容
- 如果没有找到模式，写入 "NO PATTERNS FOUND"
- 不要包含此格式之外的任何其他文本`;

	console.log("\n生成子代理进行分析...");
	for (const file of outputFiles) {
		const summaryFile = file.replace(".txt", ".summary.txt");
		const filePath = join(outputDir, file);
		const summaryPath = join(outputDir, summaryFile);

		const fileContent = readFileSync(filePath, "utf8");
		const fileSize = fileContent.length;

		console.log(`分析 ${file}（${fileSize} 字符）...`);

		const lineCount = fileContent.split("\n").length;
		const fullPrompt = `${analysisPrompt}\n\n文件 ${filePath} 有 ${lineCount} 行。使用分块读取完整阅读，然后将分析写入 ${summaryPath}`;

		const result = await runSubagent(fullPrompt, outputDir);

		if (result.success && existsSync(summaryPath)) {
			console.log(chalk.green(`  -> ${summaryFile}`));
		} else if (result.success) {
			console.error(chalk.yellow(`  代理已完成但未写入 ${summaryFile}`));
		} else {
			console.error(chalk.red(`  分析 ${file} 失败`));
		}
	}

	// 收集所有创建的摘要文件
	const summaryFiles = readdirSync(outputDir)
		.filter((f) => f.endsWith(".summary.txt"))
		.sort();

	console.log(`\n=== 单项分析完成 ===`);
	console.log(`创建了 ${summaryFiles.length} 个摘要文件`);

	if (summaryFiles.length === 0) {
		console.log(chalk.yellow("未创建摘要文件。无需汇总。"));
		return;
	}

	// 最终汇总步骤
	console.log("\n汇总各文件的发现结果...");

	const summaryPaths = summaryFiles.map((f) => join(outputDir, f)).join("\n");
	const finalSummaryPath = join(outputDir, "FINAL-SUMMARY.txt");

	const aggregationPrompt = `你正在汇总来自多个摘要文件的模式分析结果。

步骤 1：阅读现有的 AGENTS.md 文件，了解已编码的模式：
${agentsMdFiles.length > 0 ? agentsMdFiles.join("\n") : "（未找到 AGENTS.md 文件）"}

步骤 2：阅读所有以下摘要文件：
${summaryPaths}

步骤 3：创建合并的最终摘要，要求：
1. 合并重复模式（同一模式在多个文件中出现）
2. 按所有文件的总频率排序
3. 按状态（NEW 在前，EXISTING 在后）和类型分组
4. 为每个唯一模式提供最佳/最完整的草稿
5. 对照 AGENTS.md 内容验证状态（摘要中标记为 NEW 的模式可能实际已存在）

输出格式（严格）：
使用如下结构写入最终摘要：

# 新模式（尚未在 AGENTS.md 中）

## AGENTS.MD：<模式名称>
总频率：<所有文件汇总>
证据：
- "<最佳引用>"
草稿：
<合并后的草稿>

## SKILL：<模式名称>
...

## PROMPT-TEMPLATE：<模式名称>
...

---

# 已有模式（已在 AGENTS.md 中，供参考）

## <模式名称>
总频率：<N>
已覆盖于：<引用 AGENTS.md 的相关章节>

---

# 汇总
- 要添加的新模式：<N>
- 已覆盖的模式：<N>
- 按频率排名前三的新模式：<列表>

将最终摘要写入 ${finalSummaryPath}`;

	const aggregateResult = await runSubagent(aggregationPrompt, outputDir);

	if (aggregateResult.success && existsSync(finalSummaryPath)) {
		console.log(chalk.green(`\n=== 最终摘要已创建 ===`));
		console.log(chalk.green(`  ${finalSummaryPath}`));
	} else if (aggregateResult.success) {
		console.error(chalk.yellow(`代理已完成但未写入最终摘要`));
	} else {
		console.error(chalk.red(`创建最终摘要失败`));
	}
}

main().catch(console.error);
