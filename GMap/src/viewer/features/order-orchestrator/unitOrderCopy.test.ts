import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boardOutcomeNote,
  cardBattleOpenedNote,
  noPathNote,
  orderCancelledNote,
  orderPostedNote,
  unitOrderAcceptedNote,
} from "./unitOrderCopy.ts";

describe("unitOrderCopy notes", () => {
  it("accepted + posted + board", () => {
    assert.match(
      unitOrderAcceptedNote("attack_system", false, " · 2", "3/9"),
      /атаку/,
    );
    assert.equal(orderPostedNote("2/9"), "Приказ принят · 2/9");
    assert.match(boardOutcomeNote(true), /захвачен/);
    assert.match(boardOutcomeNote(false), /отбит/);
    assert.equal(orderCancelledNote(), "Приказ отменён");
    assert.equal(cardBattleOpenedNote(), "Карточный бой открыт");
    assert.match(noPathNote(), /пути/);
  });
});
