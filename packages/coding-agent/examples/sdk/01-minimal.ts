/**
 * 最小化 SDK 使用
 *
 * 使用所有默认设置：从当前工作目录和 ~/.pi/agent 发现技能、扩展、工具、上下文文件。
 * 根据设置或第一个可用模型选择模型。
 */

import { createAgentSession } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession();

try {
	session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
		}
	});

	await session.prompt("当前目录中有哪些文件？");
	session.state.messages.forEach((msg) => {
		console.log(msg);
	});
	console.log();
} finally {
	session.dispose();
}
