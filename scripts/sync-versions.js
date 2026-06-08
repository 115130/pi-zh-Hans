#!/usr/bin/env node

/**
 * 将所有工作区包的依赖版本与其当前版本同步。
 * 确保 monorepo 中的锁定版本号。
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const packagesDir = join(process.cwd(), 'packages');
const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
	.filter(dirent => dirent.isDirectory())
	.map(dirent => dirent.name);

// 读取所有 package.json 文件并构建版本映射
const packages = {};
const versionMap = {};

for (const dir of packageDirs) {
	const pkgPath = join(packagesDir, dir, 'package.json');
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
		packages[dir] = { path: pkgPath, data: pkg };
		versionMap[pkg.name] = pkg.version;
	} catch (e) {
		console.error(`读取 ${pkgPath} 失败：`, e.message);
	}
}

console.log('当前版本：');
for (const [name, version] of Object.entries(versionMap).sort()) {
	console.log(`  ${name}: ${version}`);
}

// 验证所有版本一致（锁定版本号）
const versions = new Set(Object.values(versionMap));
if (versions.size > 1) {
	console.error('\n❌ 错误：并非所有包版本一致！');
	console.error('期望锁定版本号。请运行以下命令之一：');
	console.error('  npm run version:patch');
	console.error('  npm run version:minor');
	console.error('  npm run version:major');
	process.exit(1);
}

console.log('\n✅ 所有包版本一致（锁定版本号）');

// 更新所有内部包之间的依赖
let totalUpdates = 0;
for (const [dir, pkg] of Object.entries(packages)) {
	let updated = false;
	
	// 检查 dependencies
	if (pkg.data.dependencies) {
		for (const [depName, currentVersion] of Object.entries(pkg.data.dependencies)) {
			if (versionMap[depName]) {
				const newVersion = `^${versionMap[depName]}`;
				if (currentVersion !== newVersion) {
					console.log(`\n${pkg.data.name}:`);
					console.log(`  ${depName}: ${currentVersion} → ${newVersion}`);
					pkg.data.dependencies[depName] = newVersion;
					updated = true;
					totalUpdates++;
				}
			}
		}
	}
	
	// 检查 devDependencies
	if (pkg.data.devDependencies) {
		for (const [depName, currentVersion] of Object.entries(pkg.data.devDependencies)) {
			if (versionMap[depName]) {
				const newVersion = `^${versionMap[depName]}`;
				if (currentVersion !== newVersion) {
					console.log(`\n${pkg.data.name}:`);
					console.log(`  ${depName}: ${currentVersion} → ${newVersion}（开发依赖）`);
					pkg.data.devDependencies[depName] = newVersion;
					updated = true;
					totalUpdates++;
				}
			}
		}
	}
	
	// 如果有更新则写入
	if (updated) {
		writeFileSync(pkg.path, JSON.stringify(pkg.data, null, '\t') + '\n');
	}
}

if (totalUpdates === 0) {
	console.log('\n所有内部包依赖已同步。');
} else {
	console.log(`\n✅ 已更新 ${totalUpdates} 个依赖版本`);
}
