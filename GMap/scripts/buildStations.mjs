/**
 * Generate content/core/stations.json from economy_balance.forces.stations.
 * Spec: docs/BALANCE_BASELINE_SPEC.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "content/core/stations.json");
const BAL = JSON.parse(
  fs.readFileSync(path.join(ROOT, "content/core/economy_balance.json"), "utf8"),
);

const META = {
  mining: {
    name: "Добывающая станция",
    ap: 1,
    roles: ["extract"],
    signature: "Системная добыча / мост к metal",
    tradeoff: "уязвима без охраны",
    effects: [{ effect: "yield_flat", args: { currency: "currency.extracta", amount: 2 } }],
  },
  military: {
    name: "Оборонная платформа",
    ap: 2,
    roles: ["defense"],
    signature: "Орбитальная оборона системы",
    tradeoff: "дорогое ОД на постройку",
    effects: [{ effect: "capacity_add", args: { category: "D", tier: 3, amount: 1 } }],
  },
  science: {
    name: "Научная станция",
    ap: 1,
    roles: ["science"],
    signature: "Cognitio / сенсоры",
    tradeoff: "слабая в бою",
    effects: [{ effect: "yield_flat", args: { currency: "currency.cognitio", amount: 1 } }],
  },
  trade: {
    name: "Торговый узел",
    ap: 1,
    roles: ["trade"],
    signature: "Рынок / логистика",
    tradeoff: "нужна безопасность",
    effects: [{ effect: "yield_flat", args: { currency: "currency.materia", amount: 1 } }],
  },
  relay: {
    name: "Релейный маяк",
    ap: 1,
    roles: ["relay"],
    signature: "Дальность связи / fog",
    tradeoff: "низкий yield",
    effects: [{ effect: "capacity_add", args: { category: "F", tier: 2, amount: 1 } }],
  },
};

const stationsBal = BAL.forces?.stations || {};
const out = {};

for (const kind of BAL.baseline?.stations || Object.keys(META)) {
  const meta = META[kind];
  if (!meta) continue;
  const row = stationsBal[kind] || {};
  const metal = Number(row.metal ?? 24);
  const supply = Number(row.supply ?? Math.max(1, Math.round(metal * 0.42)));
  out[kind] = {
    id: `station.${kind}`,
    kind,
    name: meta.name,
    ap: meta.ap,
    roles: meta.roles,
    cost: {
      "currency.metal": metal,
      "currency.supply": supply,
    },
    effects: meta.effects,
    signature: meta.signature,
    tradeoff: meta.tradeoff,
  };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("Wrote", Object.keys(out).length, "stations →", OUT);
