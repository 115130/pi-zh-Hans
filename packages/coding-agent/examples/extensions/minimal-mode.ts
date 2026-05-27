/**
 * Minimal Mode Example - Demonstrates a "minimal" tool display mode
 *
 * This extension overrides built-in tools to provide custom rendering:
 * - Collapsed mode: Only shows the tool call (command/path), no output
 * - Expanded mode: Shows full output like the built-in renderers
 *
 * This demonstrates how a "minimal mode" could work, where ctrl+o cycles through:
 * - Standard: Shows truncated output (current default)
 * - Expanded: Shows full output (current expanded)
 * - Minimal: Shows only tool call, no output (this extension's collapsed mode)
 *
 * Usage:
 *   pi -e ./minimal-mode.ts
 *
 * Then use ctrl+o to toggle between minimal (collapsed) and full (expanded) views.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { homedir } from "os";

/**
 * Shorten a path by replacing home directory with ~
 */
function shortenPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) {
		return `~${path.slice(home.length)}`;
	}
	return path;
}

// Cache for built-in tools by cwd
const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();

function createBuiltInTools(cwd: string) {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		find: createFindTool(cwd),
		grep: createGrepTool(cwd),
		ls: createLsTool(cwd),
	};
}

function getBuiltInTools(cwd: string) {
	let tools = toolCache.get(cwd);
	if (!tools) {
		tools = createBuiltInTools(cwd);
		toolCache.set(cwd, tools);
	}
	return tools;
}

