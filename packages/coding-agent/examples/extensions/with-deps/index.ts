/**
 * Example extension with its own npm dependencies.
 * Tests that jiti resolves modules from the extension's own node_modules.
 *
 * Requires: npm install in this directory
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import ms from "ms";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	// Register a tool that uses ms
	pi.registerTool({
		name: "parse_duration",
		label: "解析时长",
		description: "将人类可读的时长字符串（例如 '2 days'、'1h'、'5m'）解析为毫秒",
		parameters: Type.Object({
			duration: Type.String({ description: "时长字符串，如 '2 days'、'1h'、'5m'" }),
		}),
		execute: async (_toolCallId, params) => {
			const result = ms(params.duration as ms.StringValue);
			if (result === undefined) {
				throw new Error(`无效时长："${params.duration}"`);
			}
			return {
				content: [{ type: "text", text: `${params.duration} = ${result} 毫秒` }],
				details: {},
			};
		},
	});
}
