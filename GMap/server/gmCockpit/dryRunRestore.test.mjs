import assert from "node:assert/strict";
import test from "node:test";
import { markDryRunRestoreFailed } from "./dryRun.mjs";

test("failed safety restore never reports ok", () => {
  const out = markDryRunRestoreFailed(
    { ok: true, dryRun: true, applied: false, note: "done" },
    new Error("ENOENT"),
  );
  assert.equal(out.ok, false);
  assert.equal(out.restoreFailed, true);
  assert.equal(out.applied, true);
  assert.match(String(out.error), /ENOENT/);
});
