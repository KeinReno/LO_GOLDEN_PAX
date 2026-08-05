/**
 * Spawn story quests from story_quests.json catalog onto the live board.
 */
import { getContent } from "./contentLoader.mjs";
import {
  normalizeQuest,
  matchesFilter,
  buildFilterContext,
} from "./questEngine.mjs";
import { readLiveBoard, writeLiveBoard } from "./tableStore.mjs";

function nowIso() {
  return new Date().toISOString();
}

function pickSystemId(world, factionId, placement) {
  const pick = placement?.systemPick ?? "random_owned";
  if (pick === "none" || placement?.onMap === false) return null;
  if (pick === "fixed" && placement?.systemId) return placement.systemId;
  const owned = (world.systems ?? []).filter((s) => s.ownerFactionId === factionId);
  if (!owned.length) return null;
  return owned[Math.floor(Math.random() * owned.length)]?.id ?? null;
}

function resolveCatalogDef(content, catalogId) {
  const bag = content?.story_quests?.quests;
  if (!bag) return null;
  return bag[catalogId] || null;
}

function storyDefToInstance(def, factionId, systemId, turn) {
  const expires =
    def.completion?.expiresTurns != null
      ? turn + Number(def.completion.expiresTurns)
      : null;
  const hasChoices = def.hasChoices !== false && (def.choices?.length ?? 0) > 0;
  return normalizeQuest({
    id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    catalogId: def.id,
    name: def.name,
    summary: def.summary || "",
    detail: def.detail || "",
    type: def.kind || "side",
    systemId: def.placement?.onMap !== false ? systemId : null,
    sourceSystemId: systemId,
    sourceFactionId: factionId,
    sourceNpcId: def.sourceNpcId ?? null,
    status: "active",
    choices: hasChoices ? structuredClone(def.choices) : undefined,
    diceRequired: def.diceRequired?.length
      ? structuredClone(def.diceRequired)
      : undefined,
    arc: def.arc ? structuredClone(def.arc) : undefined,
    expiresTurn: expires,
    history: [
      {
        at: nowIso(),
        turn,
        kind: "message",
        body: "Сюжетный квест выдан из каталога Atelier.",
      },
    ],
    tags: def.tags,
    secret: def.secret,
    narrative: def.narrative,
    objectives: def.objectives,
    completionMode: def.completion?.mode,
  });
}

export function spawnStoryQuestFromCatalog(catalogId, factionId, opts = {}) {
  const content = getContent();
  const def = resolveCatalogDef(content, catalogId);
  if (!def) return { ok: false, error: `Квест не найден: ${catalogId}` };

  const world = opts.world || readLiveBoard();
  if (!world) return { ok: false, error: "Нет live board" };

  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  if (!faction) return { ok: false, error: "Фракция не найдена" };

  const audience = def.audience || {};
  if (
    !audience.allFactions &&
    audience.factionIds?.length &&
    !audience.factionIds.includes(factionId)
  ) {
    return { ok: false, error: "Квест не предназначен этой фракции" };
  }

  const era = world.meta?.era ?? 1;
  if (audience.minEra != null && era < Number(audience.minEra)) {
    return { ok: false, error: `Нужна эра ≥ ${audience.minEra}` };
  }

  const ctx = buildFilterContext(world, factionId);
  if (def.filterBy && !matchesFilter(def.filterBy, ctx)) {
    return { ok: false, error: "Условия filterBy не выполнены" };
  }

  const turn = world.meta?.turn ?? 0;
  const systemId = opts.systemId ?? pickSystemId(world, factionId, def.placement);

  const quest = storyDefToInstance(def, factionId, systemId, turn);
  if (!Array.isArray(world.quests)) world.quests = [];
  world.quests.push(quest);

  if (!opts.skipWrite) {
    writeLiveBoard(world, {
      backup: true,
      reason: "spawn_story_quest",
      alsoDraft: true,
    });
  }

  return { ok: true, quest, world: opts.returnWorld ? world : undefined };
}

export function listStoryQuestCatalog(content = getContent()) {
  const bag = content?.story_quests?.quests || {};
  return Object.values(bag).map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind || "side",
    hasChoices: d.hasChoices !== false,
  }));
}
