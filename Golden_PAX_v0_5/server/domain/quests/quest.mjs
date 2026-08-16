/**
 * Quest shape helpers. Ported from GMap/server/questEngine.mjs.
 * normalizeQuest parity-verified (exported, pure aside from a random
 * fallback id) in quest.parity.test.mjs; catalogQuestToInstance is
 * module-private in GMap (behavior-tested) and takes `systemId` as a
 * plain argument here instead of picking one from `world` itself
 * (GMap's pickSystemId) — same caller-supplied pattern as elsewhere.
 */

export function normalizeQuest(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    ...raw,
    id: String(raw.id || `q_${Math.random().toString(36).slice(2, 8)}`),
    name: String(raw.name || "Квест"),
    summary: String(raw.summary || ""),
    detail: raw.detail,
    systemId: raw.systemId ?? null,
    status: raw.status || "active",
    type: raw.type || "side",
    sourceFactionId: raw.sourceFactionId ?? null,
    sourceSystemId: raw.sourceSystemId ?? raw.systemId ?? null,
    sourceNpcId: raw.sourceNpcId ?? null,
    arc: raw.arc,
    history: Array.isArray(raw.history) ? raw.history : [],
    choices: Array.isArray(raw.choices) ? raw.choices : undefined,
    diceRequired: Array.isArray(raw.diceRequired) ? raw.diceRequired : undefined,
    expiresTurn: raw.expiresTurn ?? null,
    catalogId: raw.catalogId ?? null,
  };
}

/**
 * Advance a quest linked from an NPC court task. Port of GMap/server/
 * narrative.mjs `advanceLinkedQuest` (arc stage bump, or a simple
 * quest_task_done journal if the quest has no arc). Plain list in / list
 * out — quests are not persisted in this project yet, so callers hold the
 * array (tests, or a future quest store).
 *
 * @param {object[]} quests
 * @param {string} linkedQuestId
 * @param {{ npcId?: string }} [ctx]
 */
export function advanceLinkedQuest(quests, linkedQuestId, ctx = {}) {
  if (!linkedQuestId) return { quests: quests ?? [], journal: [] };
  const list = (quests ?? []).map((q) => ({ ...q, arc: q.arc ? { ...q.arc } : q.arc }));
  const quest = list.find((q) => q.id === linkedQuestId);
  if (!quest) return { quests: list, journal: [] };
  if (!quest.arc || !Array.isArray(quest.arc.stages)) {
    return {
      quests: list,
      journal: [{ type: "court", subtype: "quest_task_done", questId: linkedQuestId, npcId: ctx.npcId }],
    };
  }
  const cur = quest.arc.currentStage ?? 0;
  const next = cur + 1;
  if (next >= quest.arc.stages.length) {
    quest.arc.currentStage = quest.arc.stages.length - 1;
    if (quest.status === "active") quest.status = "done";
    return {
      quests: list,
      journal: [{ type: "court", subtype: "quest_arc_complete", questId: quest.id, npcId: ctx.npcId }],
    };
  }
  quest.arc.currentStage = next;
  return {
    quests: list,
    journal: [{ type: "court", subtype: "quest_arc_advance", questId: quest.id, stage: next, npcId: ctx.npcId }],
  };
}

/** @param {object} def  a yearly_quests catalog entry */
export function catalogQuestToInstance(def, factionId, systemId, turn, expiresTurn) {
  return {
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    catalogId: def.id,
    name: def.name,
    summary: def.summary,
    detail: def.detail || "",
    systemId,
    sourceSystemId: systemId,
    sourceFactionId: factionId,
    status: "active",
    type: "yearly",
    history: [{ at: new Date().toISOString(), turn, kind: "message", body: "Квест появился в ежходном пуле." }],
    choices: Array.isArray(def.choices) ? structuredClone(def.choices) : [],
    diceRequired: Array.isArray(def.diceRequired) ? structuredClone(def.diceRequired) : undefined,
    expiresTurn,
  };
}
