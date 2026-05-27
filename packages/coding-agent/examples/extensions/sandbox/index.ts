/**
 * 沙盒扩展 - bash 命令的 OS 级沙盒
 *
 * 使用 @anthropic-ai/sandbox-runtime 对 bash 命令在操作系统级别执行文件系统和网络限制
 * （macOS 上为 sandbox-exec，Linux 上为 bubblewrap）
 *
 * 注意：此示例故意覆盖内置的 `bash` 工具，以展示如何替换内置工具。
 * 或者，您也可以通过 `tool_call` 输入突变对 `bash` 实施沙盒，而无需替换该工具。
 *
 * 配置文件（合并，项目优先级更高）：
 * - ~/.pi/agent/extensions/sandbox.json（全局）
 * - <cwd>/.pi/sandbox.json（项目本地）
 *
 * 示例 .pi/sandbox.json：
 * ```json
 * {
 *   "enabled": true,
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * 用法：
 * - `pi -e ./sandbox` - 使用默认/配置设置启用沙盒
 * - `pi -e ./sandbox --no-sandbox` - 禁用沙盒
 * - `/sandbox` - 显示当前沙盒配置
 *
 * 安装：
 * 1. 将 sandbox/ 目录复制到 ~/.pi/agent/extensions/
 * 2. 在 ~/.pi/agent/extensions/sandbox/ 中运行 `npm install`
 *
 * Linux 还需要：bubblewrap, socat, ripgrep
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SandboxManager, type SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type BashOperations, createBashTool, getAgentDir } from "@earendil-works/pi-coding-agent";

interface SandboxConfig extends SandboxRuntimeConfig {
	enabled?: boolean;
}

const DEFAULT_CONFIG: SandboxConfig = {
	enabled: true,
	network: {
		allowedDomains: [
			"npmjs.org",
			"*.npmjs.org",
			"registry.npmjs.org",
			"registry.yarnpkg.com",
			"pypi.org",
			"*.pypi.org",
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
		],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
		allowWrite: [".", "/tmp"],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

function loadConfig(cwd: string): SandboxConfig {
	const projectConfigPath = join(cwd, ".pi", "sandbox.json");
	const globalConfigPath = join(getAgentDir(), "extensions", "sandbox.json");

	let globalConfig: Partial<SandboxConfig> = {};
	let projectConfig: Partial<SandboxConfig> = {};

	if (existsSync(globalConfigPath)) {
		try {
			globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
		} catch (e) {
			console.error(`警告：无法解析 ${globalConfigPath}：${e}`);
		}
	}

	if (existsSync(projectConfigPath)) {
		try {
			projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
		} catch (e) {
			console.error(`警告：无法解析 ${projectConfigPath}：${e}`);
		}
	}

	return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
	const result: SandboxConfig = { ...base };

	if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
	if (overrides.network) {
		result.network = { ...base.network, ...overrides.network };
	}
	if (overrides.filesystem) {
		result.filesystem = { ...base.filesystem, ...overrides.filesystem };
	}

	const extOverrides = overrides as {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	};
	const extResult = result as { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean };

	if (extOverrides.ignoreViolations) {
		extResult.ignoreViolations = extOverrides.ignoreViolations;
	}
	if (extOverrides.enableWeakerNestedSandbox !== undefined) {
		extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox;
	}

	return result;
}

function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`工作目录不存在：${cwd}`);
			}

			const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("no-sandbox", {
		description: "禁用 bash 命令的 OS 级沙盒",
		type: "boolean",
		default: false,
	});

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	let sandboxEnabled = false;
	let sandboxInitialized = false;

	pi.registerTool({
		...localBash,
		label: "bash（沙盒化）",
		async execute(id, params, signal, onUpdate, _ctx) {
			if (!sandboxEnabled || !sandboxInitialized) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const sandboxedBash = createBashTool(localCwd, {
				operations: createSandboxedBashOps(),
			});
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("user_bash", () => {
		if (!sandboxEnabled || !sandboxInitialized) return;
		return { operations: createSandboxedBashOps() };
	});

	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		if (noSandbox) {
			sandboxEnabled = false;
			ctx.ui.notify("已通过 --no-sandbox 禁用沙盒", "warning");
			return;
		}

		const config = loadConfig(ctx.cwd);

		if (!config.enabled) {
			sandboxEnabled = false;
			ctx.ui.notify("已通过配置禁用沙盒", "info");
			return;
		}

		const platform = process.platform;
		if (platform !== "darwin" && platform !== "linux") {
			sandboxEnabled = false;
			ctx.ui.notify(`沙盒在 ${platform} 上不受支持`, "warning");
			return;
		}

		try {
			const configExt = config as unknown as {
				ignoreViolations?: Record<string, string[]>;
				enableWeakerNestedSandbox?: boolean;
			};

			await SandboxManager.initialize({
				network: config.network,
				filesystem: config.filesystem,
				ignoreViolations: configExt.ignoreViolations,
				enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
			});

			sandboxEnabled = true;
			sandboxInitialized = true;

			const networkCount = config.network?.allowedDomains?.length ?? 0;
			const writeCount = config.filesystem?.allowWrite?.length ?? 0;
			ctx.ui.setStatus(
				"sandbox",
				ctx.ui.theme.fg("accent", `🔒 沙盒：${networkCount} 个域名，${writeCount} 个写入路径`),
			);
			ctx.ui.notify("沙盒已初始化", "info");
		} catch (err) {
			sandboxEnabled = false;
			ctx.ui.notify(`沙盒初始化失败：${err instanceof Error ? err.message : err}`, "error");
		}
	});

	pi.on("session_shutdown", async () => {
		if (sandboxInitialized) {
			try {
				await SandboxManager.reset();
			} catch {
				// 忽略清理错误
			}
		}
	});

	pi.registerCommand("sandbox", {
		description: "显示沙盒配置",
		handler: async (_args, ctx) => {
			if (!sandboxEnabled) {
				ctx.ui.notify("沙盒已禁用", "info");
				return;
			}

			const config = loadConfig(ctx.cwd);
			const lines = [
				"沙盒配置：",
				"",
				"网络：",
				`  允许：${config.network?.allowedDomains?.join(", ") || "（无）"}`,
				`  拒绝：${config.network?.deniedDomains?.join(", ") || "（无）"}`,
				"",
				"文件系统：",
				`  拒绝读取：${config.filesystem?.denyRead?.join(", ") || "（无）"}`,
				`  允许写入：${config.filesystem?.allowWrite?.join(", ") || "（无）"}`,
				`  拒绝写入：${config.filesystem?.denyWrite?.join(", ") || "（无）"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
