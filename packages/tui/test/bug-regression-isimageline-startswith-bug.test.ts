/**
 * isImageLine() 崩溃场景的 Bug 回归测试
 *
 * Bug：当 isImageLine() 使用 startsWith() 且终端不支持图片时，
 * 对于包含图片转义序列的行会返回 false，导致 TUI 崩溃并显示
 * "Rendered line exceeds terminal width" 错误。
 *
 * 修复：改为使用 includes() 检测行中任意位置的转义序列。
 *
 * 本测试演示：
 * 1. 旧实现中的 bug 场景
 * 2. 修复方案工作正常
 */

import assert from "node:assert";
import { describe, it } from "node:test";

describe("Bug 回归：isImageLine() 因图片转义序列崩溃", () => {
	describe("Bug 场景：终端不支持图片", () => {
		it("旧实现会返回 false，导致崩溃", () => {
			/**
			 * 旧实现（有 bug）：
			 * ```typescript
			 * export function isImageLine(line: string): boolean {
			 *   const prefix = getImageEscapePrefix();
			 *   return prefix !== null && line.startsWith(prefix);
			 * }
			 * ```
			 *
			 * 当终端不支持图片时：
			 * - getImageEscapePrefix() 返回 null
			 * - isImageLine() 对包含图片序列的行返回 false
			 * - TUI 对包含 300KB+ base64 数据的行进行宽度检查
			 * - 崩溃："Rendered line exceeds terminal width (304401 > 115)"
			 */

			// 模拟旧实现行为
			const oldIsImageLine = (line: string, imageEscapePrefix: string | null): boolean => {
				return imageEscapePrefix !== null && line.startsWith(imageEscapePrefix);
			};

			// 终端不支持图片时，prefix 为 null
			const terminalWithoutImageSupport = null;

			// 包含图片转义序列且前面有文本的行（常见的 bug 场景）
			const lineWithImageSequence =
				"Read image file [image/jpeg]\x1b]1337;File=size=800,600;inline=1:base64data...\x07";

			// 旧实现会返回 false（这就是 bug！）
			const oldResult = oldIsImageLine(lineWithImageSequence, terminalWithoutImageSupport);
			assert.strictEqual(oldResult, false, "Bug：在终端不支持图片时，旧实现对于包含图片序列的行返回 false");
		});

		it("新实现正确返回 true", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			// 包含图片转义序列且前面有文本的行
			const lineWithImageSequence =
				"Read image file [image/jpeg]\x1b]1337;File=size=800,600;inline=1:base64data...\x07";

			// 新实现应返回 true（修复！）
			const newResult = isImageLine(lineWithImageSequence);
			assert.strictEqual(newResult, true, "修复：新实现对于包含图片序列的行返回 true");
		});

		it("新实现能检测任意位置的 Kitty 序列", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			const scenarios = [
				"开头位置：\x1b_Ga=T,f=100,data...\x1b\\",
				"前缀 \x1b_Ga=T,data...\x1b\\",
				"后缀文本 \x1b_Ga=T,data...\x1b\\ 后缀",
				"中间位置 \x1b_Ga=T,data...\x1b\\ 更多文本",
				// 超长行（模拟 300KB+ 崩溃场景）
				`文本在前 \x1b_Ga=T,f=100${"A".repeat(300000)} 文本在后`,
			];

			for (const line of scenarios) {
				assert.strictEqual(isImageLine(line), true, `应检测到 Kitty 序列：${line.slice(0, 50)}...`);
			}
		});

		it("新实现能检测任意位置的 iTerm2 序列", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			const scenarios = [
				"开头位置：\x1b]1337;File=size=100,100:base64...\x07",
				"前缀 \x1b]1337;File=inline=1:data==\x07",
				"后缀文本 \x1b]1337;File=inline=1:data==\x07 后缀",
				"中间位置 \x1b]1337;File=inline=1:data==\x07 更多文本",
				// 超长行（模拟 304KB 崩溃场景）
				`文本在前 \x1b]1337;File=size=800,600;inline=1:${"B".repeat(300000)} 文本在后`,
			];

			for (const line of scenarios) {
				assert.strictEqual(isImageLine(line), true, `应检测到 iTerm2 序列：${line.slice(0, 50)}...`);
			}
		});
	});

	describe("集成：工具执行场景", () => {
		/**
		 * 模拟 `read` 工具读取图片文件时发生的情况。
		 * 工具结果包含文本和图片内容：
		 *
		 * ```typescript
		 * {
		 *   content: [
		 *     { type: "text", text: "Read image file [image/jpeg]\n800x600" },
		 *     { type: "image", data: "base64...", mimeType: "image/jpeg" }
		 *   ]
		 * }
		 * ```
		 *
		 * 渲染时，图片组件会创建转义序列。
		 * 如果 isImageLine() 检测不到它们，TUI 就会崩溃。
		 */

		it("检测 read 工具输出中的图片序列", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			// 模拟 read 工具处理图片时的输出
			// 行中可能包含 read 结果的文本加上图片转义序列
			const toolOutputLine = "Read image file [image/jpeg]\x1b]1337;File=size=800,600;inline=1:base64image...\x07";

			assert.strictEqual(isImageLine(toolOutputLine), true, "应检测到工具输出行中的图片序列");
		});

		it("检测 Image 组件生成的 Kitty 序列", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			// Kitty 图片组件会创建带转义序列的多行输出
			const kittyLine = "\x1b_Ga=T,f=100,t=f,d=base64data...\x1b\\\x1b_Gm=i=1;\x1b\\";

			assert.strictEqual(isImageLine(kittyLine), true, "应检测到 Kitty 图片组件输出");
		});

		it("处理图片序列前的 ANSI 代码", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			// 行可能在图片数据前含有样式（错误、警告等）
			const lines = [
				"\x1b[31mError\x1b[0m: \x1b]1337;File=inline=1:base64==\x07",
				"\x1b[33mWarning\x1b[0m: \x1b_Ga=T,data...\x1b\\",
				"\x1b[1mBold\x1b[0m \x1b]1337;File=:base64==\x07\x1b[0m",
			];

			for (const line of lines) {
				assert.strictEqual(isImageLine(line), true, `应检测到 ANSI 代码后的图片序列：${line.slice(0, 30)}...`);
			}
		});
	});

	describe("崩溃场景模拟", () => {
		it("不会在含有图片序列的超长行上崩溃", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			/**
			 * 模拟精确的崩溃场景：
			 * - 行长度为 304,401 字符（崩溃日志显示 58649 > 115）
			 * - 中间某处包含图片转义序列
			 * - 旧实现返回 false，导致 TUI 进行宽度检查
			 * - 新实现返回 true，跳过宽度检查（防止崩溃）
			 */

			const base64Char = "A".repeat(100);
			const iterm2Sequence = "\x1b]1337;File=size=800,600;inline=1:";

			// 构造会导致崩溃的行
			const crashLine =
				"输出：" +
				iterm2Sequence +
				base64Char.repeat(3040) + // ~304,000 字符
				" 输出结束";

			// 验证行非常长
			assert(crashLine.length > 300000, "测试行应大于 300KB");

			// 新实现应能检测到（防止崩溃）
			const detected = isImageLine(crashLine);
			assert.strictEqual(detected, true, "应在超长行中检测到图片序列，防止 TUI 崩溃");
		});

		it("处理与崩溃日志完全匹配的行尺寸", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			/**
			 * 崩溃日志显示：行宽 58649 字符，终端宽度 115
			 * 让我们创建具有类似特征的行
			 */

			const targetWidth = 58649;
			const prefix = "文本";
			const sequence = "\x1b_Ga=T,f=100";
			const suffix = "结束";
			const padding = "A".repeat(targetWidth - prefix.length - sequence.length - suffix.length);
			const line = `${prefix}${sequence}${padding}${suffix}`;

			assert.strictEqual(line.length, 58649);
			assert.strictEqual(isImageLine(line), true, "应在 58649 字符的行中检测到图片序列");
		});
	});

	describe("负面用例：不要误报", () => {
		it("不在普通长文本中检测图片", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			// 不含图片序列的超长行
			const longText = "A".repeat(100000);

			assert.strictEqual(isImageLine(longText), false, "不应在普通长文本中检测到图片");
		});

		it("不在包含文件路径的行中检测图片", async () => {
			const { isImageLine } = await import("../src/terminal-image.ts");

			const filePaths = [
				"/path/to/1337/image.jpg",
				"/usr/local/bin/File_converter",
				"~/Documents/1337File_backup.png",
				"./_G_test_file.txt",
			];

			for (const path of filePaths) {
				assert.strictEqual(isImageLine(path), false, `不应在路径中误检测图片序列：${path}`);
			}
		});
	});
});
