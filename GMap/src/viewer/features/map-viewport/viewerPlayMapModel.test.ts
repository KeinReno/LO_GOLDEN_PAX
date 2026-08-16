import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MapLayerFlags } from "../../../ui/mapLayers.ts";
import {
  buildViewerPlayMapModel,
  emptyViewerPlayWorld,
  type ViewerPlayMapModelInput,
} from "./viewerPlayMapModel.ts";

const layers: MapLayerFlags = {
  showLinks: true,
  showOwnership: true,
  showTerritory: false,
  showSectors: false,
  showFactionLabels: true,
  showLabels: true,
  showFleets: true,
  showLegions: true,
  showOrders: false,
  showDiplomacy: true,
  showFogPreview: false,
  gmOmniscientView: false,
  showJumpRange: false,
  showSupply: true,
  showCaravans: true,
  showBlockades: false,
  showDeadZones: false,
  showTraffic: false,
  showQuests: false,
  showLoyalty: false,
};

describe("buildViewerPlayMapModel", () => {
  it("empty payload uses empty world and layer flags as-is", () => {
    const m = buildViewerPlayMapModel({
      payload: null,
      selectedSystemId: "x",
      selectedFleetId: "f",
      selectedLegionId: "l",
      layers,
      perfMode: "mobile",
      mapStyle: "imperial",
      mapGraphics: { animations: false },
    });
    assert.deepEqual(m.world, emptyViewerPlayWorld());
    assert.equal(m.selectedSystemId, null);
    assert.equal(m.showOrders, false);
    assert.equal(m.showSupply, true);
    assert.equal(m.perfMode, "mobile");
  });

  it("player map forces orders on and hides supply/diplomacy chords", () => {
    const world = emptyViewerPlayWorld();
    const m = buildViewerPlayMapModel({
      payload: {
        factionId: "f1",
        world,
      } as ViewerPlayMapModelInput["payload"],
      selectedSystemId: "s1",
      selectedFleetId: "fl1",
      selectedLegionId: null,
      layers,
      perfMode: "quality",
      mapStyle: "holo",
      mapGraphics: { animations: true },
      economyBottleneckSystemIds: ["s1"],
    });
    assert.equal(m.world, world);
    assert.equal(m.selectedSystemId, "s1");
    assert.equal(m.selectedFleetId, "fl1");
    assert.equal(m.showOrders, true);
    assert.equal(m.showSupply, false);
    assert.equal(m.showDiplomacy, false);
    assert.equal(m.activeFactionId, "f1");
    assert.deepEqual(m.economyBottleneckSystemIds, ["s1"]);
  });
});
