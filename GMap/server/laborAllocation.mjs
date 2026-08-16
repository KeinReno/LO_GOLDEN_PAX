/**
 * Per-planet job-slots labor (v0.5 allocateLabor), GMap-shaped.
 *
 * Replaces faction-wide `biosLaborScale` (currency.bios stock 0.25–1×) as the
 * production gate. Population is spent across enabled buildings in placement
 * order; each building's flow yield/convert and matching-deposit extraction
 * scale by its staffed fraction. Upkeep and pop_cap housing are not gated.
 *
 * `laborSlots` on a building def is optional; default is `max(1, tier)`.
 */
import {
  planetBuildingList,
  resolveBuildingDef,
} from "./flowEngine.mjs";
import { buildingUnlocksDeposit } from "./depositExtract.mjs";
import { laborPopulation } from "./populationScale.mjs";

/** Staffed job-slots → occupation id (labor units, not census). */
export const OCCUPATION_BY_KIND = {
  mine: "workers",
  farm: "farmers",
  lab: "scientists",
  institute: "scientists",
  factory: "industrial",
  forge: "industrial",
  barracks: "military",
  defense: "military",
  fortress: "military",
  shield: "military",
  shipyard: "naval",
  spaceport: "naval",
  capitol: "administrators",
  trade: "administrators",
  monument: "administrators",
  relay: "operators",
  platform: "operators",
  vat: "biologists",
  vault: "archivists",
};

export function occupationForDef(def) {
  if (!def) return "workers";
  if (def.kind && OCCUPATION_BY_KIND[def.kind]) return OCCUPATION_BY_KIND[def.kind];
  if (def.category === "F") return "scientists";
  if (def.category === "E") return "farmers";
  if (def.category === "A") return "workers";
  if (def.category === "C") return "industrial";
  if (def.category === "D") return "operators";
  if (def.category === "B") return "industrial";
  return "workers";
}

const FLOW_EFFECTS = new Set([
  "yield_flat",
  "production_flat",
  "flow_convert",
  "capacity_add",
]);

