#!/usr/bin/env node
/**
 * 字符串扫描工具 v2 — 全量扫描版
 * 用法：node scripts/scan-strings.mjs [路径] [最小长度] [每批数量] [批次号]
 *
 * 扫描所有非忽略文件，按英文数量排序后分批输出。
 * 批次号从 1 开始，每批输出指定数量文件。
 */

import { readFileSync } from "fs";
import { resolve, relative } from "path";
import { execSync } from "child_process";

// ---- 引号定义 ----
const QUOTES = [
  { name: "双引号", start: '"', end: '"', escape: true },
  { name: "单引号", start: "'", end: "'", escape: true },
  { name: "反引号", start: "`", end: "`", escape: true },
  { name: "三重双引号", start: '"""', end: '"""', escape: true },
  { name: "三重单引号", start: "'''", end: "'''", escape: true },
];

function hasCJK(t) {
  for (const c of t) {
    const p = c.charCodeAt(0);
    if ((p >= 0x4E00 && p <= 0x9FFF) || (p >= 0x3400 && p <= 0x4DBF) || (p >= 0xFF00 && p <= 0xFFEF)) return true;
  }
  return false;
}

function scanFile(path, minLen) {
  const hits = [];
  let raw;
  try { raw = readFileSync(path, "utf-8"); } catch { return hits; }
  if (raw.includes("\u0000") || raw.includes("BEGIN CERTIFICATE")) return hits;
  const lines = raw.split("\n");

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    let ci = 0;
    while (ci < line.length) {
      const trim = line.slice(ci).trimStart();
      if (trim.startsWith("//") || trim.startsWith("#") || trim.startsWith("--")) break;
      let matched = false;
      for (const q of QUOTES) {
        if (!line.slice(ci).startsWith(q.start)) continue;
        matched = true;
        ci += q.start.length;
        const buf = [];
        while (ci < line.length) {
          if (q.escape && line[ci] === "\\") { buf.push(line[ci], ci + 1 < line.length ? line[ci + 1] : ""); ci += 2; continue; }
          if (line.slice(ci).startsWith(q.end)) {
            const s = buf.join("");
            if (s.length >= minLen) hits.push({ line: ln + 1, content: s });
            ci += q.end.length;
            break;
          }
          buf.push(line[ci]);
          ci++;
        }
        break;
      }
      if (!matched) ci++;
    }
  }
  return hits;
}

// ---- CLI ----
const args = process.argv.slice(2);
const rootDir = resolve(args[0] || process.cwd());
const minLen = parseInt(args[1] || "6", 10);
const batchSize = parseInt(args[2] || "20", 10);
const batchIdx = parseInt(args[3] || "0", 10); // 0 = 全部输出

console.error(`扫描路径: ${rootDir}`);
console.error(`最小长度: ${minLen}`);
console.error(`每批: ${batchSize}`);
console.error(`批次: ${batchIdx === 0 ? "全部" : batchIdx}\n`);

// 用 find 列出文件（跳过 node_modules/.git/dist/build/.cache/target 等）
const findCmd = `find "${rootDir}" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.cache/*' -not -path '*/target/*' -not -path '*/venv/*' -not -path '*/__pycache__/*' -not -path '*/.turbo/*' -not -path '*/.next/*' -not -path '*/coverage/*' -not -name '*.node' -not -name '*.png' -not -name '*.jpg' -not -name '*.gif' -not -name '*.ico' -not -name '*.woff*' -not -name '*.ttf' -not -name '*.eot' -not -name '*.o' -not -name '*.a' -not -name '*.so' -not -name '*.map' -size -500k 2>/dev/null`;

console.error("正在列出文件...");
const fileList = execSync(findCmd).toString().trim().split("\n").filter(Boolean);
console.error(`共 ${fileList.length} 个文件\n`);

// 逐个扫描
const fileHits = new Map();
let done = 0;

for (const f of fileList) {
  const hits = scanFile(f, minLen);
  if (hits.length > 0) {
    const relPath = relative(rootDir, f);
    fileHits.set(relPath, hits);
  }
  done++;
  if (done % 100 === 0) console.error(`  已扫描 ${done}/${fileList.length}...`);
}

console.error(`扫描完成，${fileHits.size} 个文件含字符串\n`);

// 过滤每个文件中纯英文的字符串
const fileEngCounts = [];
for (const [file, hits] of fileHits) {
  const eng = hits.filter(h =>
    !hasCJK(h.content) &&
    h.content.length >= minLen &&
    !h.content.startsWith("http") &&
    !h.content.startsWith("./") &&
    !h.content.startsWith("../") &&
    !h.content.startsWith("/") &&
    !h.content.startsWith("${") &&
    !h.content.startsWith("@") &&
    !h.content.startsWith("node:") &&
    !/^[a-zA-Z_.$\d]+$/.test(h.content) &&
    !/^[\d\s,.!?;:()\[\]{}<>+\-*/%=&|^~]+$/.test(h.content)
  );
  if (eng.length > 0) fileEngCounts.push({ file, count: eng.length, hits: eng });
}

// 按英文数量排序
fileEngCounts.sort((a, b) => b.count - a.count);

// 分批输出
const start = batchIdx > 0 ? (batchIdx - 1) * batchSize : 0;
const end = batchIdx > 0 ? start + batchSize : fileEngCounts.length;
const batch = fileEngCounts.slice(start, end);

console.log(`# 英文字符串扫描结果 — 第 ${batchIdx > 0 ? batchIdx : 1} 批`);
console.log(`排序 ${start + 1}–${Math.min(end, fileEngCounts.length)} / 共 ${fileEngCounts.length} 个文件`);
console.log(`总数: ${batch.reduce((s, f) => s + f.count, 0)} 个英文字符串\n`);

for (const { file, count, hits } of batch) {
  console.log(`## ${file} (${count})`);
  for (const h of hits.slice(0, 20)) {
    const s = h.content.length > 120 ? h.content.slice(0, 120) + "..." : h.content;
    console.log(`  L${h.line}: ${s}`);
  }
  if (hits.length > 20) console.log(`  ... 还有 ${hits.length - 20} 个`);
  console.log("");
}
