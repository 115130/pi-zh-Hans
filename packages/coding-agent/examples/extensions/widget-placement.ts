import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function widgetPlacementExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("widget-above", ["编辑器上方部件"]);
		ctx.ui.setWidget("widget-below", ["编辑器下方部件"], { placement: "belowEditor" });
	});
}
