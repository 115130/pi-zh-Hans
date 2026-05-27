#!/usr/bin/env node
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { getOAuthProvider, getOAuthProviders } from "./utils/oauth/index.ts";
import type { OAuthCredentials, OAuthProviderId } from "./utils/oauth/types.ts";

const AUTH_FILE = "auth.json";
const PROVIDERS = getOAuthProviders();

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
	return new Promise((resolve) => rl.question(question, resolve));
}

function loadAuth(): Record<string, { type: "oauth" } & OAuthCredentials> {
	if (!existsSync(AUTH_FILE)) return {};
	try {
		return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
	} catch {
		return {};
	}
}

function saveAuth(auth: Record<string, { type: "oauth" } & OAuthCredentials>): void {
	writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), "utf-8");
}

async function login(providerId: OAuthProviderId): Promise<void> {
	const provider = getOAuthProvider(providerId);
	if (!provider) {
		console.error(`未知的提供者: ${providerId}`);
		process.exit(1);
	}

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const promptFn = (msg: string) => prompt(rl, `${msg} `);

	try {
		const credentials = await provider.login({
			onAuth: (info) => {
				console.log(`\n请在你的浏览器中打开此 URL:\n${info.url}`);
				if (info.instructions) console.log(info.instructions);
				console.log();
			},
			onDeviceCode: (info) => {
				console.log(`\n请在你的浏览器中打开此 URL:\n${info.verificationUri}`);
				console.log(`输入代码: ${info.userCode}`);
				console.log();
			},
			onPrompt: async (p) => {
				return await promptFn(`${p.message}${p.placeholder ? ` (${p.placeholder})` : ""}:`);
			},
			onSelect: async (p) => {
				console.log(`\n${p.message}`);
				for (let i = 0; i < p.options.length; i++) {
					console.log(`  ${i + 1}. ${p.options[i].label}`);
				}
				const choice = await promptFn(`输入数字 (1-${p.options.length}):`);
				const index = parseInt(choice, 10) - 1;
				return p.options[index]?.id;
			},
			onProgress: (msg) => console.log(msg),
		});

		const auth = loadAuth();
		auth[providerId] = { type: "oauth", ...credentials };
		saveAuth(auth);

		console.log(`\n凭据已保存到 ${AUTH_FILE}`);
	} finally {
		rl.close();
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const command = args[0];

	if (!command || command === "help" || command === "--help" || command === "-h") {
		const providerList = PROVIDERS.map((p) => `  ${p.id.padEnd(20)} ${p.name}`).join("\n");
		console.log(`用法: npx @earendil-works/pi-ai <command> [provider]

命令:
  login [provider]  登录到 OAuth 提供者
  list              列出可用的提供者

提供者:
${providerList}

示例:
  npx @earendil-works/pi-ai login              # 交互式选择提供者
  npx @earendil-works/pi-ai login anthropic    # 登录到特定提供者
  npx @earendil-works/pi-ai list               # 列出提供者
`);
		return;
	}

	if (command === "list") {
		console.log("可用的 OAuth 提供者:\n");
		for (const p of PROVIDERS) {
			console.log(`  ${p.id.padEnd(20)} ${p.name}`);
		}
		return;
	}

	if (command === "login") {
		let provider = args[1] as OAuthProviderId | undefined;

		if (!provider) {
			const rl = createInterface({ input: process.stdin, output: process.stdout });
			console.log("选择一个提供者:\n");
			for (let i = 0; i < PROVIDERS.length; i++) {
				console.log(`  ${i + 1}. ${PROVIDERS[i].name}`);
			}
			console.log();

			const choice = await prompt(rl, `输入数字 (1-${PROVIDERS.length}): `);
			rl.close();

			const index = parseInt(choice, 10) - 1;
			if (index < 0 || index >= PROVIDERS.length) {
				console.error("无效的选择");
				process.exit(1);
			}
			provider = PROVIDERS[index].id;
		}

		if (!PROVIDERS.some((p) => p.id === provider)) {
			console.error(`未知的提供者: ${provider}`);
			console.error(`使用 'npx @earendil-works/pi-ai list' 查看可用的提供者`);
			process.exit(1);
		}

		console.log(`正在登录到 ${provider}...`);
		await login(provider);
		return;
	}

	console.error(`未知命令: ${command}`);
	console.error(`使用 'npx @earendil-works/pi-ai --help' 查看用法`);
	process.exit(1);
}

main().catch((err) => {
	console.error("错误:", err.message);
	process.exit(1);
});
