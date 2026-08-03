import { rollDice, rollSuccess, formatDiceMessage } from "../server/dice.mjs";
import { loadContent, getContent } from "../server/contentLoader.mjs";
import { rollYearlyQuests, resolveQuestChoice, normalizeQuest } from "../server/questEngine.mjs";
import { normalizeWorld } from "../server/normalizeWorld.mjs";

const rolls = rollDice({ count: 2, sides: 6 });
console.log("dice", rolls, "success>=7", rollSuccess({ threshold: 7 }, rolls));
console.log(formatDiceMessage({ count: 1, sides: 20, label: "d20" }, [14], true, "Test"));

loadContent(["core"]);
const content = getContent();
console.log("yearly_quests", Object.keys(content.yearly_quests || {}).length);
console.log("intent.throw_quest_dice", !!content.intents?.["intent.throw_quest_dice"]);

const world = {
  meta: { turn: 3, yearlyQuestRolls: {}, name: "t", schemaVersion: 9, createdAt: "", updatedAt: "", width: 1, height: 1 },
  factions: [{ id: "f1", name: "Test", color: "#fff", password: "x" }],
  systems: [{ id: "s1", ownerFactionId: "f1", planets: [], name: "S1" }],
  quests: [{ id: "legacy", name: "Old", summary: "s", systemId: null, status: "active" }],
  diplomacy: [],
  links: [],
  caravans: [],
  fleets: [],
  legions: [],
  races: [],
  sectors: [],
  orders: [],
  turnHistory: [],
};

const nw = normalizeWorld(world);
console.log("legacy type", nw.quests[0].type, "history", Array.isArray(nw.quests[0].history));

const r = rollYearlyQuests("f1", nw, content);
console.log("yearly roll", r.ok, "1d6=", r.roll, "created", r.count);

if (r.quests?.[0]) {
  const q = r.quests[0];
  const choice = q.choices?.[1] || q.choices?.[0];
  if (choice && !choice.diceRequired) {
    const res = resolveQuestChoice(q.id, choice.id, nw, content, { factionId: "f1" });
    console.log("choice", res.ok, res.quest?.status);
  }
}

console.log("normalizeQuest", normalizeQuest({ id: "x", name: "N", summary: "s", systemId: null, status: "active" }).type);
console.log("A9 smoke ok");
