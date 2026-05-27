import { parentPort } from "node:worker_threads";
import { type ImageResizeOptions, type ResizedImage, resizeImageInProcess } from "./image-resize-core.ts";

interface ResizeImageWorkerRequest {
	inputBytes: Uint8Array;
	mimeType: string;
	options?: ImageResizeOptions;
}

interface ResizeImageWorkerResponse {
	result?: ResizedImage | null;
	error?: string;
}

function isResizeImageWorkerRequest(value: unknown): value is ResizeImageWorkerRequest {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return record.inputBytes instanceof Uint8Array && typeof record.mimeType === "string";
}

const port = parentPort;
if (!port) {
	throw new Error("图片缩放工作线程需要 parentPort");
}

port.once("message", (message: unknown) => {
	void (async () => {
		try {
			if (!isResizeImageWorkerRequest(message)) {
				throw new Error("无效的图片缩放工作线程请求");
			}
			const result = await resizeImageInProcess(message.inputBytes, message.mimeType, message.options);
			const response: ResizeImageWorkerResponse = { result };
			port.postMessage(response);
		} catch (error) {
			const response: ResizeImageWorkerResponse = {
				error: error instanceof Error ? error.message : String(error),
			};
			port.postMessage(response);
		}
	})();
});
