/**
 * RPC 扩展 UI 演示
 *
 * 为练习所有 RPC 支持的扩展 UI 方法而构建的扩展。
 * 设计为与 rpc-extension-ui-example.ts 脚本一起加载，
 * 以演示完整的扩展 UI 协议。
 *
 * 练习的 UI 方法：
 * - select() - 对危险 bash 命令的 tool_call 触发
 * - confirm() - 在 session_before_switch 触发
 * - input() - 通过 /rpc-input 命令触发
 * - editor() - 通过 /rpc-editor 命令触发
 * - notify() - 每个对话框完成后触发
 * - setStatus() - 在 turn_start/turn_end 触发
 * - setWidget() - 在 session_start 触发
 * - setTitle() - 在 session_start 触发
 * - setEditorText() - 通过 /rpc-prefill 命令触发
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let turnCount = 0;

	// -- setTitle, setWidget, setStatus on session lifecycle --

	pi.on("session_start", async (event, ctx) => {
		ctx.ui.setTitle(event.reason === "new" ? "pi RPC 演示 (新会话)" : "pi RPC 演示");
		ctx.ui.setWidget("rpc-demo", ["--- RPC 扩展 UI 演示 ---", "已加载并准备就绪。"]);
		ctx.ui.setStatus("rpc-demo", `回合数: ${turnCount}`);
	});

	// -- setStatus on turn lifecycle --

	pi.on("turn_start", async (_event, ctx) => {
		turnCount++;
		ctx.ui.setStatus("rpc-demo", `第 ${turnCount} 回合执行中...`);
	});

	pi.on("turn_end", async (_event, ctx) => {
		ctx.ui.setStatus("rpc-demo", `第 ${turnCount} 回合完成`);
	});

	// -- select on dangerous tool calls --

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;
		const isDangerous = /\brm\s+(-rf?|--recursive)/i.test(command) || /\bsudo\b/i.test(command);

		if (isDangerous) {
			if (!ctx.hasUI) {
				return { block: true, reason: "危险命令已屏蔽 (无 UI)" };
			}

			const choice = await ctx.ui.select(`危险命令: ${command}`, ["允许", "屏蔽"]);
			if (choice !== "允许") {
				ctx.ui.notify("用户已屏蔽命令", "warning");
				return { block: true, reason: "用户已屏蔽" };
			}
			ctx.ui.notify("命令已允许", "info");
		}

		return undefined;
	});

	// -- confirm on session clear --

	pi.on("session_before_switch", async (event, ctx) => {
		if (event.reason !== "new") return;
		if (!ctx.hasUI) return;

		const confirmed = await ctx.ui.confirm("清除会话？", "所有消息将丢失。");
		if (!confirmed) {
			ctx.ui.notify("清除已取消", "info");
			return { cancel: true };
		}
	});

	// -- input via command --

	pi.registerCommand("rpc-input", {
		description: "提示输入文本 (演示 RPC 中的 ctx.ui.input)",
		handler: async (_args, ctx) => {
			const value = await ctx.ui.input("输入一个值", "在此输入...");
			if (value) {
				ctx.ui.notify(`您输入了: ${value}`, "info");
			} else {
				ctx.ui.notify("输入已取消", "info");
			}
		},
	});

	// -- editor via command --

	pi.registerCommand("rpc-editor", {
		description: "打开多行编辑器 (演示 RPC 中的 ctx.ui.editor)",
		handler: async (_args, ctx) => {
			const text = await ctx.ui.editor("编辑一些文本", "第1行\n第2行\n第3行");
			if (text) {
				ctx.ui.notify(`编辑器已提交 (${text.split("\n").length} 行)`, "info");
			} else {
				ctx.ui.notify("编辑器已取消", "info");
			}
		},
	});

	// -- setEditorText via command --

	pi.registerCommand("rpc-prefill", {
		description: "预填输入编辑器 (演示 RPC 中的 ctx.ui.setEditorText)",
		handler: async (_args, ctx) => {
			ctx.ui.setEditorText("此文本由 rpc-demo 扩展设置。");
			ctx.ui.notify("编辑器已预填", "info");
		},
	});
}
