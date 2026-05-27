import { Worker } from "node:worker_threads";
import { type ImageResizeOptions, type ResizedImage, resizeImageInProcess } from "./image-resize-core.ts";

export type { ImageResizeOptions, ResizedImage } from "./image-resize-core.ts";

interface ResizeImageWorkerResponse {
	result?: ResizedImage | null;
	error?: string;
}

function toTransferableBytes(input: Uint8Array): Uint8Array<ArrayBuffer> {
	// 传输会分离缓冲区，因此传输一个工作线程拥有的副本，保持调用方的字节不变。
	return new Uint8Array(input);
}

function isResizeImageWorkerResponse(value: unknown): value is ResizeImageWorkerResponse {
	return value !== null && typeof value === "object";
}

function createResizeWorker(workerSpecifier: string | URL): Worker {
	return new Worker(workerSpecifier);
}

async function resizeImageInWorker(
	workerSpecifier: string | URL,
	inputBytes: Uint8Array,
	mimeType: string,
	options?: ImageResizeOptions,
): Promise<ResizedImage | null> {
	const worker = createResizeWorker(workerSpecifier);
	try {
		const inputBytesForWorker = toTransferableBytes(inputBytes);
		return await new Promise<ResizedImage | null>((resolve, reject) => {
			let settled = false;
			const settle = (result: ResizedImage | null): void => {
				if (settled) return;
				settled = true;
				resolve(result);
			};
			const fail = (error: Error): void => {
				if (settled) return;
				settled = true;
				reject(error);
			};

			worker.once("message", (message: unknown) => {
				if (!isResizeImageWorkerResponse(message)) {
					fail(new Error("无效的图像调整大小工作线程响应"));
					return;
				}
				if (message.error) {
					fail(new Error(message.error));
					return;
				}
				settle(message.result ?? null);
			});
			worker.once("error", fail);
			worker.once("exit", (code) => {
				if (!settled) {
					fail(new Error(`图像调整大小工作线程以代码 ${code} 退出`));
				}
			});
			worker.postMessage(
				{
					inputBytes: inputBytesForWorker,
					mimeType,
					options,
				},
				[inputBytesForWorker.buffer],
			);
		});
	} finally {
		void worker.terminate().catch(() => undefined);
	}
}

/**
 * 将图像调整到指定的最大尺寸和编码文件大小内。
 * 在工作线程中运行 Photon，使得 WASM 解码、调整大小和编码不会阻塞 TUI 事件循环。
 * 如果无法加载工作线程（例如在某些 Bun 编译的可执行文件布局中），则回退到进程内调整大小，
 * 以确保图像读取仍然有效。
 */
export async function resizeImage(
	inputBytes: Uint8Array,
	mimeType: string,
	options?: ImageResizeOptions,
): Promise<ResizedImage | null> {
	const isTypeScriptRuntime = import.meta.url.endsWith(".ts");
	const workerUrl = new URL(
		isTypeScriptRuntime ? "./image-resize-worker.ts" : "./image-resize-worker.js",
		import.meta.url,
	);

	// Bun 编译的可执行文件通过字符串路径解析工作线程入口点，而不是通过
	// new URL(..., import.meta.url)。在 Bun 下先尝试字符串路径，
	// 这样发布版本就能使用内嵌的工作线程，而不是回退到进程内处理。
	if (typeof process.versions.bun === "string") {
		try {
			return await resizeImageInWorker("./src/utils/image-resize-worker.ts", inputBytes, mimeType, options);
		} catch {}
	}

	try {
		return await resizeImageInWorker(workerUrl, inputBytes, mimeType, options);
	} catch {
		return resizeImageInProcess(inputBytes, mimeType, options);
	}
}

/**
 * 格式化已调整大小图像的尺寸说明。
 * 这有助于模型理解坐标映射关系。
 */
export function formatDimensionNote(result: ResizedImage): string | undefined {
	if (!result.wasResized) {
		return undefined;
	}

	const scale = result.originalWidth / result.width;
	return `[图片：原始 ${result.originalWidth}x${result.originalHeight}，显示为 ${result.width}x${result.height}。将坐标乘以 ${scale.toFixed(2)} 映射到原始图片。]`;
}
