#!/usr/bin/env node
/**
 * 生成嵌入式资产文件
 * 
 * 读取所有运行时配套文件，生成 TypeScript 源码，
 * 让 bun build --compile 将其内联到二进制中。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "packages", "coding-agent", "src");
const pkgDir = path.join(root, "packages", "coding-agent");

// ============================================================
// 资产清单
// ============================================================

const textAssets = {
	// package.json 用于版本信息
	"package.json": path.join(pkgDir, "package.json"),

	// 主题文件
	"dark.json": path.join(srcDir, "modes", "interactive", "theme", "dark.json"),
	"light.json": path.join(srcDir, "modes", "interactive", "theme", "light.json"),
	"theme-schema.json": path.join(srcDir, "modes", "interactive", "theme", "theme-schema.json"),

	// HTML 导出模板
	"template.html": path.join(srcDir, "core", "export-html", "template.html"),
	"template.css": path.join(srcDir, "core", "export-html", "template.css"),
	"template.js": path.join(srcDir, "core", "export-html", "template.js"),
	"marked.min.js": path.join(srcDir, "core", "export-html", "vendor", "marked.min.js"),
	"highlight.min.js": path.join(srcDir, "core", "export-html", "vendor", "highlight.min.js"),
};

const binaryAssets = {
	// 启动图片
	"clankolas.png": path.join(srcDir, "modes", "interactive", "assets", "clankolas.png"),
	// WASM 图片处理库
	"photon_rs_bg.wasm": path.join(pkgDir, "dist", "photon_rs_bg.wasm"),
};

// ============================================================
// 生成 TypeScript
// ============================================================

const lines = [
	"// 自动生成 — 由 scripts/embed-assets.mjs 在构建时生成",
	"// 不要手动编辑此文件",
	`// 生成时间：${new Date().toISOString()}`,
	"",
	"// ============================================================",
	"// 文本资产（JSON / HTML / CSS / JS）",
	"// ============================================================",
	"",
];

// 文本资产：导出为字符串常量
for (const [name, filePath] of Object.entries(textAssets)) {
	const content = fs.readFileSync(filePath, "utf-8");
	// 用 JSON.stringify 转义多行文本
	const escaped = JSON.stringify(content);
	// 变量名：foo-bar.json → fooBarJson, marked.min.js → markedMinJs
	const varName = name
		.replace(/\.([a-z]+)$/, (_, ext) => ext.charAt(0).toUpperCase() + ext.slice(1))
		.replace(/[-.]([a-z])/g, (_, c) => c.toUpperCase());

	lines.push(`export const ${varName} = ${escaped};`);
}
lines.push("");

// 二进制资产：导出为 base64 字符串
lines.push("// ============================================================");
lines.push("// 二进制资产（图片等）— 以 base64 内联");
lines.push("// ============================================================");
lines.push("");

// 收集二进制资产变量名，用于生成 globalThis 桥接
const binaryVarNames = {};

for (const [name, filePath] of Object.entries(binaryAssets)) {
	const data = fs.readFileSync(filePath);
	const base64 = data.toString("base64");
	const varName = name
		.replace(/\.([a-z]+)$/, (_, ext) => ext.charAt(0).toUpperCase() + ext.slice(1))
		.replace(/[-.]([a-z])/g, (_, c) => c.toUpperCase());

	binaryVarNames[name] = varName;
	lines.push(`export const ${varName} = ${JSON.stringify(base64)};`);
}
lines.push("");

// ============================================================
// 便捷访问器
// ============================================================

lines.push("// ============================================================");
lines.push("// 便捷访问器");
lines.push("// ============================================================");
lines.push("");

// 主题注册表
lines.push("export const embeddedThemes: Record<string, string> = {");
lines.push("  dark: darkJson,");
lines.push("  light: lightJson,");
lines.push("  schema: themeSchemaJson,");
lines.push("};");
lines.push("");

// HTML 导出模板
lines.push("export const embeddedExportTemplates: Record<string, string> = {");
lines.push("  html: templateHtml,");
lines.push("  css: templateCss,");
lines.push("  js: templateJs,");
lines.push("  markedJs: markedMinJs,");
lines.push("  hljsJs: highlightMinJs,");
lines.push("};");
lines.push("");

// 包信息（解析 JSON）
lines.push("// 解析后的包信息");
lines.push("export const embeddedPkg: Record<string, unknown> = JSON.parse(packageJson);");
lines.push("");

// 图片 base64
lines.push("export const embeddedLogoBase64 = clankolasPng;");
lines.push("");

// 设置 globalThis 桥接，供 config.ts 等模块读取
lines.push("// ============================================================");
lines.push("// 全局桥接 — 在入口点设置，供各模块使用");
lines.push("// ============================================================");
lines.push("");
lines.push("// 包信息");
lines.push("(globalThis as any).__EMBEDDED_PKG__ = JSON.parse(packageJson);");
lines.push("");
// 主题（直接存解析后的对象，方便 theme.ts 直接用）
lines.push("// 内置主题");
lines.push("(globalThis as any).__EMBEDDED_THEMES__ = {");
lines.push("  dark: JSON.parse(darkJson),");
lines.push("  light: JSON.parse(lightJson),");
lines.push("};");
lines.push("");
// 导出模板
lines.push("// HTML 导出模板");
lines.push("(globalThis as any).__EMBEDDED_EXPORT_TEMPLATES__ = {");
lines.push("  html: templateHtml,");
lines.push("  css: templateCss,");
lines.push("  js: templateJs,");
lines.push("  markedJs: markedMinJs,");
lines.push("  hljsJs: highlightMinJs,");
lines.push("};");
lines.push("");
// Logo 图片
lines.push("// Logo 图片 base64");
lines.push(`(globalThis as any).__EMBEDDED_LOGO_BASE64__ = ${binaryVarNames["clankolas.png"]};`);
lines.push("");
// WASM
lines.push(`(globalThis as any).__EMBEDDED_WASM_BASE64__ = ${binaryVarNames["photon_rs_bg.wasm"]};`);
lines.push("");

const output = lines.join("\n");

// ============================================================
// 写入目标文件
// ============================================================

const outPath = path.join(srcDir, "bun", "embedded-assets.generated.ts");
fs.writeFileSync(outPath, output, "utf-8");
console.log(`✅ 已生成: ${outPath} (${output.length} 字节)`);
