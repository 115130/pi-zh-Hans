/**
 * 工作指示器扩展
 *
 * 演示如何使用 `ctx.ui.setWorkingIndicator()` 自定义 pi 流式传输响应时显示的内联工作指示器。
 *
 * 用法：
 *   pi --extension examples/extensions/working-indicator.ts
 *
 * 命令：
 *   /working-indicator           显示当前模式
 *   /working-indicator dot       使用静态圆点指示器
 *   /working-indicator pulse     使用自定义动画指示器
 *   /working-indicator none      完全隐藏指示器
 *   /working-indicator spinner   恢复动画旋转指示器
 *   /working-indicator reset     恢复 pi 的默认指示器
 */

import type { ExtensionAPI, ExtensionContext, WorkingIndicatorOptions } from "@earendil-works/pi-coding-agent";

type WorkingIndicatorMode = "dot" | "none" | "pulse" | "spinner" | "default";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const PASTEL_RAINBOW = [
	"\x1b[38;2;255;179;186m",
	"\x1b[38;2;255;223;186m",
	"\x1b[38;2;255;255;186m",
	"\x1b[38;2;186;255;201m",
	"\x1b[38;2;186;225;255m",
	"\x1b[38;2;218;186;255m",
];
const RESET_FG = "\x1b[39m";
const HIDDEN_INDICATOR: WorkingIndicatorOptions = {
	frames: [],
};

function colorize(text: string, color: string): string {
	return `${color}${text}${RESET_FG}`;
}

function getIndicator(mode: WorkingIndicatorMode): WorkingIndicatorOptions | undefined {
	switch (mode) {
		case "dot":
			return {
				frames: [colorize("●", PASTEL_RAINBOW[0])],
			};
		case "none":
			return HIDDEN_INDICATOR;
		case "pulse":
			return {
				frames: [
					colorize("·", PASTEL_RAINBOW[0]),
					colorize("•", PASTEL_RAINBOW[2]),
					colorize("●", PASTEL_RAINBOW[4]),
					colorize("•", PASTEL_RAINBOW[5]),
				],
				intervalMs: 120,
			};
		case "spinner":
			return {
				frames: SPINNER_FRAMES.map((frame, index) =>
					colorize(frame, PASTEL_RAINBOW[index % PASTEL_RAINBOW.length]!),
				),
				intervalMs: 80,
			};
		case "default":
			return undefined;
	}
}

function describeMode(mode: WorkingIndicatorMode): string {
	switch (mode) {
		case "dot":
			return "静态圆点";
		case "none":
			return "隐藏";
		case "pulse":
			return "自定义脉冲";
		case "spinner":
			return "自定义旋转";
		case "default":
			return "pi 默认旋转";
	}
}

export default function (pi: ExtensionAPI) {
	let mode: WorkingIndicatorMode = "spinner";

	const applyIndicator = (ctx: ExtensionContext) => {
		ctx.ui.setWorkingIndicator(getIndicator(mode));
		ctx.ui.setStatus("working-indicator", ctx.ui.theme.fg("dim", `指示器：${describeMode(mode)}`));
	};

	pi.on("session_start", async (_event, ctx) => {
		applyIndicator(ctx);
	});

	pi.registerCommand("working-indicator", {
		description: "设置流式传输工作指示器：dot、pulse、none、spinner 或 reset。",
		handler: async (args, ctx) => {
			const nextMode = args.trim().toLowerCase();
			if (!nextMode) {
				ctx.ui.notify(`工作指示器：${describeMode(mode)}`, "info");
				return;
			}

			if (
				nextMode !== "dot" &&
				nextMode !== "none" &&
				nextMode !== "pulse" &&
				nextMode !== "spinner" &&
				nextMode !== "reset"
			) {
				ctx.ui.notify("用法：/working-indicator [dot|pulse|none|spinner|reset]", "error");
				return;
			}

			mode = nextMode === "reset" ? "default" : nextMode;
			applyIndicator(ctx);
			ctx.ui.notify(`工作指示器已设置为：${describeMode(mode)}`, "info");
		},
	});
}
