/**
 * DOOM Overlay Demo - Play DOOM as an overlay
 *
 * Usage: pi --extension ./examples/extensions/doom-overlay
 *
 * Commands:
 *   /doom-overlay - Play DOOM in an overlay (Q to pause/exit)
 *
 * This demonstrates that overlays can handle real-time game rendering at 35 FPS.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DoomOverlayComponent } from "./doom-component.ts";
import { DoomEngine } from "./doom-engine.ts";
import { ensureWadFile } from "./wad-finder.ts";

// Persistent engine instance - survives between invocations
let activeEngine: DoomEngine | null = null;
let activeWadPath: string | null = null;

export default function (pi: ExtensionAPI) {
	pi.registerCommand("doom-overlay", {
		description: "以叠加层方式游玩 DOOM。按 Q 暂停或退出。",

		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("DOOM 需要交互模式", "error");
				return;
			}

			// Auto-download WAD if not present
			ctx.ui.notify("正在加载 DOOM...", "info");
			const wad = args?.trim() ? args.trim() : await ensureWadFile();

			if (!wad) {
				ctx.ui.notify("下载 DOOM WAD 文件失败。请检查网络连接。", "error");
				return;
			}

			try {
				// Reuse existing engine if same WAD, otherwise create new
				let isResume = false;
				if (activeEngine && activeWadPath === wad) {
					ctx.ui.notify("正在继续 DOOM...", "info");
					isResume = true;
				} else {
					ctx.ui.notify(`正在从 ${wad} 加载 DOOM...`, "info");
					activeEngine = new DoomEngine(wad);
					await activeEngine.init();
					activeWadPath = wad;
				}

				await ctx.ui.custom(
					(tui, _theme, _keybindings, done) => {
						return new DoomOverlayComponent(tui, activeEngine!, () => done(undefined), isResume);
					},
					{
						overlay: true,
						overlayOptions: {
							width: "75%",
							maxHeight: "95%",
							anchor: "center",
							margin: { top: 1 },
						},
					},
				);
			} catch (error) {
				ctx.ui.notify(`加载 DOOM 失败: ${error}`, "error");
				activeEngine = null;
				activeWadPath = null;
			}
		},
	});
}
