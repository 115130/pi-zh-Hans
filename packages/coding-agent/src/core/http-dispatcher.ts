import * as undici from "undici";

export const DEFAULT_HTTP_IDLE_TIMEOUT_MS = 300_000;

export const HTTP_IDLE_TIMEOUT_CHOICES = [
	{ label: "30秒", timeoutMs: 30_000 },
	{ label: "1分钟", timeoutMs: 60_000 },
	{ label: "2分钟", timeoutMs: 120_000 },
	{ label: "5分钟", timeoutMs: 300_000 },
	{ label: "已禁用", timeoutMs: 0 },
] as const;

export function parseHttpIdleTimeoutMs(value: unknown): number | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.toLowerCase() === "disabled") {
			return 0;
		}
		if (trimmed.length === 0) {
			return undefined;
		}
		return parseHttpIdleTimeoutMs(Number(trimmed));
	}

	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return undefined;
	}
	return Math.floor(value);
}

export function formatHttpIdleTimeoutMs(timeoutMs: number): string {
	const choice = HTTP_IDLE_TIMEOUT_CHOICES.find((item) => item.timeoutMs === timeoutMs);
	if (choice) {
		return choice.label;
	}
	return `${timeoutMs / 1000} 秒`;
}

export function configureHttpDispatcher(timeoutMs: number = DEFAULT_HTTP_IDLE_TIMEOUT_MS): void {
	// Bun 内置 fetch 不支持 undici 全局调度器，跳过配置
	if (typeof (globalThis as any).Bun !== "undefined") {
		return;
	}
	const normalizedTimeoutMs = parseHttpIdleTimeoutMs(timeoutMs);
	if (normalizedTimeoutMs === undefined) {
		throw new Error(`无效的HTTP空闲超时：${String(timeoutMs)}`);
	}
	undici.setGlobalDispatcher(
		new undici.EnvHttpProxyAgent({
			allowH2: false,
			bodyTimeout: normalizedTimeoutMs,
			headersTimeout: normalizedTimeoutMs,
		}),
	);
	// Keep fetch and the dispatcher on the same undici implementation. Node 26.0's
	// bundled fetch can otherwise consume compressed responses through npm undici's
	// dispatcher without decompressing them, causing response.json() failures.
	undici.install?.();
}
