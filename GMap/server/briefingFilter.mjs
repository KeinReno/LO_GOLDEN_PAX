/**
 * Faction-filtered turn briefing from lastJournal (P2.5).
 * Reuses journal data — no second log.
 */
import { getTableMeta } from "./tableStore.mjs";

const GM_ONLY = new Set([
  "timer_remove_poi",
  "timer_add_poi",
  "timer_clear_activity",
  "timer_set_activity",
  "timer_fired",
  "preset_applied",
  "skip",
]);

function systemOwnerMap(world) {
  const m = new Map();
  for (const s of world?.systems ?? []) {
    if (s.ownerFactionId) m.set(s.id, s.ownerFactionId);
  }
  return m;
}

function eventTouchesFaction(event, factionId, owners) {
  if (event.factionId === factionId) return true;
  if (event.toFactionId === factionId) return true;
  if (event.attacker === factionId || event.defender === factionId) return true;
  if (Array.isArray(event.sides) && event.sides.includes(factionId)) return true;
  if (event.systemId && owners.get(event.systemId) === factionId) return true;
  return false;
}

/**
 * @param {object|null} journal full lastJournal from table-meta
 * @param {string} factionId
 * @param {object|null} [world] live board for system ownership hints
 */
export function filterBriefingForFaction(journal, factionId, world = null) {
  if (!journal || !factionId) return null;

  const owners = systemOwnerMap(world);
  const events = (journal.events ?? []).filter(
    (e) => !GM_ONLY.has(e.type) && eventTouchesFaction(e, factionId, owners),
  );

  const rawEco = journal.economy?.[factionId] ?? null;
  const economy = rawEco
    ? {
        net: events.find((e) => e.type === "economy" && e.factionId === factionId)
            ?.net ??
          summarizeNetFromBreakdown(rawEco),
        deficit: rawEco.deficit,
        pressure: rawEco.pressure,
        apMax: rawEco.apMax,
      }
    : events.find((e) => e.type === "economy" && e.factionId === factionId)
      ? {
          net: events.find((e) => e.type === "economy" && e.factionId === factionId)
            .net,
          deficit: events.find((e) => e.type === "economy" && e.factionId === factionId)
            .deficit,
          pressure: events.find((e) => e.type === "economy" && e.factionId === factionId)
            .pressure,
          apMax: events.find((e) => e.type === "economy" && e.factionId === factionId)
            .apMax,
        }
      : null;

  return {
    turnFrom: journal.turnFrom,
    turnTo: journal.turnTo,
    economy,
    events,
  };
}

function summarizeNetFromBreakdown(breakdown) {
  const channels = breakdown.channels ?? {};
  const net = {};
  for (const [id, ch] of Object.entries(channels)) {
    if (ch && typeof ch.net === "number") net[id] = ch.net;
  }
  return net;
}

export function getFactionBriefing(factionId, world = null) {
  const journal = getTableMeta().lastJournal ?? null;
  return filterBriefingForFaction(journal, factionId, world);
}
