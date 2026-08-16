/**
 * Verb catalog for the player UI: ids/names/costs/gates only.
 * Not a domain ruleset — a read of already-loaded content packs.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function costOf(def) {
  if (!def?.cost || typeof def.cost !== "object") return undefined;
  const out = {};
  for (const [k, v] of Object.entries(def.cost)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function pickBuilding(def) {
  if (!def?.id || !def?.name) return null;
  const out = { id: String(def.id), name: String(def.name) };
  if (def.kind != null) out.kind = String(def.kind);
  if (def.zone != null) out.zone = String(def.zone);
  const tier = num(def.tier);
  if (tier != null) out.tier = tier;
  const labor = num(def.laborSlots);
  if (labor != null) out.laborSlots = labor;
  const cost = costOf(def);
  if (cost) out.cost = cost;
  if (Array.isArray(def.biome_restrictions) && def.biome_restrictions.length) {
    out.biome_restrictions = def.biome_restrictions.map(String);
  }
  if (def.faction != null) out.faction = String(def.faction);
  if (def.category != null) out.category = String(def.category);
  const maxP = num(def.maxPerPlanet);
  if (maxP != null) out.maxPerPlanet = maxP;
  const maxS = num(def.maxPerSystem);
  if (maxS != null) out.maxPerSystem = maxS;
  const prereq = def.prerequisites;
  if (prereq && (prereq.race || prereq.races)) {
    out.prerequisites = {};
    if (prereq.race) out.prerequisites.race = String(prereq.race);
    if (Array.isArray(prereq.races) && prereq.races.length) {
      out.prerequisites.races = prereq.races.map(String);
    }
  }
  return out;
}

function pickForce(def, kind) {
  if (!def?.id || !def?.name) return null;
  const out = { id: String(def.id), name: String(def.name), kind };
  if (def.raisableWithoutBuilding === true) out.raisableWithoutBuilding = true;
  if (def.requiresTech) out.requiresTech = String(def.requiresTech);
  const cost = costOf(def);
  if (cost) out.cost = cost;
  const tier = num(def.tier);
  if (tier != null) out.tier = tier;
  if (def.faction != null) out.faction = String(def.faction);
  return out;
}

function pickTaxes(taxes) {
  const out = {};
  for (const [slotId, slot] of Object.entries(taxes || {})) {
    if (!slot || typeof slot !== "object") continue;
    const tiers = (slot.tiers || [])
      .filter((t) => t && t.id != null)
      .map((t) => {
        const row = { id: String(t.id), rate: Number(t.rate) || 0 };
        if (t.label != null) row.label = String(t.label);
        return row;
      });
    out[slotId] = slot.name ? { name: String(slot.name), tiers } : { tiers };
  }
  return out;
}

function pickCurrencies(currencies) {
  const out = {};
  for (const [id, c] of Object.entries(currencies || {})) {
    if (!c?.name) continue;
    const row = { id: String(c.id || id), name: String(c.name) };
    if (c.short != null) row.short = String(c.short);
    out[id] = row;
  }
  return out;
}

function values(dict) {
  return Object.values(dict && typeof dict === "object" ? dict : {});
}

/** @param {ReturnType<import("../contentLoader.mjs").getContent>} content */
export function tableCatalogFromContent(content) {
  const buildings = values(content?.buildings).map(pickBuilding).filter(Boolean);
  const units = values(content?.units).map((d) => pickForce(d, "unit")).filter(Boolean);
  const ships = values(content?.ships).map((d) => pickForce(d, "ship")).filter(Boolean);
  const taxes = pickTaxes(content?.taxes);
  const currencies = pickCurrencies(content?.currencies);
  return { buildings, units, ships, taxes, currencies };
}
