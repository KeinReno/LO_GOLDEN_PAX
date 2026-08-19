import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diploStanceOkMsg,
  researchEffectNav,
  researchFlowLetter,
  researchFlowRates,
} from "./roomPanelCopy.ts";

describe("roomPanelCopy", () => {
  it("research flow letter defaults to F", () => {
    assert.equal(researchFlowLetter(null), "F");
    assert.equal(researchFlowLetter("B"), "B");
    assert.equal(researchFlowLetter("lab"), "F");
  });

  it("research flow rates from totals", () => {
    const rates = researchFlowRates(
      { F: { rate: 3, demand: 1 }, B: { rate: 9, demand: 4 } },
      "B",
    );
    assert.equal(rates.cognitioIncome, 3);
    assert.equal(rates.categoryIncome, 9);
    assert.equal(rates.categoryDemand, 4);
  });

  it("research effect nav", () => {
    const eco = researchEffectNav({
      kind: "economy_production",
      category: "A",
    });
    assert.equal(eco?.room, "economy");
    assert.equal(eco?.economyCategory, "A");
    const forces = researchEffectNav({
      kind: "forces",
      fromDefId: "u1",
      toDefId: "u2",
    });
    assert.equal(forces?.room, "forces");
    assert.deepEqual(forces?.forceHighlightIds, ["u1", "u2"]);
  });

  it("diplo stance toasts", () => {
    assert.equal(diploStanceOkMsg("war"), "Война объявлена");
    assert.equal(diploStanceOkMsg("embargo"), "Эмбарго введено");
    assert.equal(diploStanceOkMsg("insult"), "Оскорбление нанесено");
    assert.equal(diploStanceOkMsg("break"), "Договор разорван");
  });
});
