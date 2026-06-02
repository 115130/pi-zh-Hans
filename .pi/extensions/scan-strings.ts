export {};

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative, join } from "path";

// ---------------------------------------------------------------------------
// .gitignore 解析
// ---------------------------------------------------------------------------

function parseGitignore(dir: string, collected: string[] = []): string[] {
  const gitignorePath = join(dir, ".gitignore");
  try {
    for (const line of readFileSync(gitignorePath, "utf-8").split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) collected.push(t);
    }
  } catch { /* no .gitignore */ }
  const parent = resolve(dir, "..");
  if (parent !== dir) parseGitignore(parent, collected);
  return collected;
}

function matchesGitignore(rel: string, rules: string[]): boolean {
  for (const raw of rules) {
    const neg = raw.startsWith("!");
    const p = neg ? raw.slice(1) : raw;
    const r = new RegExp(
      "^" + p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\./g, "\\.") +
      "$|^" + p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\./g, "\\.") + "/|/" +
      p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".").replace(/\./g, "\\.") + "$"
    );
    if (r.test(rel)) return !neg;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 引号定义
// ---------------------------------------------------------------------------

interface QDef {
  name: string;
  start: string;
  end: string;
  escape: boolean;
  multiLine: boolean;
}

const QUOTES: QDef[] = [
  { name: "双引号", start: '"', end: '"', escape: true, multiLine: true },
  { name: "单引号", start: "'", end: "'", escape: true, multiLine: true },
  { name: "反引号", start: "`", end: "`", escape: true, multiLine: true },
  { name: "三重双引号", start: '"""', end: '"""', escape: true, multiLine: true },
  { name: "三重单引号", start: "'''", end: "'''", escape: true, multiLine: true },
];

const EXT_LANG: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
  py: "Python", rs: "Rust", rb: "Ruby", php: "PHP", java: "Java", go: "Go",
  c: "C", cpp: "C++", cs: "C#", sh: "Shell", bash: "Shell",
  md: "Markdown", html: "HTML", css: "CSS", json: "JSON",
  yaml: "YAML", yml: "YAML", sql: "SQL", toml: "TOML",
};

// ---------------------------------------------------------------------------
// 字符串扫描
// ---------------------------------------------------------------------------

interface StringHit {
  file: string;
  line: number;
  col: number;
  quote: string;
  delimiter: string;
  lang: string;
  content: string;
  length: number;
}

