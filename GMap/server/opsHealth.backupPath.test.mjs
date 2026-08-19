import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { TURNS_DIR } from "./tableStore.mjs";
import { listBackupDirs, resolveBackupDir } from "./opsHealth.mjs";

test("resolveBackupDir rejects traversal", () => {
  assert.equal(resolveBackupDir("../published.json"), null);
  assert.equal(resolveBackupDir(".."), null);
  assert.equal(resolveBackupDir("a/b"), null);
  assert.equal(resolveBackupDir("a\\b"), null);
});

test("listed snapshot names resolve under data/turns", () => {
  const first = listBackupDirs()[0];
  if (!first) return;
  const dir = resolveBackupDir(first.name);
  assert.ok(dir);
  const rel = path.relative(path.resolve(TURNS_DIR), path.resolve(dir));
  assert.ok(rel && !rel.startsWith("..") && !path.isAbsolute(rel));
});