function asList(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

/** Stable key: instance id, else list index (tests often omit id). */
export function laborKey(buildingInst, index) {
  if (buildingInst?.id != null && String(buildingInst.id) !== "") {
    return String(buildingInst.id);
  }
  return `#${index}`;
}

/** Jobs needed for full output. Content `laborSlots` wins; else building tier. */
export function laborSlotsForDef(def) {
  const explicit = Number(def?.laborSlots);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const tier = Number(def?.tier);
  return Math.max(1, Number.isFinite(tier) && tier > 0 ? tier : 1);
}

/**
 * Housing (`pop_cap_add` only) does not consume workers — chicken-and-egg
 * (v0.5 header). Extractors and flow producers do.
 */
export function consumesLabor(def) {
  if (!def) return false;
  if (def.kind === "residential" || def.kind === "habitat") return false;
  if (def.kind && OCCUPATION_BY_KIND[def.kind]) return true;
  if (def.kind === "mine") return true;
  if (Object.prototype.hasOwnProperty.call(def, "extractsCategory")) return true;
  if (asList(def.extractsDeposits).length > 0) return true;
  if (["factory", "lab", "farm"].includes(def.kind)) return true;
  const effects = def.effects || [];
  if (effects.some((e) => FLOW_EFFECTS.has(e.effect))) return true;
  return false;
}

export function assignedLaborOf(inst) {
  if (!inst || !Object.prototype.hasOwnProperty.call(inst, "assignedLabor")) {
    return null;
  }
  if (inst.assignedLabor == null || inst.assignedLabor === "") return null;
  const n = Number(inst.assignedLabor);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/**
 * @returns {Record<string, number>} laborKey → staffed fraction [0, 1]
 */
export function allocateLabor(planet, content) {
  const buildings = planetBuildingList(planet);
  let remaining = laborPopulation(planet, content);
  const staffing = {};

  const visit = (pinnedOnly) => {
    buildings.forEach((b, i) => {
      if (b?.disabled) return;
      const def = resolveBuildingDef(content, b);
      if (!consumesLabor(def)) return;
      const key = laborKey(b, i);
      const pin = assignedLaborOf(b);
      if (pinnedOnly && pin == null) return;
      if (!pinnedOnly && pin != null) return;
      const need = laborSlotsForDef(def);
      const want = pin == null ? need : Math.min(need, pin);
      if (remaining <= 0 || want <= 0) {
        staffing[key] = 0;
        return;
      }
      const used = Math.min(want, remaining);
      staffing[key] = need > 0 ? used / need : 0;
      remaining -= used;
    });
  };

  visit(true);
  visit(false);
  return staffing;
}

function staffedUnitsNow(inst, index, def, staffing) {
  if (!consumesLabor(def)) return 0;
  const frac = staffing[laborKey(inst, index)] ?? 0;
  return Math.round(laborSlotsForDef(def) * frac);
}

/**
 * Move `amount` labor units from idle or a building to idle or a building.
 * Unassign-to-idle freezes auto buildings so the worker stays in the tray.
 */
export function applyStaffTransfer(planet, content, fromId, toId, rawAmount) {
  const amount = Math.max(1, Math.floor(Number(rawAmount) || 1));
  const from = fromId && fromId !== "idle" ? String(fromId) : null;
  const to = toId && toId !== "idle" ? String(toId) : null;
  if (from && to && from === to) return { ok: true, moved: 0 };
  const buildings = planetBuildingList(planet);
  const staffing = allocateLabor(planet, content);

  const indexOf = (id) => buildings.findIndex((b) => String(b.id) === id);
  const defOf = (inst) => resolveBuildingDef(content, inst);

  let available = 0;
  if (!from) {
    let used = 0;
    buildings.forEach((b, i) => {
      const def = defOf(b);
      if (!consumesLabor(def)) return;
      used += laborSlotsForDef(def) * (staffing[laborKey(b, i)] ?? 0);
    });
    available = Math.max(0, laborPopulation(planet, content) - used);
  } else {
    const i = indexOf(from);
    if (i < 0) return { ok: false, error: "Откуда: постройка не найдена" };
    const def = defOf(buildings[i]);
    if (!consumesLabor(def)) {
      return { ok: false, error: "Это здание не занимает рабочих" };
    }
    available = staffedUnitsNow(buildings[i], i, def, staffing);
  }

  let room = amount;
  if (to) {
    const i = indexOf(to);
    if (i < 0) return { ok: false, error: "Куда: постройка не найдена" };
    const def = defOf(buildings[i]);
    if (!consumesLabor(def)) {
      return { ok: false, error: "Сюда нельзя назначить рабочих" };
    }
    const slots = laborSlotsForDef(def);
    const have = staffedUnitsNow(buildings[i], i, def, staffing);
    room = Math.max(0, slots - have);
  }

  const moved = Math.min(amount, available, room);
  if (moved <= 0) return { ok: false, error: "Некого перевести" };

  if (!to) {
    buildings.forEach((b, i) => {
      if (assignedLaborOf(b) != null) return;
      const def = defOf(b);
      if (!consumesLabor(def)) return;
      b.assignedLabor = staffedUnitsNow(b, i, def, staffing);
    });
  }

  if (from) {
    const i = indexOf(from);
    const def = defOf(buildings[i]);
    const have = staffedUnitsNow(buildings[i], i, def, staffing);
    buildings[i].assignedLabor = Math.max(0, have - moved);
  }
  if (to) {
    const i = indexOf(to);
    const def = defOf(buildings[i]);
    const have = staffedUnitsNow(buildings[i], i, def, staffing);
    const slots = laborSlotsForDef(def);
    buildings[i].assignedLabor = Math.min(slots, have + moved);
  }
  return { ok: true, moved };
}

/** 1 if the building is not a labor consumer (housing); else staffed fraction. */
export function buildingStaffingFraction(content, staffing, buildingInst, index) {
  const def = resolveBuildingDef(content, buildingInst);
  if (!consumesLabor(def)) return 1;
  return staffing[laborKey(buildingInst, index)] ?? 0;
}

/**
 * Best staffed fraction among buildings that unlock this deposit.
 * Gate (`canExtractDeposit`) still decides whether extraction runs at all.
 */
export function depositStaffingFraction(planet, content, staffing, depositDef) {
  if (!depositDef) return 0;
  let best = 0;
  let matched = false;
  const buildings = planetBuildingList(planet);
  buildings.forEach((b, i) => {
    if (b?.disabled) return;
    const def = resolveBuildingDef(content, b);
    if (!buildingUnlocksDeposit(def, depositDef)) return;
    matched = true;
    best = Math.max(best, staffing[laborKey(b, i)] ?? 0);
  });
  return matched ? best : 0;
}

/**
 * Staffed labor units by occupation (scientists, workers, military, …).
 * Housing does not appear. Values are job-slot units, not census.
 */
export function occupationBreakdown(planet, content) {
  const staffing = allocateLabor(planet, content);
  const buildings = planetBuildingList(planet);
  const counts = {};
  buildings.forEach((b, i) => {
    if (b?.disabled) return;
    const def = resolveBuildingDef(content, b);
    if (!consumesLabor(def)) return;
    const frac = staffing[laborKey(b, i)] ?? 0;
    if (frac <= 0) return;
    const used = laborSlotsForDef(def) * frac;
    const occ = occupationForDef(def);
    counts[occ] = (counts[occ] || 0) + used;
  });
  return counts;
}

export function addOccupationCounts(into, part) {
  for (const [k, v] of Object.entries(part || {})) {
    const n = Number(v) || 0;
    if (n <= 0) continue;
    into[k] = (into[k] || 0) + n;
  }
  return into;
}
