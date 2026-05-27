import type { Api, Model } from "../../types.ts";

export type OAuthCredentials = {
	refresh: string;
	access: string;
	expires: number;
	[key: string]: unknown;
};

export type OAuthProviderId = string;

/** @deprecated 改用 OAuthProviderId */
export type OAuthProvider = OAuthProviderId;

export type OAuthPrompt = {
	message: string;
	placeholder?: string;
	allowEmpty?: boolean;
};

export type OAuthAuthInfo = {
	url: string;
	instructions?: string;
};

export type OAuthDeviceCodeInfo = {
	userCode: string;
	verificationUri: string;
	intervalSeconds?: number;
	expiresInSeconds?: number;
};

export type OAuthSelectOption = {
	id: string;
	label: string;
};

export type OAuthSelectPrompt = {
	message: string;
	options: OAuthSelectOption[];
};

export interface OAuthLoginCallbacks {
	onAuth: (info: OAuthAuthInfo) => void;
	onDeviceCode: (info: OAuthDeviceCodeInfo) => void;
	onPrompt: (prompt: OAuthPrompt) => Promise<string>;
	onProgress?: (message: string) => void;
	onManualCodeInput?: () => Promise<string>;
	/** 显示一个交互式选择器，返回所选选项的id，取消时返回 undefined。 */
	onSelect: (prompt: OAuthSelectPrompt) => Promise<string | undefined>;
	signal?: AbortSignal;
}

export interface OAuthProviderInterface {
	readonly id: OAuthProviderId;
	readonly name: string;

	/** 运行登录流程，返回用于持久化的凭据 */
	login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;

	/** 登录是否使用本地回调服务器并支持手动输入代码。 */
	usesCallbackServer?: boolean;

	/** 刷新过期凭据，返回用于持久化的更新后凭据 */
	refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;

	/** 将凭据转换为供提供者使用的 API 密钥字符串 */
	getApiKey(credentials: OAuthCredentials): string;

	/** 可选：为此提供者修改模型（例如更新 baseUrl） */
	modifyModels?(models: Model<Api>[], credentials: OAuthCredentials): Model<Api>[];
}

/** @deprecated 改用 OAuthProviderInterface */
export interface OAuthProviderInfo {
	id: OAuthProviderId;
	name: string;
	available: boolean;
}
