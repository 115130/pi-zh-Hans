/**
 * 工作消息持久性测试
 *
 * 在会话启动时设置自定义工作消息和指示器，以便验证它们在加载器重新创建（例如在代理轮次之间）后依然保持不变。
 *
 * 用法：
 *   pi --extension examples/extensions/working-message-test.ts
 *
 * 然后在交互模式下发送几条消息。每次加载器出现时，工作消息应保持为“工作中... (自定义)”，并带有棕色圆点指示器，而不是恢复为默认的灰色“工作中...”。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CUSTOM_MESSAGE = "\x1b[38;2;155;86;63m工作中... (自定义)\x1b[39m";
const CUSTOM_INDICATOR = { frames: ["\x1b[38;2;155;86;63m●\x1b[39m"] };

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setWorkingMessage(CUSTOM_MESSAGE);
		ctx.ui.setWorkingIndicator(CUSTOM_INDICATOR);
	});
}
