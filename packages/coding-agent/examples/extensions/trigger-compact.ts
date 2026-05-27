import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const COMPACT_THRESHOLD_TOKENS = 100_000;

export default function (pi: ExtensionAPI) {
	let previousTokens: number | null | undefined;

	const triggerCompaction = (ctx: ExtensionContext, customInstructions?: string) => {
		if (ctx.hasUI) {
			ctx.ui.notify("压缩已启动", "info");
		}
		ctx.compact({
			customInstructions,
			onComplete: () => {
				if (ctx.hasUI) {
					ctx.ui.notify("压缩已完成", "info");
				}
			},
			onError: (error) => {
				if (ctx.hasUI) {
					ctx.ui.notify(`压缩失败：${error.message}`, "error");
				}
			},
		});
	};

	pi.on("turn_end", (_event, ctx) => {
		const usage = ctx.getContextUsage();
		const currentTokens = usage?.tokens ?? null;
		if (currentTokens === null) {
			return;
		}

		const crossedThreshold =
			previousTokens !== undefined && previousTokens !== null && previousTokens <= COMPACT_THRESHOLD_TOKENS;
		previousTokens = currentTokens;
		if (!crossedThreshold || currentTokens <= COMPACT_THRESHOLD_TOKENS) {
			return;
		}
		triggerCompaction(ctx);
	});

	pi.registerCommand("trigger-compact", {
		description: "立即触发压缩",
		handler: async (args, ctx) => {
			const instructions = args.trim() || undefined;
			triggerCompaction(ctx, instructions);
		},
	});
}
