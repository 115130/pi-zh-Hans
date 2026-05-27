import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 获取打包的 WAD 路径（相对于此模块）
const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_WAD = join(__dirname, "doom1.wad");
const WAD_URL = "https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad";

const DEFAULT_WAD_PATHS = ["./doom1.wad", "./DOOM1.WAD", "~/doom1.wad", "~/.doom/doom1.wad"];

export function findWadFile(customPath?: string): string | null {
	if (customPath) {
		const resolved = resolve(customPath.replace(/^~/, process.env.HOME || ""));
		if (existsSync(resolved)) return resolved;
		return null;
	}

	// 先检查打包的 WAD
	if (existsSync(BUNDLED_WAD)) {
		return BUNDLED_WAD;
	}

	// 回退到默认路径
	for (const p of DEFAULT_WAD_PATHS) {
		const resolved = resolve(p.replace(/^~/, process.env.HOME || ""));
		if (existsSync(resolved)) return resolved;
	}

	return null;
}

/** 如果共享版 WAD 不存在则下载。成功返回路径，失败返回 null。 */
export async function ensureWadFile(): Promise<string | null> {
	// 检查是否已存在
	const existing = findWadFile();
	if (existing) return existing;

	// 下载到打包位置
	try {
		const response = await fetch(WAD_URL);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const buffer = await response.arrayBuffer();
		writeFileSync(BUNDLED_WAD, Buffer.from(buffer));
		return BUNDLED_WAD;
	} catch {
		return null;
	}
}
