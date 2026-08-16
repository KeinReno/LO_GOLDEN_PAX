/**
 * GM quick-balance snapshot + discrete patches (economy_balance.json, rules.json).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CONTENT_ROOT, getContent, loadContent } from "./contentLoader.mjs";
import { produceForceCost } from "./forceEconomy.mjs";
import { appendGmIntervention } from "./gmCockpit.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GMAP_ROOT = path.resolve(__dirname, "..");
const ECON_BALANCE_PATH = path.join(CONTENT_ROOT, "core", "economy_balance.json");
const RULES_PATH = path.join(CONTENT_ROOT, "core", "rules.json");

const REGEN_SCRIPTS = {
  buildings: "scripts/buildBuildings.mjs",
  forces: "scripts/buildUnitsShips.mjs",
  stations: "scripts/buildStations.mjs",
};

const EARLY_BUILDING_IDS = [
  "building.barracks",
  "building.spaceport",
  "building.shipyard",
];

const SAMPLE_FORCES = [
  { kind: "ship", id: "ship.scout", tier: 1 },
  { kind: "ship", id: "ship.corvette", tier: 3 },
  { kind: "unit", id: "unit.militia", tier: 1 },
];

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    const msg = `[CONTENT_PARSE_FAIL] ${filePath}: ${e.message}`;
    console.error(msg);
    throw new Error(msg, { cause: e });
  }
}

function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = `${JSON.stringify(data, null, 2)}\n`;
  fs.writeFileSync(tmp, body, "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.renameSync(tmp, filePath);
  }
}

function clampNum(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function countBag(bag) {
  if (!bag || typeof bag !== "object") return 0;
  return Object.keys(bag).filter((k) => k !== "meta").length;
}

function resolveForceDef(content, kind, id, fallbackTier) {
  const bag = kind === "ship" ? content.ships : content.units;
  const def = bag?.[id];
  if (def) return def;
  return { id, tier: fallbackTier };
}

export function buildGmBalanceSnapshot() {
  const content = getContent();
  const bal = content?.economy_balance || {};

  const sampleCosts = {};
  for (const row of SAMPLE_FORCES) {
    const def = resolveForceDef(content, row.kind, row.id, row.tier);
    sampleCosts[row.id] = produceForceCost(row.kind, def, 1);
  }

  const earlyBuildings = EARLY_BUILDING_IDS.map((id) => {
    const b = content.buildings?.[id];
    return {
      id,
      name: b?.name ?? id,
      tier: b?.tier ?? null,
      cost: b?.cost ?? null,
    };
  });

  const stationsFromContent = countBag(content.stations);
  const stationsFromBal = Object.keys(bal.forces?.stations || {}).length;

  return {
    ap: bal.ap ?? null,
    rulesAp: {
      apPerTurn: content.rules?.apPerTurn ?? null,
      forceAp: content.rules?.forceAp ?? null,
    },
    start: bal.start ?? null,
    freeBuildTier:
      bal.interconnect?.freeBuildTier ??
      bal.principles?.freeBuildTier ??
      null,
    metalByTier: bal.buildings?.metalByTier ?? null,
    forces: {
      shipCostMult: bal.forces?.shipCostMult ?? null,
      unitCostMult: bal.forces?.unitCostMult ?? null,
      supplyRatio: bal.forces?.supplyRatio ?? null,
    },
    baseline: {
      ships: (bal.baseline?.ships ?? []).map((s) => s.id),
      units: (bal.baseline?.units ?? []).map((u) => u.id),
    },
    counts: {
      buildings: countBag(content.buildings),
      ships: countBag(content.ships),
      units: countBag(content.units),
      stations: stationsFromContent || stationsFromBal,
    },
    earlyBuildings,
    sampleCosts,
    alchemy: {
      ...(content.rules?.alchemy || {}),
      ...(bal.alchemy || {}),
      maxSameEraSpend:
        Number(content.rules?.alchemy?.attemptsPerTurn ?? 2) *
        Number(content.rules?.alchemy?.baseCost ?? 6),
    },
    cardBattle: {
      handSize: content.rules?.cardBattle?.handSize ?? null,
      maxRounds: content.rules?.cardBattle?.maxRounds ?? null,
      energyPerRound: content.rules?.cardBattle?.energyPerRound ?? null,
      trophies: content.rules?.cardBattle?.trophies ?? null,
      note: bal.cardBattle?.note ?? null,
    },
    techMarket: {
      bazaars: Object.keys(content.tech_market || {}).length,
      listings: Object.values(content.tech_market || {}).reduce(
        (n, m) => n + (Array.isArray(m?.listings) ? m.listings.length : 0),
        0,
      ),
      sample: Object.values(content.tech_market || {})
        .flatMap((m) => m?.listings || [])
        .slice(0, 6)
        .map((l) => ({
          id: l.listingId,
          price: l.price,
          techId: l.techId || null,
          recipeId: l.recipeId || null,
        })),
    },
    spec: bal.meta?.spec ?? "docs/BALANCE_BASELINE_SPEC.md",
  };
}

function logBalanceIntervention(action, before, after, body) {
  try {
    appendGmIntervention({
      actor: body?.actor || "gm",
      action,
      before,
      after,
      detail: body?.detail ?? null,
    });
  } catch (e) {
    console.error("[GM_INTERVENTION_LOG_FAIL]", e?.message || e);
  }
}

export function applyGmBalancePatch(body) {
  const action = body?.action;
  if (!action) return { ok: false, error: "Нужен action" };

  switch (action) {
    case "setAp": {
      const empire =
        body.empire != null ? clampNum(Number(body.empire), 1, 24) : null;
      const forceBase =
        body.forceBase != null ? clampNum(Number(body.forceBase), 0, 12) : null;
      const forceMax =
        body.forceMax != null ? clampNum(Number(body.forceMax), 1, 24) : null;

      if (empire == null && forceBase == null && forceMax == null) {
        return { ok: false, error: "Нет полей для setAp" };
      }

      const bal = readJsonFile(ECON_BALANCE_PATH);
      const rules = readJsonFile(RULES_PATH);
      bal.ap = bal.ap || {};
      rules.forceAp = rules.forceAp || {};
      bal.ap.force = bal.ap.force || {};

      const before = {
        empirePerTurn: bal.ap.empirePerTurn ?? rules.apPerTurn ?? null,
        forceBase: bal.ap.force.base ?? rules.forceAp.base ?? null,
        forceMax: bal.ap.force.max ?? rules.forceAp.max ?? null,
      };

      if (empire != null && Number.isFinite(empire)) {
        bal.ap.empirePerTurn = empire;
        rules.apPerTurn = empire;
      }
      if (forceBase != null && Number.isFinite(forceBase)) {
        bal.ap.force.base = forceBase;
        rules.forceAp.base = forceBase;
      }
      if (forceMax != null && Number.isFinite(forceMax)) {
        bal.ap.force.max = forceMax;
        rules.forceAp.max = forceMax;
      }

      writeJsonFile(ECON_BALANCE_PATH, bal);
      writeJsonFile(RULES_PATH, rules);
      loadContent();
      const after = {
        empirePerTurn: bal.ap.empirePerTurn ?? rules.apPerTurn ?? null,
        forceBase: bal.ap.force.base ?? rules.forceAp.base ?? null,
        forceMax: bal.ap.force.max ?? rules.forceAp.max ?? null,
      };
      logBalanceIntervention("setAp", before, after, body);
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "setStartStock": {
      const currencyId = String(body.currencyId || "");
      if (!currencyId.startsWith("currency.")) {
        return { ok: false, error: "currencyId должен начинаться с currency." };
      }
      const amount = clampNum(Number(body.amount), 0, 99999);
      if (!Number.isFinite(amount)) {
        return { ok: false, error: "amount — число" };
      }

      const bal = readJsonFile(ECON_BALANCE_PATH);
      bal.start = bal.start || {};
      bal.start.stocks = bal.start.stocks || {};
      const before = { currencyId, amount: Number(bal.start.stocks[currencyId] || 0) };
      bal.start.stocks[currencyId] = amount;
      writeJsonFile(ECON_BALANCE_PATH, bal);
      loadContent();
      logBalanceIntervention(
        "setStartStock",
        before,
        { currencyId, amount },
        body,
      );
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "bumpStartStock": {
      const currencyId = String(body.currencyId || "currency.metal");
      const delta = Number(body.delta);
      if (!Number.isFinite(delta)) {
        return { ok: false, error: "delta — число" };
      }
      const bal = readJsonFile(ECON_BALANCE_PATH);
      bal.start = bal.start || {};
      bal.start.stocks = bal.start.stocks || {};
      const cur = Number(bal.start.stocks[currencyId] || 0);
      const before = { currencyId, amount: cur };
      bal.start.stocks[currencyId] = clampNum(cur + delta, 0, 99999);
      writeJsonFile(ECON_BALANCE_PATH, bal);
      loadContent();
      logBalanceIntervention(
        "bumpStartStock",
        before,
        { currencyId, amount: bal.start.stocks[currencyId], delta },
        body,
      );
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "setForceMult": {
      if (body.shipCostMult == null && body.unitCostMult == null) {
        return { ok: false, error: "Нужен shipCostMult и/или unitCostMult" };
      }
      const bal = readJsonFile(ECON_BALANCE_PATH);
      bal.forces = bal.forces || {};
      const before = {
        shipCostMult: bal.forces.shipCostMult ?? null,
        unitCostMult: bal.forces.unitCostMult ?? null,
      };
      if (body.shipCostMult != null) {
        bal.forces.shipCostMult = clampNum(Number(body.shipCostMult), 0.5, 5);
      }
      if (body.unitCostMult != null) {
        bal.forces.unitCostMult = clampNum(Number(body.unitCostMult), 0.5, 5);
      }
      writeJsonFile(ECON_BALANCE_PATH, bal);
      loadContent();
      logBalanceIntervention(
        "setForceMult",
        before,
        {
          shipCostMult: bal.forces.shipCostMult ?? null,
          unitCostMult: bal.forces.unitCostMult ?? null,
        },
        body,
      );
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "setAlchemy": {
      const bal = readJsonFile(ECON_BALANCE_PATH);
      const rules = readJsonFile(RULES_PATH);
      bal.alchemy = bal.alchemy || {};
      rules.alchemy = rules.alchemy || {};
      const before = {
        attemptsPerTurn:
          bal.alchemy.attemptsPerTurn ?? rules.alchemy.attemptsPerTurn ?? null,
        baseCost: bal.alchemy.baseCost ?? rules.alchemy.baseCost ?? null,
        eraGapCost: bal.alchemy.eraGapCost ?? rules.alchemy.eraGapCost ?? null,
      };
      if (body.attemptsPerTurn != null) {
        const n = clampNum(Number(body.attemptsPerTurn), 1, 5);
        bal.alchemy.attemptsPerTurn = n;
        rules.alchemy.attemptsPerTurn = n;
      }
      if (body.baseCost != null) {
        const n = clampNum(Number(body.baseCost), 1, 24);
        bal.alchemy.baseCost = n;
        rules.alchemy.baseCost = n;
      }
      if (body.eraGapCost != null) {
        const n = clampNum(Number(body.eraGapCost), 0, 12);
        bal.alchemy.eraGapCost = n;
        rules.alchemy.eraGapCost = n;
      }
      writeJsonFile(ECON_BALANCE_PATH, bal);
      writeJsonFile(RULES_PATH, rules);
      loadContent();
      logBalanceIntervention(
        "setAlchemy",
        before,
        {
          attemptsPerTurn: bal.alchemy.attemptsPerTurn ?? null,
          baseCost: bal.alchemy.baseCost ?? null,
          eraGapCost: bal.alchemy.eraGapCost ?? null,
        },
        body,
      );
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "reloadContent": {
      loadContent();
      return { ok: true, snapshot: buildGmBalanceSnapshot() };
    }

    case "regen": {
      const target = String(body.target || "all");
      const keys =
        target === "all"
          ? Object.keys(REGEN_SCRIPTS)
          : target in REGEN_SCRIPTS
            ? [target]
            : null;
      if (!keys) {
        return {
          ok: false,
          error: `target: buildings | forces | stations | all (got ${target})`,
        };
      }
      const logs = [];
      for (const key of keys) {
        const scriptRel = REGEN_SCRIPTS[key];
        const scriptAbs = path.join(GMAP_ROOT, scriptRel);
        if (!fs.existsSync(scriptAbs)) {
          return { ok: false, error: `Нет скрипта ${scriptRel}` };
        }
        const run = spawnSync(process.execPath, [scriptAbs], {
          cwd: GMAP_ROOT,
          encoding: "utf8",
          timeout: 120_000,
        });
        if (run.status !== 0) {
          return {
            ok: false,
            error: `regen ${key} failed: ${run.stderr || run.stdout || run.status}`,
          };
        }
        logs.push((run.stdout || "").trim() || `${key} ok`);
      }
      loadContent();
      return {
        ok: true,
        logs,
        snapshot: buildGmBalanceSnapshot(),
      };
    }

    default:
      return { ok: false, error: `Неизвестный action: ${action}` };
  }
}
