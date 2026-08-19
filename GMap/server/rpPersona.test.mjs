import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRpPersona } from "./rpPersona.mjs";

test("master keeps narrator and aliases", () => {
  assert.equal(normalizeRpPersona("narrator", true), "narrator");
  assert.equal(normalizeRpPersona("alias", true), "alias");
  assert.equal(normalizeRpPersona("anonymous", true), "anonymous");
  assert.equal(normalizeRpPersona("master", true), "master");
  assert.equal(normalizeRpPersona("npc", true), "npc");
});

test("player cannot narrate or wear GM masks", () => {
  assert.equal(normalizeRpPersona("narrator", false), "self");
  assert.equal(normalizeRpPersona("alias", false), "self");
  assert.equal(normalizeRpPersona("anonymous", false), "self");
  assert.equal(normalizeRpPersona("master", false), "self");
  assert.equal(normalizeRpPersona("npc", false), "npc");
  assert.equal(normalizeRpPersona("self", false), "self");
  assert.equal(normalizeRpPersona("", false), "self");
});
