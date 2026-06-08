#!/usr/bin/env node
/**
 * pi-mono 发布脚本
 *
 * 用法：
 *   node scripts/release.mjs <major|minor|patch>
 *   node scripts/release.mjs <x.y.z>
 *
 * 步骤：
 * 1. 检查未提交的更改
 * 2. 通过 npm run version:xxx 升级版本或设置显式版本
 * 3. 更新 CHANGELOG.md：[Unreleased] -> [版本号] - 日期
 * 4. 生成 coding-agent npm-shrinkwrap.json
 * 5. 提交并打标签
 * 6. 发布到 npm
 * 7. 在变更日志中添加新的 [Unreleased] 章节
 * 8. 提交
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const RELEASE_TARGET = process.argv[2];
const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

if (!RELEASE_TARGET || (!BUMP_TYPES.has(RELEASE_TARGET) && !SEMVER_RE.test(RELEASE_TARGET))) {
	console.error("用法：node scripts/release.mjs <major|minor|patch|x.y.z>");
	process.exit(1);
}

function run(cmd, options = {}) {
	console.log(`$ ${cmd}`);
	try {
		return execSync(cmd, { encoding: "utf-8", stdio: options.silent ? "pipe" : "inherit", ...options });
	} catch (e) {
		if (!options.ignoreError) {
			console.error(`命令失败：${cmd}`);
			process.exit(1);
		}
		return null;
	}
}

function getVersion() {
	const pkg = JSON.parse(readFileSync("packages/ai/package.json", "utf-8"));
	return pkg.version;
}

function compareVersions(a, b) {
	const aParts = a.split(".").map(Number);
	const bParts = b.split(".").map(Number);

	for (let i = 0; i < 3; i++) {
		const diff = (aParts[i] || 0) - (bParts[i] || 0);
		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stageChangedFiles() {
	const output = run("git ls-files -m -o -d --exclude-standard", { silent: true });
	const paths = [...new Set((output || "").split("\n").map((line) => line.trim()).filter(Boolean))];
	if (paths.length === 0) {
		return;
	}

	run(`git add -- ${paths.map(shellQuote).join(" ")}`);
}

function bumpOrSetVersion(target) {
	const currentVersion = getVersion();

	if (BUMP_TYPES.has(target)) {
		console.log(`升级版本（${target}）...`);
		run(`npm run version:${target}`);
		return getVersion();
	}

	if (compareVersions(target, currentVersion) <= 0) {
		console.error(`错误：显式版本 ${target} 必须大于当前版本 ${currentVersion}。`);
		process.exit(1);
	}

	console.log(`设置显式版本（${target}）...`);
	run(`npm version ${target} -ws --no-git-tag-version && node scripts/sync-versions.js && npm install --package-lock-only`);
	return getVersion();
}

function getChangelogs() {
	const packagesDir = "packages";
	const packages = readdirSync(packagesDir);
	return packages
		.map((pkg) => join(packagesDir, pkg, "CHANGELOG.md"))
		.filter((path) => existsSync(path));
}

function updateChangelogsForRelease(version) {
	const date = new Date().toISOString().split("T")[0];
	const changelogs = getChangelogs();

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		if (!content.includes("## [Unreleased]")) {
			console.log(`  跳过 ${changelog}：没有 [Unreleased] 章节`);
			continue;
		}

		const updated = content.replace(
			"## [Unreleased]",
			`## [${version}] - ${date}`
		);
		writeFileSync(changelog, updated);
		console.log(`  已更新 ${changelog}`);
	}
}

function addUnreleasedSection() {
	const changelogs = getChangelogs();
	const unreleasedSection = "## [Unreleased]\n\n";

	for (const changelog of changelogs) {
		const content = readFileSync(changelog, "utf-8");

		// 在 "# Changelog\n\n" 之后插入
		const updated = content.replace(
			/^(# Changelog\n\n)/,
			`$1${unreleasedSection}`
		);
		writeFileSync(changelog, updated);
		console.log(`  已将 [Unreleased] 添加到 ${changelog}`);
	}
}

// 主流程
console.log("\n=== 发布脚本 ===\n");

// 1. 检查未提交的更改
console.log("检查未提交的更改...");
const status = run("git status --porcelain", { silent: true });
if (status && status.trim()) {
	console.error("错误：检测到未提交的更改。请先提交或暂存。");
	console.error(status);
	process.exit(1);
}
console.log("  工作目录干净\n");

// 2. 升级或设置版本
const version = bumpOrSetVersion(RELEASE_TARGET);
console.log(`  新版本：${version}\n`);

// 3. 更新变更日志
console.log("更新 CHANGELOG.md 文件...");
updateChangelogsForRelease(version);
console.log();

// 4. 生成发布用 shrinkwrap
console.log("生成 coding-agent shrinkwrap...");
run("npm run shrinkwrap:coding-agent");
console.log();

// 5. 提交并打标签
console.log("提交并打标签...");
stageChangedFiles();
run(`git commit -m "Release v${version}"`);
run(`git tag v${version}`);
console.log();

// 6. 发布
console.log("发布到 npm...");
run("npm run publish");
console.log();

// 7. 添加新的 [Unreleased] 章节
console.log("为下一周期添加 [Unreleased] 章节...");
addUnreleasedSection();
console.log();

// 8. 提交
console.log("提交变更日志更新...");
stageChangedFiles();
run(`git commit -m "Add [Unreleased] section for next cycle"`);
console.log();

// 9. 推送
console.log("推送到远程...");
run("git push origin main");
run(`git push origin v${version}`);
console.log();

console.log(`=== 已发布 v${version} ===`);
