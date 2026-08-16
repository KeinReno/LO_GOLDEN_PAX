import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../server/routes");
const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".mjs") && !f.includes(".test."));
const builtins = new Set([
  "String",
  "Number",
  "Boolean",
  "Array",
  "Object",
  "JSON",
  "Math",
  "Date",
  "Error",
  "Promise",
  "Map",
  "Set",
  "console",
  "process",
  "Buffer",
  "URL",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "undefined",
  "null",
  "true",
  "false",
  "NaN",
  "Infinity",
  "BigInt",
  "Symbol",
  "RegExp",
]);
const keywords = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "await",
  "return",
  "typeof",
  "new",
  "throw",
  "void",
  "delete",
  "yield",
  "super",
  "this",
]);

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const imports = new Set();
  for (const m of src.matchAll(
    /import\s+(?:(\w+)|\{([^}]+)\}|\*\s+as\s+(\w+))/g,
  )) {
    if (m[1]) imports.add(m[1]);
    if (m[3]) imports.add(m[3]);
    if (m[2]) {
      for (const p of m[2].split(",")) {
        const n = p.trim().split(/\s+as\s+/).pop().trim();
        if (n) imports.add(n);
      }
    }
  }
  const ctx = new Set();
  const ctxMatch = src.match(/const\s*\{([^}]+)\}\s*=\s*ctx/);
  if (ctxMatch) {
    for (const p of ctxMatch[1].split(",")) {
      const n = p.trim();
      if (n) ctx.add(n);
    }
  }
  const local = new Set();
  for (const m of src.matchAll(
    /(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    local.add(m[1]);
  }
  for (const m of src.matchAll(
    /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g,
  )) {
    local.add(m[1]);
  }

  const calls = [...src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(
    (m) => m[1],
  );
  const suspects = [...new Set(calls)].filter(
    (n) =>
      !builtins.has(n) &&
      !imports.has(n) &&
      !ctx.has(n) &&
      !local.has(n) &&
      !keywords.has(n),
  );
  if (suspects.length) {
    bad += 1;
    console.log(`${f}: ${suspects.join(", ")}`);
  }
}
if (!bad) console.log("No undefined call suspects in routes/");
else console.log(`suspect files: ${bad}`);
