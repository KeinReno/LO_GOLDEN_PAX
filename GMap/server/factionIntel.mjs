/**
 * Faction contact / intel memory.
 * A polity remembers others after sensor contact or non-neutral diplomacy.
 * Local DATA_DIR avoids TDZ on circular import through tableStore.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson } from "./tableStore.mjs";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data",
);
export const CONTACTS_PATH = path.join(DATA_DIR, "faction-contacts.json");

/** Relations that imply mutual awareness even without sensors. */
const DIPLO_CONTACT_RELATIONS = new Set([
  "alliance",
  "trade",
  "war",
  "vassal",
  "truce",
]);

/** Relations that open a trade corridor. */
const TRADE_CHANNEL_RELATIONS = new Set(["trade", "alliance"]);

function emptyStore() {
  return { contacts: {} };
}

export function readContacts() {
  const raw = readJson(CONTACTS_PATH, null);
  if (!raw || typeof raw !== "object" || typeof raw.contacts !== "object") {
    return emptyStore();
  }
  return { contacts: { ...raw.contacts } };
}

export function writeContacts(store) {
  writeJson(CONTACTS_PATH, {
    contacts: store?.contacts ?? {},
  });
}

export function getDiplomacyRelation(world, aId, bId) {
  if (!aId || !bId || aId === bId) return "neutral";
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  return (
    (world.diplomacy ?? []).find(
      (d) => d.aId === x && d.bId === y && (!d.track || d.track === "political"),
    )?.relation ?? "neutral"
  );
}

export function hasTradeChannel(world, aId, bId) {
  return TRADE_CHANNEL_RELATIONS.has(getDiplomacyRelation(world, aId, bId));
}

/**
 * Factions visible via fog: owners of visible systems, or fleets/legions there.
 */
export function discoverContactsFromVision(world, factionId, visibleSystemIds) {
  const found = new Set();
  const visible = new Set(visibleSystemIds ?? []);
  for (const s of world.systems ?? []) {
    if (!visible.has(s.id)) continue;
    if (s.ownerFactionId && s.ownerFactionId !== factionId) {
      found.add(s.ownerFactionId);
    }
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId) continue;
    if (visible.has(f.systemId)) found.add(f.factionId);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId) continue;
    if (visible.has(l.systemId)) found.add(l.factionId);
  }
  return found;
}

/** Non-neutral diplomacy edges involving this faction. */
export function discoverContactsFromDiplomacy(world, factionId) {
  const found = new Set();
  for (const d of world.diplomacy ?? []) {
    if (!DIPLO_CONTACT_RELATIONS.has(d.relation)) continue;
    if (d.aId === factionId && d.bId) found.add(d.bId);
    if (d.bId === factionId && d.aId) found.add(d.aId);
  }
  return found;
}

export function rememberedContacts(factionId) {
  const store = readContacts();
  const list = store.contacts[factionId];
  return new Set(Array.isArray(list) ? list.filter(Boolean) : []);
}

/**
 * Persist newly discovered ids. Returns full remembered set after merge.
 */
export function mergeContacts(factionId, newlyKnown) {
  const store = readContacts();
  const prev = new Set(
    Array.isArray(store.contacts[factionId]) ? store.contacts[factionId] : [],
  );
  let changed = false;
  for (const id of newlyKnown) {
    if (!id || id === factionId) continue;
    if (!prev.has(id)) {
      prev.add(id);
      changed = true;
    }
  }
  if (changed) {
    store.contacts[factionId] = [...prev].sort();
    writeContacts(store);
  }
  return prev;
}

/**
 * Refresh memory from vision + diplomacy; return known faction ids (excl. self).
 */
export function ensureContactsForFaction(world, factionId, visibleSystemIds) {
  const discovered = new Set([
    ...discoverContactsFromVision(world, factionId, visibleSystemIds),
    ...discoverContactsFromDiplomacy(world, factionId),
  ]);
  return mergeContacts(factionId, discovered);
}

/**
 * Known = remembered contacts ∪ live vision ∪ diplo (after ensure).
 * Includes self.
 */
export function getKnownFactionIds(world, factionId, visibleSystemIds) {
  const known = ensureContactsForFaction(world, factionId, visibleSystemIds);
  known.add(factionId);
  return known;
}

/** Trade partners among known polities. */
export function getTradePartnerIds(world, factionId, knownIds) {
  const known = knownIds ?? getKnownFactionIds(world, factionId, []);
  const partners = [];
  for (const id of known) {
    if (id === factionId) continue;
    if (hasTradeChannel(world, factionId, id)) partners.push(id);
  }
  return partners.sort();
}

/**
 * Refresh contacts for every polity (call on tick).
 */
export function refreshAllFactionContacts(world, getVisibleSystemIds) {
  for (const f of world.factions ?? []) {
    if (!f?.id) continue;
    const visible = getVisibleSystemIds
      ? getVisibleSystemIds(world, f.id)
      : (world.systems ?? []).map((s) => s.id);
    ensureContactsForFaction(world, f.id, [...visible]);
  }
}
