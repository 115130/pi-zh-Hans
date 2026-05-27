/**
 * 从字符串中移除未配对的 Unicode 代理项。
 *
 * 未配对的代理项（高代理项 0xD800-0xDBFF 无匹配的低代理项 0xDC00-0xDFFF，反之亦然）会导致许多 API 提供商的 JSON 序列化错误。
 *
 * 有效的表情符号和其他基本多语言平面之外的字符使用了正确配对的代理项，不会受此函数影响。
 *
 * @param text - 需要清理的文本
 * @returns 移除了未配对代理项后的清理文本
 *
 * @example
 * // 有效的表情符号（正确配对的代理项）得以保留
 * sanitizeSurrogates("Hello 🙈 World") // => "Hello 🙈 World"
 *
 * // 未配对的高代理项被移除
 * const unpaired = String.fromCharCode(0xD83D); // 无低代理项的高代理项
 * sanitizeSurrogates(`Text ${unpaired} here`) // => "Text  here"
 */
export function sanitizeSurrogates(text: string): string {
	// 替换未配对的高代理项（0xD800-0xDBFF 后无低代理项）
	// 替换未配对的低代理项（0xDC00-0xDFFF 前无高代理项）
	return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
