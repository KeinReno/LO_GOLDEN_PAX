import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Quest, QuestChoice } from "./types.ts";
import { firstAttentionQuestId } from "./questAttention.ts";
import {
  choiceNeedsHold,
  diceDifficultyLabel,
  digitChoiceIndex,
  enterChoiceAction,
  formatChoiceCostLabel,
  formatChoiceOutcome,
  formatWorldEffectsLabel,
} from "./questChoiceUi.ts";

function choice(partial: Partial<QuestChoice> & { id: string }): QuestChoice {
  return { label: "Да", ...partial };
}

describe("questChoiceUi", () => {
  it("digits only arm 1..N", () => {
    assert.equal(digitChoiceIndex("1", 2), 0);
    assert.equal(digitChoiceIndex("2", 2), 1);
    assert.equal(digitChoiceIndex("3", 2), null);
    assert.equal(digitChoiceIndex("0", 2), null);
  });

  it("Enter commits a cheap armed choice and blocks spend", () => {
    const cheap = choice({ id: "a" });
    const spend = choice({ id: "b", costs: { "currency.metal": 4 } });
    assert.equal(enterChoiceAction("a", cheap), "commit");
    assert.equal(enterChoiceAction("b", spend), "hold-only");
    assert.equal(enterChoiceAction(null, cheap), "ignore");
    assert.equal(choiceNeedsHold(spend), true);
    assert.equal(choiceNeedsHold(cheap), false);
    assert.equal(choiceNeedsHold(choice({ id: "d", needsDice: true })), true);
  });

  it("shows outcome and Russian difficulty", () => {
    assert.equal(
      formatChoiceOutcome(
        choice({
          id: "a",
          effects: [{ kind: "loyalty", value: -2 }],
        }),
      ),
      "−2 лояльность",
    );
    assert.equal(diceDifficultyLabel(6, 12), "Сложность 12");
    assert.equal(
      formatWorldEffectsLabel([
        { effect: "production_flat", args: { resource: "currency.metal", amount: -6 } },
      ]),
      "−6 Металл",
    );
    assert.equal(
      formatWorldEffectsLabel([
        { effect: "loyalty_add", args: { amount: 5 } },
      ]),
      "+5 лояльность",
    );
    assert.equal(
      formatChoiceCostLabel({
        "currency.bios": 4,
        "currency.supply": 3,
      }),
      "−4 Биомасса · −3 Обеспечение",
    );
    assert.equal(
      formatChoiceOutcome(
        choice({
          id: "spend",
          costs: { "currency.bios": 4, "currency.supply": 3 },
          effects: [
            { kind: "resource", target: "currency.bios", value: -4 },
            { kind: "resource", target: "currency.supply", value: -3 },
            { kind: "loyalty", value: 5 },
          ],
        }),
      ),
      "+5 лояльность",
    );
  });

  it("picks the first attention quest, not idle work", () => {
    const idle: Quest = {
      id: "idle",
      title: "В работе",
      kind: "side",
      status: "active",
      narrative: false,
      hook: "",
      description: "",
    };
    const pick: Quest = {
      id: "pick",
      title: "Выбор",
      kind: "side",
      status: "active",
      narrative: false,
      hook: "",
      description: "",
      choices: [{ id: "a", label: "Да" }],
    };
    assert.equal(firstAttentionQuestId([idle, pick], 4), "pick");
    assert.equal(firstAttentionQuestId([idle], 4), null);
  });
});
