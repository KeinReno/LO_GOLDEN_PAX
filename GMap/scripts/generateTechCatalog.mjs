/**
 * Parse TECH_CATALOG_SPEC.md → stub TechnologyDefs, merge into technologies.json.
 * Keeps existing live techs; skips catalog rows that already have a live equivalent.
 *
 * Usage: node scripts/generateTechCatalog.mjs
 *        node scripts/generateTechCatalog.mjs --dry
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dry = process.argv.includes("--dry");

const SPEC = path.join(root, "docs/TECH_CATALOG_SPEC.md");
const OUT = path.join(root, "content/core/technologies.json");

const ICON = {
  A: "extraction",
  B: "metallurgy",
  C: "industry",
  D: "energy",
  E: "biology",
  F: "psionics",
};

const RES = {
  A: "currency.extracta",
  B: "currency.materia",
  C: "currency.industria",
  D: "currency.energia",
  E: "currency.bios",
  F: "currency.cognitio",
};

const ERA_COST = { 1: 12, 2: 24, 3: 40, 4: 120, 5: 200 };

function parseSpec(md) {
  const rows = [];
  let cat = "A";
  let era = 1;
  for (const line of md.split(/\n/)) {
    const cm = line.match(/^## \d+\.\s+Категория\s+([A-F])/);
    if (cm) {
      cat = cm[1];
      continue;
    }
    const em = line.match(/^###\s+Era\s+(\d+)/);
    if (em) {
      era = Number(em[1]);
      continue;
    }
    const tm = line.match(
      /^\|\s*\d+\s*\|\s*`(tech\.[a-z0-9_]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/,
    );
    if (!tm) continue;
    rows.push({
      id: tm[1],
      name: tm[2].trim(),
      effectHint: tm[3].trim(),
      category: cat,
      era,
    });
  }
  return rows;
}

function effectFromHint(hint, cat) {
  const res = RES[cat];
  const h = hint.toLowerCase();
  if (h.includes("unlock_tech_tier")) {
    const m =
      hint.match(/→\s*(\d+)/) ||
      hint.match(/\bto[:\s]+(\d+)/i) ||
      hint.match(/\b(\d+)\s*$/);
    const to = m ? Number(m[1]) : 2;
    return {
      effect: "unlock_tech_tier",
      args: { category: cat, to: Number.isFinite(to) ? to : 2 },
    };
  }
  if (h.includes("unlock_property")) {
    const prop = hint.match(/unlock_property\s+(\S+)/i);
    return {
      effect: "unlock_property",
      args: { property: prop?.[1] || `catalog.${cat.toLowerCase()}_scan` },
    };
  }
  if (h.includes("production_flat")) {
    return {
      effect: "production_flat",
      args: { resource: res, amount: 1 },
    };
  }
  if (h.includes("upkeep_mult")) {
    return {
      effect: "upkeep_mult",
      args: { resource: res, mult: 0.95 },
    };
  }
  if (h.includes("capacity_add")) {
    return {
      effect: "capacity_add",
      args: { category: cat, tier: 1, amount: 1 },
    };
  }
  if (h.includes("research_cost_mult") || h.includes("research")) {
    return {
      effect: "research_cost_mult",
      args: { category: cat, mult: 0.98 },
    };
  }
  if (h.includes("stat_mult")) {
    return {
      effect: "stat_mult",
      args: { stat: "ops", mult: 1.02 },
    };
  }
  if (h.includes("pop_growth") || h.includes("pop")) {
    return {
      effect: "pop_growth_mult",
      args: { mult: 1.02 },
    };
  }
  if (h.includes("ap_add") || h.includes("`ap")) {
    return { effect: "ap_add", args: { amount: 1 } };
  }
  if (h.includes("cost_mult")) {
    return {
      effect: "cost_mult",
      args: { mult: 0.98 },
    };
  }
  if (h.includes("move_cost")) {
    return {
      effect: "move_cost_mult",
      args: { mult: 0.98 },
    };
  }
  // default production_mult
  return {
    effect: "production_mult",
    args: { resource: res, mult: 1.02 },
  };
}

function stubUpgrades(id, era, cat) {
  if (era >= 5) return [];
  const base = Math.max(4, Math.round(ERA_COST[era] * 0.5));
  const res = RES[cat];
  return [
    {
      id: `${id}.efficiency`,
      name: "Эффективность",
      cost: { "currency.cognitio": base },
      effects: [
        { effect: "production_mult", args: { resource: res, mult: 1.05 } },
      ],
      prerequisites: [],
      balanceBudget: 0,
    },
    {
      id: `${id}.austerity`,
      name: "Аскеза",
      cost: { "currency.cognitio": base },
      effects: [
        { effect: "upkeep_mult", args: { resource: res, mult: 0.95 } },
      ],
      prerequisites: [],
      balanceBudget: 0,
    },
    {
      id: `${id}.feature`,
      name: "Особенность",
      cost: { "currency.cognitio": base + 2 },
      effects: [
        { effect: "capacity_add", args: { category: cat, tier: 1, amount: 1 } },
      ],
      prerequisites: [`${id}.efficiency`],
      balanceBudget: 0,
    },
  ];
}

/** Map catalog id tech.a_geology → live tech.geology when present. */
function liveEquivalentId(catalogId, liveIds) {
  const m = catalogId.match(/^tech\.([a-f])_(.+)$/i);
  if (!m) return null;
  const short = `tech.${m[2]}`;
  if (liveIds.has(short)) return short;
  if (liveIds.has(catalogId)) return catalogId;
  return null;
}

