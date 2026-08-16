import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildingFromResearchNote,
  buildQueueUpdatedMsg,
  hybridFoundedMsg,
  hybridLineageTarget,
  hybridNeedPlanetMsg,
  noPlanetForBuildingMsg,
  techHighlightNote,
  unknownTechMsg,
} from "./systemActionCopy.ts";

describe("systemActionCopy", () => {
  it("queue / tech / hybrid notes", () => {
    assert.equal(buildQueueUpdatedMsg(3), "Очередь обновлена: 3");
    assert.equal(unknownTechMsg(), "Неизвестная технология");
    assert.match(techHighlightNote(2, "Щиты"), /2/);
    assert.equal(techHighlightNote(0, "Щиты"), "Нет подходящих систем");
    assert.match(hybridNeedPlanetMsg(), /планет/);
    assert.match(hybridFoundedMsg("Кровичи"), /Кровичи/);
    assert.match(noPlanetForBuildingMsg(), /планет/);
    assert.match(buildingFromResearchNote("Альтаир", "Шахта"), /Шахта/);
    assert.match(buildingFromResearchNote("Альтаир"), /Альтаир/);
  });

  it("hybrid target only when planet is focused", () => {
    assert.equal(
      hybridLineageTarget({ level: "system", systemId: "s1" }, "s1"),
      null,
    );
    assert.deepEqual(
      hybridLineageTarget(
        { level: "planet", systemId: "s1", planetId: "p1" },
        null,
      ),
      { systemId: "s1", planetId: "p1" },
    );
  });
});
