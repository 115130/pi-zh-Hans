/**
 * Custom Model Selection
 *
 * Shows how to select a specific model and thinking level.
 */

import { getModel } from "@earendil-works/pi-ai";
import { AuthStorage, createAgentSession, ModelRegistry } from "@earendil-works/pi-coding-agent";

// Set up auth storage and model registry
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

// Option 1: Find a specific built-in model by provider/id
const opus = getModel("anthropic", "claude-opus-4-5");
if (opus) {
	console.log(`发现模型：${opus.provider}/${opus.id}`);
}

// Option 2: Find model via registry (includes custom models from models.json)
const customModel = modelRegistry.find("my-provider", "my-model");
if (customModel) {
	console.log(`发现自定义模型：${customModel.provider}/${customModel.id}`);
}

// Option 3: Pick from available models (have valid API keys)
const available = await modelRegistry.getAvailable();
console.log(
	"可用模型：",
	available.map((m) => `${m.provider}/${m.id}`),
);

if (available.length > 0) {
	const { session } = await createAgentSession({
		model: available[0],
		thinkingLevel: "medium", // off, low, medium, high
		authStorage,
		modelRegistry,
	});

	try {
		session.subscribe((event) => {
			if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
				process.stdout.write(event.assistantMessageEvent.delta);
			}
		});

		await session.prompt("用一句话说你好。");
		console.log();
	} finally {
		session.dispose();
	}
}
