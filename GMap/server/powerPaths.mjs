/**
 * B9 — Пути Силы: лорные флаги на фракции/расе, не RoleScore.
 */
import { getContent } from "./contentLoader.mjs";
import { resolveRace } from "./raceRegistry.mjs";
import { factionPrimaryRaceId } from "./techPaths.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
} from "./ledger.mjs";
import { appendGmIntervention } from "./gmCockpit.mjs";
import { factionScopedActiveEffects } from "./courtGovernance.mjs";

const VALID_PATHS = new Set(["mind", "will", "chaos", "shadow"]);

export function listPowerPathDefs(content) {
  const c = content || getContent();
  return Object.values(c.power_paths?.paths || {});
}

export function normalizePowerPathId(raw) {
  const id = String(raw || "").trim();
  return VALID_PATHS.has(id) ? id : null;
}

/**
 * Race content + GM grants on ledger eco.powerPaths.
 */
export function resolveFactionPowerPaths(faction, content, eco) {
  const c = content || getContent();
  const paths = new Set();
  const raceId = factionPrimaryRaceId(faction);
  if (raceId) {
    const raw = c.races?.[raceId];
    if (Array.isArray(raw?.powerPath)) {
      for (const p of raw.powerPath) {
        const n = normalizePowerPathId(p);
        if (n) paths.add(n);
      }
    }
    const resolved = resolveRace(raceId, c.races);
    if (Array.isArray(resolved?.powerPath)) {
      for (const p of resolved.powerPath) {
        const n = normalizePowerPathId(p);
        if (n) paths.add(n);
      }
    }
  }
  for (const p of eco?.powerPaths || []) {
    const n = normalizePowerPathId(p);
    if (n) paths.add(n);
  }
  return [...paths];
}

export function factionHasPowerPath(faction, pathId, content, eco) {
  const id = normalizePowerPathId(pathId);
  if (!id) return false;
  return resolveFactionPowerPaths(faction, content, eco).includes(id);
}

export function requiredPathForEffect(effect) {
  if (effect === "power_mind_strike") return "mind";
  if (effect === "power_will_sway") return "will";
  return null;
}

/**
 * Drop or normalize power-gated effects when faction lacks the path.
 */
export function filterPowerGatedEffects(effects, faction, content, eco) {
  const paths = resolveFactionPowerPaths(faction, content, eco);
  const out = [];
  for (const e of effects || []) {
    const need = requiredPathForEffect(e?.effect);
    if (need && !paths.includes(need)) continue;
    if (e?.effect === "power_will_sway") {
      out.push({
        ...e,
        effect: "loyalty_add",
        args: {
          amount: Number(e.args?.amount ?? -2),
          ...(e.args?.raceId ? { raceId: e.args.raceId } : {}),
        },
        source: e.source || { kind: "power", id: "will", label: "Воля" },
      });
      continue;
    }
    out.push(e);
  }
  return out;
}

export function canApplyPowerEffect(faction, effectName, content, eco) {
  const need = requiredPathForEffect(effectName);
  if (!need) return true;
  return factionHasPowerPath(faction, need, content, eco);
}

/** Combat multiplier from gated power_mind_strike effects. */
export function collectPowerMindStrikeMult(world, factionId, content) {
  const c = content || getContent();
  const faction = (world?.factions ?? []).find((f) => f.id === factionId);
  if (!faction) return 1;
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  if (!factionHasPowerPath(faction, "mind", c, eco)) return 1;

  let mult = 1;
  const scan = (list) => {
    for (const e of list || []) {
      if (e?.effect !== "power_mind_strike") continue;
      const m = Number(e.args?.mult ?? e.args?.damageMult ?? 1.1);
      if (Number.isFinite(m) && m > 0) mult *= m;
    }
  };
  scan(factionScopedActiveEffects(faction));
  const raceId = factionPrimaryRaceId(faction);
  const race = resolveRace(raceId, c.races);
  for (const trait of race?.traits || []) {
    scan(trait.effects);
  }
  return mult;
}

/**
 * GM «касание Хивера» — grant path on faction ledger eco (not global race content).
 */
export function grantPowerTouch(factionId, powerPath, world, opts = {}) {
  const id = normalizePowerPathId(powerPath);
  if (!id) return { ok: false, error: "powerPath: mind | will | chaos | shadow" };
  const fac = (world?.factions ?? []).find((f) => f.id === factionId);
  if (!fac) return { ok: false, error: "фракция не найдена" };

  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  if (!Array.isArray(eco.powerPaths)) eco.powerPaths = [];
  const before = [...eco.powerPaths];
  if (!eco.powerPaths.includes(id)) eco.powerPaths.push(id);
  writeLedger(ledger);

  if (!opts.skipLog) {
    appendGmIntervention({
      actor: "gm",
      action: "grant_power_touch",
      before: { factionId, powerPaths: before },
      after: { factionId, powerPaths: [...eco.powerPaths], added: id },
      detail: { powerPath: id },
    });
  }

  return {
    ok: true,
    factionId,
    powerPath: id,
    powerPaths: resolveFactionPowerPaths(fac, getContent(), eco),
  };
}

export function powerPathsPayload(faction, eco, content) {
  const c = content || getContent();
  const paths = resolveFactionPowerPaths(faction, c, eco);
  const defs = c.power_paths?.paths || {};
  return paths.map((id) => ({
    id,
    label: defs[id]?.label || id,
    severedByEmbodiment: defs[id]?.severedByEmbodiment ?? false,
  }));
}