export default function (pi: ExtensionAPI) {
	// =========================================================================
	// Read Tool
	// =========================================================================
	pi.registerTool({
		name: "read",
		label: "读取",
		description:
			"读取文件的内容。支持文本文件和图片（jpg, png, gif, webp）。图片作为附件发送。对于文本文件，输出被截断为2000行或50KB（以先达到者为准）。对于大文件，请使用 offset/limit 参数。",
		parameters: getBuiltInTools(process.cwd()).read.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.read.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path = shortenPath(args.path || "");
			let pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");

			// Show line range if specified
			if (args.offset !== undefined || args.limit !== undefined) {
				const startLine = args.offset ?? 1;
				const endLine = args.limit !== undefined ? startLine + args.limit - 1 : "";
				pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
			}

			return new Text(`${theme.fg("toolTitle", theme.bold("读取"))} ${pathDisplay}`, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			// Minimal mode: show nothing in collapsed state
			if (!expanded) {
				return new Text("", 0, 0);
			}

			// Expanded mode: show full output
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			const lines = textContent.text.split("\n");
			const output = lines.map((line) => theme.fg("toolOutput", line)).join("\n");
			return new Text(`\n${output}`, 0, 0);
		},
	});

	// =========================================================================
	// Bash Tool
	// =========================================================================
	pi.registerTool({
		name: "bash",
		label: "Bash",
		description:
			"在当前工作目录中执行 bash 命令。返回 stdout 和 stderr。输出被截断为最后2000行或50KB（以先达到者为准）。",
		parameters: getBuiltInTools(process.cwd()).bash.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.bash.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const command = args.command || "...";
			const timeout = args.timeout as number | undefined;
			const timeoutSuffix = timeout ? theme.fg("muted", ` (超时 ${timeout}秒)`) : "";

			return new Text(theme.fg("toolTitle", theme.bold(`$ ${command}`)) + timeoutSuffix, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			// Minimal mode: show nothing in collapsed state
			if (!expanded) {
				return new Text("", 0, 0);
			}

			// Expanded mode: show full output
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			const output = textContent.text
				.trim()
				.split("\n")
				.map((line) => theme.fg("toolOutput", line))
				.join("\n");

			if (!output) {
				return new Text("", 0, 0);
			}

			return new Text(`\n${output}`, 0, 0);
		},
	});

	// =========================================================================
	// Write Tool
	// =========================================================================
	pi.registerTool({
		name: "write",
		label: "写入",
		description: "将内容写入文件。如果文件不存在则创建，存在则覆盖。自动创建父目录。",
		parameters: getBuiltInTools(process.cwd()).write.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.write.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path = shortenPath(args.path || "");
			const pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
			const lineCount = args.content ? args.content.split("\n").length : 0;
			const lineInfo = lineCount > 0 ? theme.fg("muted", ` (${lineCount} 行)`) : "";

			return new Text(`${theme.fg("toolTitle", theme.bold("写入"))} ${pathDisplay}${lineInfo}`, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			// Minimal mode: show nothing (file was written)
			if (!expanded) {
				return new Text("", 0, 0);
			}

			// Expanded mode: show error if any
			if (result.content.some((c) => c.type === "text" && c.text)) {
				const textContent = result.content.find((c) => c.type === "text");
				if (textContent?.type === "text" && textContent.text) {
					return new Text(`\n${theme.fg("error", textContent.text)}`, 0, 0);
				}
			}

			return new Text("", 0, 0);
		},
	});

	// =========================================================================
	// Edit Tool
	// =========================================================================
	pi.registerTool({
		name: "edit",
		label: "编辑",
		description: "通过替换精确文本来编辑文件。oldText 必须完全匹配（包括空白符）。适用于精确的、手术式的编辑。",
		parameters: getBuiltInTools(process.cwd()).edit.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.edit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path = shortenPath(args.path || "");
			const pathDisplay = path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");

			return new Text(`${theme.fg("toolTitle", theme.bold("编辑"))} ${pathDisplay}`, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			// Minimal mode: show nothing in collapsed state
			if (!expanded) {
				return new Text("", 0, 0);
			}

			// Expanded mode: show diff or error
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			// For errors, show the error message
			const text = textContent.text;
			if (text.includes("Error") || text.includes("error")) {
				return new Text(`\n${theme.fg("error", text)}`, 0, 0);
			}

			// Otherwise show the text (would be nice to show actual diff here)
			return new Text(`\n${theme.fg("toolOutput", text)}`, 0, 0);
		},
	});

	// =========================================================================
	// Find Tool
	// =========================================================================
	pi.registerTool({
		name: "find",
		label: "查找",
		description: "通过名称模式（glob）查找文件。从指定路径递归搜索。输出限制为200个结果。",
		parameters: getBuiltInTools(process.cwd()).find.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.find.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const pattern = args.pattern || "";
			const path = shortenPath(args.path || ".");
			const limit = args.limit;

			let text = `${theme.fg("toolTitle", theme.bold("查找"))} ${theme.fg("accent", pattern)}`;
			text += theme.fg("toolOutput", ` 在 ${path} 中`);
			if (limit !== undefined) {
				text += theme.fg("toolOutput", ` (限制 ${limit})`);
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			if (!expanded) {
				// Minimal: just show count
				const textContent = result.content.find((c) => c.type === "text");
				if (textContent?.type === "text") {
					const count = textContent.text.trim().split("\n").filter(Boolean).length;
					if (count > 0) {
						return new Text(theme.fg("muted", ` → ${count} 个文件`), 0, 0);
					}
				}
				return new Text("", 0, 0);
			}

			// Expanded: show full results
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			const output = textContent.text
				.trim()
				.split("\n")
				.map((line) => theme.fg("toolOutput", line))
				.join("\n");

			return new Text(`\n${output}`, 0, 0);
		},
	});

	// =========================================================================
	// Grep Tool
	// =========================================================================
	pi.registerTool({
		name: "grep",
		label: "搜索",
		description: "通过正则表达式模式搜索文件内容。使用 ripgrep 快速搜索。输出限制为200个匹配。",
		parameters: getBuiltInTools(process.cwd()).grep.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.grep.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const pattern = args.pattern || "";
			const path = shortenPath(args.path || ".");
			const glob = args.glob;
			const limit = args.limit;

			let text = `${theme.fg("toolTitle", theme.bold("搜索"))} ${theme.fg("accent", `/${pattern}/`)}`;
			text += theme.fg("toolOutput", ` 在 ${path} 中`);
			if (glob) {
				text += theme.fg("toolOutput", ` (${glob})`);
			}
			if (limit !== undefined) {
				text += theme.fg("toolOutput", ` 限制 ${limit}`);
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			if (!expanded) {
				// Minimal: just show match count
				const textContent = result.content.find((c) => c.type === "text");
				if (textContent?.type === "text") {
					const count = textContent.text.trim().split("\n").filter(Boolean).length;
					if (count > 0) {
						return new Text(theme.fg("muted", ` → ${count} 个匹配`), 0, 0);
					}
				}
				return new Text("", 0, 0);
			}

			// Expanded: show full results
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			const output = textContent.text
				.trim()
				.split("\n")
				.map((line) => theme.fg("toolOutput", line))
				.join("\n");

			return new Text(`\n${output}`, 0, 0);
		},
	});

	// =========================================================================
	// Ls Tool
	// =========================================================================
	pi.registerTool({
		name: "ls",
		label: "列出",
		description: "列出目录内容及文件大小。显示文件和目录及其大小。输出限制为500条记录。",
		parameters: getBuiltInTools(process.cwd()).ls.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const tools = getBuiltInTools(ctx.cwd);
			return tools.ls.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme, _context) {
			const path = shortenPath(args.path || ".");
			const limit = args.limit;

			let text = `${theme.fg("toolTitle", theme.bold("列出"))} ${theme.fg("accent", path)}`;
			if (limit !== undefined) {
				text += theme.fg("toolOutput", ` (限制 ${limit})`);
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			if (!expanded) {
				// Minimal: just show entry count
				const textContent = result.content.find((c) => c.type === "text");
				if (textContent?.type === "text") {
					const count = textContent.text.trim().split("\n").filter(Boolean).length;
					if (count > 0) {
						return new Text(theme.fg("muted", ` → ${count} 个条目`), 0, 0);
					}
				}
				return new Text("", 0, 0);
			}

			// Expanded: show full listing
			const textContent = result.content.find((c) => c.type === "text");
			if (!textContent || textContent.type !== "text") {
				return new Text("", 0, 0);
			}

			const output = textContent.text
				.trim()
				.split("\n")
				.map((line) => theme.fg("toolOutput", line))
				.join("\n");

			return new Text(`\n${output}`, 0, 0);
		},
	});
}
