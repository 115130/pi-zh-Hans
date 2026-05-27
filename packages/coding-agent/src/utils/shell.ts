import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { spawn, spawnSync } from "child_process";
import { getBinDir } from "../config.ts";

export interface ShellConfig {
	shell: string;
	args: string[];
}

/**
 * 在 PATH 中查找 bash 可执行文件（跨平台）
 */
function findBashOnPath(): string | null {
	if (process.platform === "win32") {
		// Windows: 使用 'where' 并验证文件是否存在（where 可能返回不存在的路径）
		try {
			const result = spawnSync("where", ["bash.exe"], {
				encoding: "utf-8",
				timeout: 5000,
				windowsHide: true,
			});
			if (result.status === 0 && result.stdout) {
				const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
				if (firstMatch && existsSync(firstMatch)) {
					return firstMatch;
				}
			}
		} catch {
			// 忽略错误
		}
		return null;
	}

	// Unix: 使用 'which' 并信任其输出（处理 Termux 和特殊文件系统）
	try {
		const result = spawnSync("which", ["bash"], { encoding: "utf-8", timeout: 5000 });
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch) {
				return firstMatch;
			}
		}
	} catch {
		// 忽略错误
	}
	return null;
}

/**
 * 根据平台和可选的显式 shell 路径解析 shell 配置。
 * 解析顺序：
 * 1. 用户指定的 shellPath
 * 2. Windows 上：已知位置的 Git Bash，然后是 PATH 上的 bash
 * 3. Unix 上：/bin/bash，然后是 PATH 上的 bash，最后回退到 sh
 */
export function getShellConfig(customShellPath?: string): ShellConfig {
	// 1. 检查用户指定的 shell 路径
	if (customShellPath) {
		if (existsSync(customShellPath)) {
			return { shell: customShellPath, args: ["-c"] };
		}
		throw new Error(`未找到自定义 shell 路径: ${customShellPath}`);
	}

	if (process.platform === "win32") {
		// 2. 尝试已知位置的 Git Bash
		const paths: string[] = [];
		const programFiles = process.env.ProgramFiles;
		if (programFiles) {
			paths.push(`${programFiles}\\Git\\bin\\bash.exe`);
		}
		const programFilesX86 = process.env["ProgramFiles(x86)"];
		if (programFilesX86) {
			paths.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
		}

		for (const path of paths) {
			if (existsSync(path)) {
				return { shell: path, args: ["-c"] };
			}
		}

		// 3. 回退：在 PATH 上搜索 bash.exe（Cygwin、MSYS2、WSL 等）
		const bashOnPath = findBashOnPath();
		if (bashOnPath) {
			return { shell: bashOnPath, args: ["-c"] };
		}

		throw new Error(
			`未找到 bash  shell。可选方案:\n` +
				`  1. 安装 Git for Windows: https://git-scm.com/download/win\n` +
				`  2. 将你的 bash 添加到 PATH 环境变量 (Cygwin, MSYS2, 等)\n` +
				"  3. 在 settings.json 中设置 shellPath\n\n" +
				`已搜索 Git Bash 位于:\n${paths.map((p) => `  ${p}`).join("\n")}`,
		);
	}

	// Unix: 尝试 /bin/bash，然后 PATH 上的 bash，最后回退到 sh
	if (existsSync("/bin/bash")) {
		return { shell: "/bin/bash", args: ["-c"] };
	}

	const bashOnPath = findBashOnPath();
	if (bashOnPath) {
		return { shell: bashOnPath, args: ["-c"] };
	}

	return { shell: "sh", args: ["-c"] };
}

export function getShellEnv(): NodeJS.ProcessEnv {
	const binDir = getBinDir();
	const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
	const currentPath = process.env[pathKey] ?? "";
	const pathEntries = currentPath.split(delimiter).filter(Boolean);
	const hasBinDir = pathEntries.includes(binDir);
	const updatedPath = hasBinDir ? currentPath : [binDir, currentPath].filter(Boolean).join(delimiter);

	return {
		...process.env,
		[pathKey]: updatedPath,
	};
}

/**
 * 清理二进制输出以供显示/存储。
 * 移除会导致 string-width 崩溃或显示异常的字符：
 * - 控制字符（制表符、换行符、回车符除外）
 * - 单独代理项
 * - Unicode 格式字符（由于 bug 导致 string-width 崩溃）
 * - 未定义码点的字符
 */
export function sanitizeBinaryOutput(str: string): string {
	// 使用 Array.from 正确迭代码点（而非码元）
	// 这可以正确处理代理对，并捕获 codePointAt() 可能返回 undefined 的边缘情况
	return Array.from(str)
		.filter((char) => {
			// 过滤掉会导致 string-width 崩溃的字符
			// 包括：
			// - Unicode 格式字符
			// - 单独代理项（已被 Array.from 过滤）
			// - 除 \t \n \r 外的控制字符
			// - 码点未定义的字符

			const code = char.codePointAt(0);

			// 如果码点未定义则跳过（无效字符串的边缘情况）
			if (code === undefined) return false;

			// 允许制表符、换行符、回车符
			if (code === 0x09 || code === 0x0a || code === 0x0d) return true;

			// 过滤掉控制字符（0x00-0x1F，除了 0x09、0x0a、0x0d）
			if (code <= 0x1f) return false;

			// 过滤掉 Unicode 格式字符
			if (code >= 0xfff9 && code <= 0xfffb) return false;

			return true;
		})
		.join("");
}

/**
 * 必须跟踪分离的子进程，以便在父进程关闭信号（SIGHUP/SIGTERM）时杀死它们。
 */
const trackedDetachedChildPids = new Set<number>();

export function trackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.add(pid);
}

export function untrackDetachedChildPid(pid: number): void {
	trackedDetachedChildPids.delete(pid);
}

export function killTrackedDetachedChildren(): void {
	for (const pid of trackedDetachedChildPids) {
		killProcessTree(pid);
	}
	trackedDetachedChildPids.clear();
}

/**
 * 杀死进程及其所有子进程（跨平台）
 */
export function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		// 在 Windows 上使用 taskkill 杀死进程树
		try {
			spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
				stdio: "ignore",
				detached: true,
				windowsHide: true,
			});
		} catch {
			// 忽略 taskkill 失败的错误
		}
	} else {
		// 在 Unix/Linux/Mac 上使用 SIGKILL
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// 如果进程组杀死失败，回退到仅杀死子进程
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// 进程已死
			}
		}
	}
}
