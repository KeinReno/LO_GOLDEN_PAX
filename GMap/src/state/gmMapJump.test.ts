import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGmMapJumpState } from "./gmMapJump.ts";

describe("buildGmMapJumpState", () => {
  it("galaxy pin keeps the map at galaxy and focuses the star", () => {
    const s = buildGmMapJumpState({ systemId: "sys", dive: "galaxy" });
    assert.equal(s.gmShellMode, "gm");
    assert.equal(s.dossierFactionId, null);
    assert.equal(s.dossierSystemId, null);
    assert.equal(s.cameraFocusSystemId, "sys");
    assert.deepEqual(s.mapFocus, { level: "galaxy" });
  });

  it("system dive opens the system view after the shell switch", () => {
    const s = buildGmMapJumpState({ systemId: "sys", dive: "system" });
    assert.equal(s.dossierSystemId, "sys");
    assert.deepEqual(s.mapFocus, { level: "system", systemId: "sys" });
  });

  it("planet dive carries system + planet", () => {
    const s = buildGmMapJumpState({
      systemId: "sys",
      planetId: "p1",
      dive: "planet",
    });
    assert.deepEqual(s.mapFocus, {
      level: "planet",
      systemId: "sys",
      planetId: "p1",
    });
  });
});
