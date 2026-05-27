/**
 * Tool Override Example - Demonstrates overriding built-in tools
 *
 * Extensions can register tools with the same name as built-in tools to replace them.
 * This is useful for:
 * - Adding logging or auditing to tool calls
 * - Implementing access control or sandboxing
 * - Routing tool calls to remote systems (e.g., pi-ssh-remote)
 * - Modifying tool behavior for specific workflows
 *
 * This example overrides the `read` tool to:
 * 1. Log all file access to a log file
 * 2. Block access to sensitive paths (e.g., .env files)
 * 3. Delegate to the original read implementation for allowed files
 *
 * Since no custom renderCall/renderResult are provided, the built-in renderer
 * is used automatically (syntax highlighting, line numbers, truncation warnings).
 *
 * Usage:
 *   pi -e ./tool-override.ts
 */

import type { TextContent } from "@earendil-works/pi-ai";
import { type ExtensionAPI, getAgentDir, withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { constants, readFileSync } from "fs";
import { access, appendFile, readFile } from "fs/promises";
import { join, resolve } from "path";
import { Type } from "typebox";

const LOG_FILE = join(getAgentDir(), "read-access.log");

// Paths that are blocked from reading
const BLOCKED_PATTERNS = [
	/\.env$/,
	/\.env\..+$/,
	/secrets?\.(json|yaml|yml|toml)$/i,
	/credentials?\.(json|yaml|yml|toml)$/i,
	/\/\.ssh\//,
	/\/\.aws\//,
	/\/\.gnupg\//,
];

function isBlockedPath(path: string): boolean {
	return BLOCKED_PATTERNS.some((pattern) => pattern.test(path));
}

async function logAccess(path: string, allowed: boolean, reason?: string) {
	const timestamp = new Date().toISOString();
	const status = allowed ? "ALLOWED" : "BLOCKED";
	const msg = reason ? ` (${reason})` : "";
	const line = `[${timestamp}] ${status}: ${path}${msg}\n`;

	try {
		await withFileMutationQueue(LOG_FILE, async () => {
			await appendFile(LOG_FILE, line);
		});
	} catch {
		// Ignore logging errors
	}
}

const readSchema = Type.Object({
	path: Type.String({ description: "要读取的文件路径（相对或绝对）" }),
	offset: Type.Optional(Type.Number({ description: "开始读取的行号（从1开始）" })),
	limit: Type.Optional(Type.Number({ description: "最大读取行数" })),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "read", // Same name as built-in - this will override it
		label: "读取（带审计）",
		description: "读取文件内容并记录访问日志。某些敏感路径（.env、secrets、credentials）已被阻止。",
		parameters: readSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { path, offset, limit } = params;
			const absolutePath = resolve(ctx.cwd, path);

			// Check if path is blocked
			if (isBlockedPath(absolutePath)) {
				await logAccess(absolutePath, false, "matches blocked pattern");
				return {
					content: [
						{
							type: "text",
							text: `访问被拒绝："${path}" 匹配到被阻止的模式（敏感文件）。此工具阻止对 .env 文件、secrets、credentials 以及 SSH/AWS/GPG 目录的访问。`,
						},
					],
					details: { blocked: true },
				};
			}

			// Log allowed access
			await logAccess(absolutePath, true);

			// Perform the actual read (simplified implementation)
			try {
				await access(absolutePath, constants.R_OK);
				const content = await readFile(absolutePath, "utf-8");
				const lines = content.split("\n");

				// Apply offset and limit
				const startLine = offset ? Math.max(0, offset - 1) : 0;
				const endLine = limit ? startLine + limit : lines.length;
				const selectedLines = lines.slice(startLine, endLine);

				// Basic truncation (50KB limit)
				let text = selectedLines.join("\n");
				const maxBytes = 50 * 1024;
				if (Buffer.byteLength(text, "utf-8") > maxBytes) {
					text = `${text.slice(0, maxBytes)}\n\n[输出以50KB截断]`;
				}

				return {
					content: [{ type: "text", text }] as TextContent[],
					details: { lines: lines.length },
				};
			} catch (error: any) {
				return {
					content: [{ type: "text", text: `读取文件错误：${error.message}` }] as TextContent[],
					details: { error: true },
				};
			}
		},

		// No renderCall/renderResult - uses built-in renderer automatically
		// (syntax highlighting, line numbers, truncation warnings, etc.)
	});

	// Also register a command to view the access log
	pi.registerCommand("read-log", {
		description: "查看文件访问日志",
		handler: async (_args, ctx) => {
			try {
				const log = readFileSync(LOG_FILE, "utf-8");
				const lines = log.trim().split("\n").slice(-20); // Last 20 entries
				ctx.ui.notify(`最近的文件访问：\n${lines.join("\n")}`, "info");
			} catch {
				ctx.ui.notify("未找到访问日志", "info");
			}
		},
	});
}
