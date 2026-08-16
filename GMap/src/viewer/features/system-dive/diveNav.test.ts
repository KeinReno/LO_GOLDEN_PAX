import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diveCloseWorldPatch,
  diveOpenWorldPatch,
  divePlanetWorldPatch,
} from "./diveNav.ts";
import { useViewerSystemDiveStore } from "../../../state/viewerSystemDiveStore.ts";

describe("diveNav patches", () => {
  it("opens system focus", () => {
    assert.deepEqual(diveOpenWorldPatch("sys-1"), {
      dossierSystemId: null,
      selectedSystemId: "sys-1",
      mapFocus: { level: "system", systemId: "sys-1" },
      contextMenu: null,
    });
  });

  it("opens planet focus", () => {
    assert.deepEqual(divePlanetWorldPatch("sys-1", "p-2"), {
      dossierSystemId: null,
      mapFocus: { level: "planet", systemId: "sys-1", planetId: "p-2" },
    });
  });

  it("returns to galaxy", () => {
    assert.deepEqual(diveCloseWorldPatch(), {
      dossierSystemId: null,
      mapFocus: { level: "galaxy" },
    });
  });
});

describe("dive action status", () => {
  it("keeps busy and message across closeDive", () => {
    const s = useViewerSystemDiveStore.getState();
    s.setPlanetBusy(true);
    s.setPlanetMsg("очередь");
    s.setSystemBusy(true);
    s.setSystemMsg("флот");
    s.closeDive();
    const next = useViewerSystemDiveStore.getState();
    assert.equal(next.planetBusy, true);
    assert.equal(next.planetMsg, "очередь");
    assert.equal(next.systemBusy, true);
    assert.equal(next.systemMsg, "флот");
    next.setPlanetBusy(false);
    next.setPlanetMsg(null);
    next.setSystemBusy(false);
    next.setSystemMsg(null);
  });
});