function scanFile(path: string, root: string, minLen: number): StringHit[] {
  const hits: StringHit[] = [];
  let raw: string;
  try { raw = readFileSync(path, "utf-8"); } catch { return hits; }
  if (raw.includes("\u0000")) return hits;

  const ext = path.split(".").pop() || "";
  const lang = EXT_LANG[ext] || ext.toUpperCase();
  const rel = relative(root, path);
  const lines = raw.split("\n");

  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln];
    let ci = 0; // column index

    while (ci < line.length) {
      // 跳过单行注释引导符
      const tail = line.slice(ci).trimStart();
      if (tail.startsWith("//") || tail.startsWith("#") || tail.startsWith("--")) break;

      let matched = false;

      for (const q of QUOTES) {
        if (!line.slice(ci).startsWith(q.start)) continue;
        matched = true;

        const startCol = ci;
        ci += q.start.length;
        const buf: string[] = [];

        // 如果不支持多行：仅搜索当前行
        if (!q.multiLine) {
          let closed = false;
          while (ci < line.length) {
            if (q.escape && line[ci] === "\\") {
              buf.push(line[ci], ci + 1 < line.length ? line[ci + 1] : "");
              ci += 2;
              continue;
            }
            if (line.slice(ci).startsWith(q.end)) {
              closed = true;
              ci += q.end.length;
              break;
            }
            buf.push(line[ci]);
            ci++;
          }
          if (closed && buf.length >= minLen) {
            const s = buf.join("");
            hits.push({
              file: rel, line: ln + 1, col: startCol + 1,
              quote: q.name, delimiter: q.start, lang,
              content: s.length > 200 ? s.slice(0, 200) + "..." : s,
              length: s.length,
            });
          }
          // 未闭合的字符串：保持 ci 位置
          break;
        }

        // 支持多行：跨行搜索
        let ml = ln;
        let mi = ci;
        let closed = false;

        while (ml < lines.length) {
          const l = lines[ml];
          while (mi < l.length) {
            if (q.escape && l[mi] === "\\") {
              buf.push(l[mi], mi + 1 < l.length ? l[mi + 1] : "");
              mi += 2;
              continue;
            }
            if (l.slice(mi).startsWith(q.end)) {
              closed = true;
              ci = mi + q.end.length;
              if (ml > ln) { ci = l.length; }
              break;
            }
            buf.push(l[mi]);
            mi++;
          }
          if (closed) break;
          if (ml > ln) buf.push("\n");
          ml++;
          mi = 0;
        }

        if (closed && buf.length >= minLen) {
          const s = buf.join("");
          hits.push({
            file: rel, line: ln + 1, col: startCol + 1,
            quote: q.name, delimiter: q.start, lang,
            content: s.length > 200 ? s.slice(0, 200) + "..." : s,
            length: s.length,
          });
        }
        // 如果跨行闭合了，ci 已更新；否则 ci 停留在原地
        break;
      }

      if (!matched) ci++;
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// 目录遍历
// ---------------------------------------------------------------------------

function walk(
  dir: string, root: string, rules: string[],
  out: StringHit[], max: number, min: number
): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }

  for (const e of entries) {
    if (out.length >= max * 2) return;
    const full = join(dir, e);
    const rel = relative(root, full);
    if (matchesGitignore(rel, rules)) continue;
    if (rel === ".git" || rel === "node_modules") continue;

    let st: ReturnType<typeof statSync>;
    try { st = statSync(full); } catch { continue; }

    if (st.isDirectory()) {
      if (["node_modules", ".git", ".next", "dist", "build", ".cache", "target", "venv", "__pycache__"].includes(e)) continue;
      walk(full, root, rules, out, max, min);
    } else if (st.isFile() && st.size < 2 * 1024 * 1024) {
      out.push(...scanFile(full, root, min));
    }
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "scan_strings",
    label: "扫描字符串",
    description:
      "递归扫描项目中所有非 gitignore 文件，" +
      "找出所有被双引号(\")、单引号(')、反引号(`)、三重引号(\"\"\")等包裹的字符串文本块。" +
      "返回每个字符串的位置和内容。支持 .gitignore 过滤，自动跳过 node_modules/.git/dist 等目录。",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "扫描根目录（默认：当前工作目录）" })),
      minLength: Type.Optional(Type.Number({ description: "最短字符串长度（默认 3）" })),
      maxResults: Type.Optional(Type.Number({ description: "最多返回条数（默认 5000）" })),
      quotes: Type.Optional(Type.String({ description: "筛选引号类型，逗号分隔（双引号,单引号,反引号,三重双引号,三重单引号）" })),
      lang: Type.Optional(Type.String({ description: "按语言筛选（如 TypeScript,Python,HTML）" })),
    }),
    async execute(_callId: string, params: Record<string, unknown>) {
      const p = params as { path?: string; minLength?: number; maxResults?: number; quotes?: string; lang?: string };
      const rootDir = resolve(p.path || process.cwd());
      const minLen = p.minLength ?? 3;
      const maxR = p.maxResults ?? 5000;
      const rules = parseGitignore(rootDir);
      const allHits: StringHit[] = [];

      walk(rootDir, rootDir, rules, allHits, maxR, minLen);

      let filtered = allHits.filter((h) => h.length >= minLen);
      if (p.quotes) {
        const set = new Set(p.quotes.split(",").map((q) => q.trim()));
        filtered = filtered.filter((h) => set.has(h.quote));
      }
      if (p.lang) {
        const lc = p.lang.toLowerCase();
        filtered = filtered.filter((h) => h.lang.toLowerCase().includes(lc));
      }
      filtered = filtered.slice(0, maxR);

      const byFile = new Map<string, StringHit[]>();
      for (const h of filtered) {
        const list = byFile.get(h.file) || [];
        list.push(h);
        byFile.set(h.file, list);
      }

      // 统计
      const qStat = new Map<string, number>();
      const lStat = new Map<string, number>();
      for (const h of filtered) {
        qStat.set(h.quote, (qStat.get(h.quote) || 0) + 1);
        lStat.set(h.lang, (lStat.get(h.lang) || 0) + 1);
      }

      const fmt = [
        "## 字符串扫描结果",
        "路径: " + rootDir,
        "总数: " + filtered.length + " 个字符串 (" + byFile.size + " 个文件)",
        "",
        "### 引号类型分布",
        ...[...qStat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => "  " + k + ": " + v),
        "",
        "### 语言分布",
        ...[...lStat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => "  " + k + ": " + v),
        "",
        "### 详情（按文件分组）",
      ];

      for (const [file, hits] of [...byFile.entries()].sort()) {
        fmt.push("#### " + file + " (" + hits.length + ")");
        for (const h of hits.slice(0, 100)) {
          fmt.push("  L" + h.line + "C" + h.col + " [" + h.quote + "] " + h.delimiter + h.content + h.delimiter);
        }
        if (hits.length > 100) fmt.push("  ... 还有 " + (hits.length - 100) + " 个");
      }

      if (filtered.length >= maxR) fmt.push("", "> 结果已达上限 " + maxR + "，可能有遗漏。");

      return {
        content: [{ type: "text", text: fmt.join("\n") }],
        details: { total: filtered.length, files: byFile.size, rootDir },
      };
    },
  });
}
