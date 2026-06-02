/**
 * AI 提供商 OAuth 凭据管理。
 *
 * 该模块处理基于 OAuth 的提供商的登录、令牌刷新和凭据存储：
 * - Anthropic (Claude Pro/Max)
 * - GitHub Copilot
 */

// Anthropic
export { anthropicOAuthProvider, loginAnthropic, refreshAnthropicToken } from "./anthropic.ts";
export * from "./device-code.ts";
// GitHub Copilot
export {
	getGitHubCopilotBaseUrl,
	githubCopilotOAuthProvider,
	loginGitHubCopilot,
	normalizeDomain,
	refreshGitHubCopilotToken,
} from "./github-copilot.ts";
// OpenAI Codex (ChatGPT OAuth)
export {
	loginOpenAICodex,
	loginOpenAICodexDeviceCode,
	OPENAI_CODEX_BROWSER_LOGIN_METHOD,
	OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
	openaiCodexOAuthProvider,
	refreshOpenAICodexToken,
} from "./openai-codex.ts";

export * from "./types.ts";

// ============================================================================
// 提供商注册表
// ============================================================================

import { anthropicOAuthProvider } from "./anthropic.ts";
import { githubCopilotOAuthProvider } from "./github-copilot.ts";
import { openaiCodexOAuthProvider } from "./openai-codex.ts";
import type { OAuthCredentials, OAuthProviderId, OAuthProviderInfo, OAuthProviderInterface } from "./types.ts";

const BUILT_IN_OAUTH_PROVIDERS: OAuthProviderInterface[] = [
	anthropicOAuthProvider,
	githubCopilotOAuthProvider,
	openaiCodexOAuthProvider,
];

const oauthProviderRegistry = new Map<string, OAuthProviderInterface>(
	BUILT_IN_OAUTH_PROVIDERS.map((provider) => [provider.id, provider]),
);

/**
 * 根据 ID 获取 OAuth 提供商
 */
export function getOAuthProvider(id: OAuthProviderId): OAuthProviderInterface | undefined {
	return oauthProviderRegistry.get(id);
}

/**
 * 注册自定义 OAuth 提供商
 */
export function registerOAuthProvider(provider: OAuthProviderInterface): void {
	oauthProviderRegistry.set(provider.id, provider);
}

/**
 * 取消注册 OAuth 提供商。
 *
 * 如果该提供商是内置的，则恢复内置实现。
 * 自定义提供商将被完全移除。
 */
export function unregisterOAuthProvider(id: string): void {
	const builtInProvider = BUILT_IN_OAUTH_PROVIDERS.find((provider) => provider.id === id);
	if (builtInProvider) {
		oauthProviderRegistry.set(id, builtInProvider);
		return;
	}
	oauthProviderRegistry.delete(id);
}

/**
 * 将 OAuth 提供商重置为内置提供商。
 */
export function resetOAuthProviders(): void {
	oauthProviderRegistry.clear();
	for (const provider of BUILT_IN_OAUTH_PROVIDERS) {
		oauthProviderRegistry.set(provider.id, provider);
	}
}

/**
 * 获取所有已注册的 OAuth 提供商
 */
export function getOAuthProviders(): OAuthProviderInterface[] {
	return Array.from(oauthProviderRegistry.values());
}

/**
 * @deprecated 请使用 getOAuthProviders()，它返回 OAuthProviderInterface[]
 */
export function getOAuthProviderInfoList(): OAuthProviderInfo[] {
	return getOAuthProviders().map((p) => ({
		id: p.id,
		name: p.name,
		available: true,
	}));
}

// ============================================================================
// 高级 API（使用提供商注册表）
// ============================================================================

/**
 * 刷新任意 OAuth 提供商的令牌。
 * @deprecated 请改用 getOAuthProvider(id).refreshToken()
 */
export async function refreshOAuthToken(
	providerId: OAuthProviderId,
	credentials: OAuthCredentials,
): Promise<OAuthCredentials> {
	const provider = getOAuthProvider(providerId);
	if (!provider) {
		throw new Error(`未知的 OAuth 提供商：${providerId}`);
	}
	return provider.refreshToken(credentials);
}

/**
 * 从 OAuth 凭据中获取提供商的 API 密钥。
 * 自动刷新已过期的令牌。
 *
 * @returns API 密钥字符串和更新后的凭据，如果没有凭据则返回 null
 * @throws 刷新失败时抛出错误
 */
export async function getOAuthApiKey(
	providerId: OAuthProviderId,
	credentials: Record<string, OAuthCredentials>,
): Promise<{ newCredentials: OAuthCredentials; apiKey: string } | null> {
	const provider = getOAuthProvider(providerId);
	if (!provider) {
		throw new Error(`未知的 OAuth 提供商：${providerId}`);
	}

	let creds = credentials[providerId];
	if (!creds) {
		return null;
	}

	// 如果过期则刷新
	if (Date.now() >= creds.expires) {
		try {
			creds = await provider.refreshToken(creds);
		} catch (_error) {
			throw new Error(`刷新 ${providerId} 的 OAuth 令牌失败`);
		}
	}

	const apiKey = provider.getApiKey(creds);
	return { newCredentials: creds, apiKey };
}
