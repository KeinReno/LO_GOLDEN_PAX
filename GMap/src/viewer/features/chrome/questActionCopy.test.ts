import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  questChoiceAppliedNote,
  questDiceNote,
} from "./questActionCopy.ts";

describe("questActionCopy", () => {
  it("choice note", () => {
    assert.equal(questChoiceAppliedNote(), "Выбор по квесту применён");
  });

  it("dice note prefers server message", () => {
    assert.equal(questDiceNote("крит"), "крит");
    assert.equal(questDiceNote(), "Бросок записан");
  });
});
