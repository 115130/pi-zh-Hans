#!/usr/bin/env node
/**
 * 字符串扫描工具
 * 用法：node scripts/scan-strings.mjs [路径] [选项]
 *
 * 递归扫描项目中所有非 gitignore 文件，找出被 " ' ` """ ''' 包裹的文本块。
 * 支持 .gitignore 过滤，自动跳过 node_modules/.git/dist 等目录。
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, relative, join } from "path";

// ---- 引号定义 ----
const QUOTES = [
  { name: "双引号", start: '"', end: '"', escape: true, multiLine: true },
  { name: "单引号", start: "'", end: "'", escape: true, multiLine: true },
  { name: "反引号", start: "`", end: "`", escape: true, multiLine: true },
  { name: "三重双引号", start: '"""', end: '"""', escape: true, multiLine: true },
  { name: "三重单引号", start: "'''", end: "'''", escape: true, multiLine: true },
];

// ---- .gitignore 解析 ----
function parseGitignore(dir, collected = []) {
  const p = join(dir, ".gitignore");
  try {
    for (const l of readFileSync(p, "utf-8").split("\n")) {
      const t = l.trim();
      if (t && !t.startsWith("#")) collected.push(t);
    }
  } catch {}
  const parent = resolve(dir, "..");
  if (parent !== dir) parseGitignore(parent, collected);
  return collected;
}

function matchesGitignore(rel, rules) {
  for (const raw of rules) {
    const neg = raw.startsWith("!");
    const p = neg ? raw.slice(1) : raw;
    const esc = p.replace(/\*\*/g, "___D___").replace(/\*/g, "[^/]*").replace(/___D___/g, ".*").replace(/\?/g, ".").replace(/\./g, "\\.");
    const r = new RegExp("^" + esc + "$|^" + esc + "/|/" + esc + "$|/" + esc + "/");
    if (r.test(rel)) return !neg;
  }
  return false;
}

// ---- 扫描 ----
function scanFile(path, minLen) {
  const hits = [];
  let raw;
  try { raw = readFileSync(path, "utf-8"); } catch { return hits; }
  if (raw.includes("\u0000")) return hits;
  const lines = raw.split("\n");

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    let ci = 0;
    while (ci < line.length) {
      const tail = line.slice(ci).trimStart();
      if (tail.startsWith("//") || tail.startsWith("#") || tail.startsWith("--")) break;
      let matched = false;
      for (const q of QUOTES) {
        if (!line.slice(ci).startsWith(q.start)) continue;
        matched = true;
        const startCol = ci;
        ci += q.start.length;
        const buf = [];
        if (!q.multiLine) {
          let closed = false;
          while (ci < line.length) {
            if (q.escape && line[ci] === "\\") { buf.push(line[ci], ci + 1 < line.length ? line[ci + 1] : ""); ci += 2; continue; }
            if (line.slice(ci).startsWith(q.end)) { closed = true; ci += q.end.length; break; }
            buf.push(line[ci]); ci++;
          }
          if (closed && buf.length >= minLen) hits.push({ line: ln + 1, col: startCol + 1, quote: q.name, content: buf.join("") });
          break;
        }
        let ml = ln, mi = ci, closed = false;
        while (ml < lines.length) {
          const l = lines[ml];
          while (mi < l.length) {
            if (q.escape && l[mi] === "\\") { buf.push(l[mi], mi + 1 < l.length ? l[mi + 1] : ""); mi += 2; continue; }
            if (l.slice(mi).startsWith(q.end)) { closed = true; ci = mi + q.end.length; break; }
            buf.push(l[mi]); mi++;
          }
          if (closed) break;
          if (ml > ln) buf.push("\n");
          ml++; mi = 0;
        }
        if (closed && buf.length >= minLen) hits.push({ line: ln + 1, col: startCol + 1, quote: q.name, content: buf.join("") });
        break;
      }
      if (!matched) ci++;
    }
  }
  return hits;
}

function walk(dir, root, rules, out, max, min) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (out.length >= max * 2) return;
    const full = join(dir, e);
    const rel = relative(root, full);
    if (matchesGitignore(rel, rules)) continue;
    if (rel.includes("/.git") || rel.includes("/node_modules") || rel.includes("/dist/") || rel.includes("/build/") || rel.includes("/.cache") || rel.includes("/target/")) continue;
    if (rel === "node_modules" || rel === ".git") continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (["node_modules", ".git", ".next", "dist", "build", ".cache", "target", "venv", "__pycache__", ".turbo"].includes(e)) continue;
      walk(full, root, rules, out, max, min);
    } else if (st.isFile() && st.size < 2 * 1024 * 1024) {
      out.push(...scanFile(full, min));
    }
  }
}

function hasCJK(text) {
  for (const ch of text) {
    const cp = ch.charCodeAt(0);
    if ((cp >= 0x4E00 && cp <= 0x9FFF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0xFF00 && cp <= 0xFFEF)) return true;
  }
  return false;
}

// ---- CLI ----
const args = process.argv.slice(2);
const rootDir = resolve(args[0] || process.cwd());
const minLen = parseInt(args[1] || "4", 10);
const maxResults = parseInt(args[2] || "10000", 10);

console.error(`扫描路径: ${rootDir}`);
console.error(`最小长度: ${minLen}`);
console.error(`最大结果: ${maxResults}\n`);

const rules = parseGitignore(rootDir);
const allHits = [];
walk(rootDir, rootDir, rules, allHits, maxResults, minLen);

// 过滤：纯英文字符串（不含 CJK），跳过 URL/路径
const filtered = allHits.filter(h =>
  h.content.length >= minLen &&
  !hasCJK(h.content) &&
  !h.content.startsWith("http") &&
  !h.content.startsWith("./") &&
  !h.content.startsWith("../") &&
  !h.content.startsWith("/") &&
  !h.content.startsWith("${") &&
  !h.content.startsWith("@") &&
  !/^[\d\s,.!?;:()\[\]{}<>+\-*/%=&|^~]+$/.test(h.content)
).slice(0, maxResults);

// 按文件分组
const byFile = new Map();
for (const h of filtered) {
  const list = byFile.get(h.file) || [];
  list.push(h);
  byFile.set(h.file, list);
}

// 统计
const qStat = new Map();
const lStat = new Map();
for (const h of filtered) {
  qStat.set(h.quote, (qStat.get(h.quote) || 0) + 1);
  const ext = h.file.split(".").pop() || "?";
  lStat.set(ext, (lStat.get(ext) || 0) + 1);
}

// 输出
console.log("# 英文字符串扫描结果");
console.log(`总数: ${filtered.length} 个 | 文件: ${byFile.size} 个\n`);

console.log("## 按文件排序（英文最多的在前）");
const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, hits] of sortedFiles) {
  console.log(`\n### ${file} (${hits.length})`);
  for (const h of hits.slice(0, 30)) {
    const s = h.content.length > 100 ? h.content.slice(0, 100) + "..." : h.content;
    console.log(`  L${h.line}C${h.col} [${h.quote}] ${s}`);
  }
  if (hits.length > 30) console.log(`  ... 还有 ${hits.length - 30} 个`);
}

console.log("\n## 引号类型分布");
for (const [k, v] of [...qStat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

console.log("\n## 文件类型分布");
for (const [k, v] of [...lStat.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  .${k}: ${v}`);
}
