import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogMeta, resolvedContentFile } from "./gmContent.mjs";

test("catalog paths stay inside content/", () => {
  assert.equal(resolvedContentFile("../package.json"), null);
  assert.equal(resolvedContentFile("..\\..\\secrets.json"), null);
  assert.ok(resolvedContentFile("core/technologies.json"));
});

test("unknown / traversal catalog ids are rejected", () => {
  assert.equal(getCatalogMeta("../secrets").ok, false);
  assert.equal(getCatalogMeta("..\\package").ok, false);
  assert.equal(getCatalogMeta("core/../../package").ok, false);
});

test("known atelier catalog still resolves", () => {
  const meta = getCatalogMeta("technologies");
  assert.equal(meta.ok, true);
  assert.equal(meta.id, "technologies");
});
