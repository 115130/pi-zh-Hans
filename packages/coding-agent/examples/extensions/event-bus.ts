/**
 * 扩展间事件总线示例。
 *
 * 展示 pi.events 如何用于扩展间的通信。一个扩展可以发出事件，其他扩展监听这些事件。
 *
 * 使用方法：/emit [事件名称] [数据] - 在总线上发出事件
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// 存储 ctx 以供事件处理器使用
	let currentCtx: ExtensionContext | undefined;

	pi.on("session_start", async (_event, ctx) => {
		currentCtx = ctx;
	});

	// 监听来自其他扩展的事件
	pi.events.on("my:notification", (data) => {
		const { message, from } = data as { message: string; from: string };
		currentCtx?.ui.notify(`来自 ${from} 的事件：${message}`, "info");
	});

	// 发出事件的命令（发出 "my:notification"，由上面的监听器接收）
	pi.registerCommand("emit", {
		description: "发出 my:notification 事件（使用方法：/emit 消息内容）",
		handler: async (args, _ctx) => {
			const message = args.trim() || "hello";
			pi.events.emit("my:notification", { message, from: "/emit 命令" });
			// 上面的监听器将显示通知
		},
	});

	// 示例：在会话启动时发出事件
	pi.on("session_start", async () => {
		pi.events.emit("my:notification", {
			message: "会话已启动",
			from: "event-bus-example",
		});
	});
}
