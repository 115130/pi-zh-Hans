/**
 * Photon 图像处理封装。
 *
 * 该模块提供了对 @silvia-odwyer/photon-node 的统一接口，适用于：
 * 1. Node.js（开发环境，npm run build）
 * 2. Bun 编译二进制（独立分发）
 *
 * 问题：photon-node 的 CJS 入口使用 fs.readFileSync(__dirname + '/photon_rs_bg.wasm')，
 * 这会在 Bun 编译二进制中硬编码构建机器的绝对路径。
 *
 * 解决方案：
 * 1. 修补 fs.readFileSync，将缺失的 photon_rs_bg.wasm 读取重定向
 * 2. 在 build:binary 时将 photon_rs_bg.wasm 复制到可执行文件旁边
 */

import type { PathOrFileDescriptor } from "fs";
import { createRequire } from "module";
import * as path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const fs = require("fs") as typeof import("fs");

// 重新导出主包的类型
export type { PhotonImage as PhotonImageType } from "@silvia-odwyer/photon-node";

type ReadFileSync = typeof fs.readFileSync;

const WASM_FILENAME = "photon_rs_bg.wasm";

// 惰性加载的 photon 模块
let photonModule: typeof import("@silvia-odwyer/photon-node") | null = null;
let loadPromise: Promise<typeof import("@silvia-odwyer/photon-node") | null> | null = null;

function pathOrNull(file: PathOrFileDescriptor): string | null {
	if (typeof file === "string") {
		return file;
	}
	if (file instanceof URL) {
		return fileURLToPath(file);
	}
	return null;
}

function getFallbackWasmPaths(): string[] {
	const execDir = path.dirname(process.execPath);
	return [
		path.join(execDir, WASM_FILENAME),
		path.join(execDir, "photon", WASM_FILENAME),
		path.join(process.cwd(), WASM_FILENAME),
	];
}

function patchPhotonWasmRead(): () => void {
	const originalReadFileSync: ReadFileSync = fs.readFileSync.bind(fs);
	const fallbackPaths = getFallbackWasmPaths();
	const mutableFs = fs as { readFileSync: ReadFileSync };

	const patchedReadFileSync: ReadFileSync = ((...args: Parameters<ReadFileSync>) => {
		const [file, options] = args;
		const resolvedPath = pathOrNull(file);

		if (resolvedPath?.endsWith(WASM_FILENAME)) {
			try {
				return originalReadFileSync(...args);
			} catch (error) {
				const err = error as NodeJS.ErrnoException;
				if (err?.code && err.code !== "ENOENT") {
					throw error;
				}

				for (const fallbackPath of fallbackPaths) {
					if (!fs.existsSync(fallbackPath)) {
						continue;
					}
					if (options === undefined) {
						return originalReadFileSync(fallbackPath);
					}
					return originalReadFileSync(fallbackPath, options);
				}

				// 最后兜底：从内嵌二进制读 WASM
				const embeddedWasmBase64 = (globalThis as any).__EMBEDDED_WASM_BASE64__ as string | undefined;
				if (embeddedWasmBase64) {
					const buf = Buffer.from(embeddedWasmBase64, "base64");
					if (options === undefined || options === null) {
						return buf;
					}
					if (typeof options === "string") {
						return buf.toString(options as BufferEncoding);
					}
					if (typeof options === "object" && options.encoding) {
						return buf.toString(options.encoding as BufferEncoding);
					}
					return buf;
				}

				throw error;
			}
		}

		return originalReadFileSync(...args);
	}) as ReadFileSync;

	try {
		mutableFs.readFileSync = patchedReadFileSync;
	} catch {
		Object.defineProperty(fs, "readFileSync", {
			value: patchedReadFileSync,
			writable: true,
			configurable: true,
		});
	}

	return () => {
		try {
			mutableFs.readFileSync = originalReadFileSync;
		} catch {
			Object.defineProperty(fs, "readFileSync", {
				value: originalReadFileSync,
				writable: true,
				configurable: true,
			});
		}
	};
}

/**
 * 异步加载 photon 模块。
 * 后续调用将返回缓存模块。
 */
export async function loadPhoton(): Promise<typeof import("@silvia-odwyer/photon-node") | null> {
	if (photonModule) {
		return photonModule;
	}

	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = (async () => {
		const restoreReadFileSync = patchPhotonWasmRead();
		try {
			photonModule = await import("@silvia-odwyer/photon-node");
			return photonModule;
		} catch {
			photonModule = null;
			return photonModule;
		} finally {
			restoreReadFileSync();
		}
	})();

	return loadPromise;
}