function buildStubs(rows) {
  /** @type {Map<string, typeof rows>} */
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }

  const stubs = {};
  for (const [cat, list] of byCat) {
    list.sort((a, b) => a.era - b.era || a.id.localeCompare(b.id));
    /** @type {Map<number, string>} first id per era */
    const eraHead = new Map();
    for (const r of list) {
      if (!eraHead.has(r.era)) eraHead.set(r.era, r.id);
    }
    for (const r of list) {
      const head = eraHead.get(r.era);
      let prerequisites = [];
      if (r.id === head) {
        if (r.era > 1) {
          const prevHead = eraHead.get(r.era - 1);
          if (prevHead) prerequisites = [prevHead];
        }
      } else if (head) {
        prerequisites = [head];
      }
      const breakthrough = r.era >= 5;
      stubs[r.id] = {
        id: r.id,
        name: r.name,
        category: cat,
        era: r.era,
        cost: { "currency.cognitio": ERA_COST[r.era] || 40 },
        iconTag: ICON[cat],
        flavor: "Каталог · эффект-заглушка до балансировки.",
        tags: ["general", "catalog"],
        catalogPending: true,
        isBreakthrough: breakthrough || undefined,
        prerequisites,
        effects: [effectFromHint(r.effectHint, cat)],
        upgrades: stubUpgrades(r.id, r.era, cat),
        balanceBudget: 0,
      };
      if (!breakthrough) {
        // keep upgrades
      } else {
        stubs[r.id].upgrades = [];
      }
    }
  }
  return stubs;
}

function main() {
  const md = fs.readFileSync(SPEC, "utf8");
  const rows = parseSpec(md);
  if (!rows.length) {
    console.error("No catalog rows parsed from", SPEC);
    process.exit(1);
  }

  const live = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const liveIds = new Set(Object.keys(live));
  const stubs = buildStubs(rows);

  let added = 0;
  let skippedLive = 0;
  let skippedDup = 0;

  // Name+cat+era collision with live
  const liveNameKey = new Set(
    Object.values(live).map(
      (t) => `${t.category}|${t.era}|${String(t.name).toLowerCase()}`,
    ),
  );

  const merged = { ...live };
  for (const [id, stub] of Object.entries(stubs)) {
    const eq = liveEquivalentId(id, liveIds);
    if (eq) {
      skippedLive += 1;
      continue;
    }
    if (liveIds.has(id)) {
      skippedDup += 1;
      continue;
    }
    const nk = `${stub.category}|${stub.era}|${stub.name.toLowerCase()}`;
    if (liveNameKey.has(nk)) {
      skippedLive += 1;
      continue;
    }
    // Remap prereqs that point at skipped catalog ids → live equivalents
    stub.prerequisites = (stub.prerequisites || []).map((p) => {
      const liveP = liveEquivalentId(p, liveIds);
      return liveP || p;
    });
    merged[id] = stub;
    added += 1;
  }

  // Second pass: fix prereqs that still point to missing ids (use era head live/catalog)
  const allIds = new Set(Object.keys(merged));
  for (const def of Object.values(merged)) {
    if (!def.catalogPending) continue;
    def.prerequisites = (def.prerequisites || []).filter((p) => allIds.has(p));
  }

  console.log(
    JSON.stringify(
      {
        parsed: rows.length,
        stubs: Object.keys(stubs).length,
        added,
        skippedLive,
        skippedDup,
        totalOut: Object.keys(merged).length,
        dry,
      },
      null,
      2,
    ),
  );

  if (!dry) {
    fs.writeFileSync(OUT, JSON.stringify(merged, null, 2) + "\n", "utf8");
    console.log("Wrote", OUT);
  }
}

main();
