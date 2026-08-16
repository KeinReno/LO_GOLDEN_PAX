/**
 * Parse TECH_CATALOG_SPEC.md → stub TechnologyDefs, merge into technologies.json.
 * Keeps existing live techs; skips catalog rows that already have a live equivalent.
 *
 * Usage: node scripts/generateTechCatalog.mjs
 *        node scripts/generateTechCatalog.mjs --dry
 *        node scripts/generateTechCatalog.mjs --cluster --fill=A
 *
 * Cluster rule (catalogPending):
 *   era 1–2 untagged (sandbox). era 3+ category B → researchPath structural;
 *   era 3+ D → energy. Catalog era N must not prereq a live tech of era > N
 *   (remap to same-era live opener). Empty era-1 seeds prereq the live era-1 opener.
 * Fill: drop catalogPending on one A–F slice and replace stub magnitudes/flavor
 *   with live-scale dictionary effects. Do not dump all 387 stubs into offers.
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

const ERA_COST = { 1: 12, 2: 24, 3: 42, 4: 84, 5: 200 };

/** Era 3+ catalog techs join the pilot paths. Era 1–2 stay untagged. */
const PATH_BY_CATEGORY = { B: "structural", D: "energy" };
const TIER_BY_ERA = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 9 };
const PROD_MULT_BY_ERA = { 1: 1.04, 2: 1.04, 3: 1.05, 4: 1.06, 5: 1.08 };
const FLAT_BY_ERA = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
const UPGRADE_PROD_MULT = 1.04;
const UPGRADE_UPKEEP_MULT = 0.96;

const clusterFlag = process.argv.includes("--cluster");
const fillArg = process.argv.find((a) => a.startsWith("--fill="));
const fillCats = fillArg
  ? fillArg
      .slice("--fill=".length)
      .toUpperCase()
      .split(/[,+]/)
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

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

/** Existing economy_schema properties only — never catalog.* stubs. */
function propertyForHint(hint, cat) {
  const h = String(hint || "").toLowerCase();
  if (cat === "C") {
    if (h.includes("shield") || h.includes("fortress")) return "shield";
    if (h.includes("corridor") || h.includes("gate")) return "corridor_open";
    if (h.includes("frame") || h.includes("hull") || h.includes("strong")) return "strong";
    return "malleable";
  }
  if (cat === "E") {
    if (h.includes("filter") || h.includes("hazard") || h.includes("plague") || h.includes("toxic")) return "toxic";
    return "self_spreading";
  }
  if (cat === "F") {
    if (h.includes("psion_emit") || h.includes("emit") || h.includes("lattice") || h.includes("broadcast")) return "psion_emit";
    if (h.includes("psion_store") || h.includes("psion") || h.includes("ascension")) return "psion_store";
    if (h.includes("optics") || h.includes("sensor") || h.includes("observatory") || h.includes("scan")) return "optics";
    if (h.includes("anomaly") || h.includes("quarantine") || h.includes("harness") || h.includes("exotic")) return "anomaly";
    if (h.includes("matter_destroy")) return "matter_destroy";
    return "info_store";
  }
  if (h.includes("optics") || h.includes("scan") || h.includes("sensor") || h.includes("survey")) {
    return "optics";
  }
  if (h.includes("map") || h.includes("oracle") || h.includes("claim") || h.includes("info")) {
    return "info_store";
  }
  if (h.includes("anomaly") || h.includes("exotic")) return "anomaly";
  if (cat === "B") return "malleable";
  if (cat === "D") return "energy";
  if (cat === "E") return "self_spreading";
  if (cat === "A") return "optics";
  return "info_store";
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
    return {
      effect: "unlock_property",
      args: { property: propertyForHint(hint, cat) },
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
    if (cat === "B") {
      return { effect: "stat_mult", args: { stat: "armor", mult: 1.04 } };
    }
    if (cat === "D") {
      return { effect: "stat_mult", args: { stat: "damage", mult: 1.04 } };
    }
    return {
      effect: "production_mult",
      args: { resource: res, mult: 1.04 },
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
      args: { tag: "build", mult: 0.98 },
    };
  }
  if (h.includes("move_cost")) {
    return {
      effect: "move_cost_mult",
      args: { mult: 0.98 },
    };
  }
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
        { effect: "production_mult", args: { resource: res, mult: UPGRADE_PROD_MULT } },
      ],
      prerequisites: [],
      balanceBudget: 0,
    },
    {
      id: `${id}.austerity`,
      name: "Аскеза",
      cost: { "currency.cognitio": base },
      effects: [
        { effect: "upkeep_mult", args: { resource: res, mult: UPGRADE_UPKEEP_MULT } },
      ],
      prerequisites: [],
      balanceBudget: 0,
    },
    {
      id: `${id}.feature`,
      name: "Особенность",
      cost: { "currency.cognitio": base + 2 },
      effects: [
        { effect: "capacity_add", args: { category: cat, tier: TIER_BY_ERA[era] || 1, amount: 1 } },
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
      const pathId = r.era >= 3 ? PATH_BY_CATEGORY[cat] : null;
      stubs[r.id] = {
        id: r.id,
        name: r.name,
        category: cat,
        era: r.era,
        cost: { "currency.cognitio": ERA_COST[r.era] || 42 },
        iconTag: ICON[cat],
        flavor: "Каталог · эффект-заглушка до балансировки.",
        tags: pathId
          ? ["general", "catalog", `path:${pathId}`, "path_cluster"]
          : ["general", "catalog"],
        catalogPending: true,
        isBreakthrough: breakthrough || undefined,
        prerequisites,
        effects: [effectFromHint(r.effectHint, cat)],
        upgrades: stubUpgrades(r.id, r.era, cat),
        balanceBudget: 0,
      };
      if (pathId) stubs[r.id].researchPath = pathId;
      if (!breakthrough) {
        // keep upgrades
      } else {
        stubs[r.id].upgrades = [];
      }
    }
  }
  return stubs;
}

function isPathOrHybrid(def) {
  const id = String(def?.id || "");
  if (id.startsWith("tech.path.")) return true;
  if (Array.isArray(def?.hybridOf) && def.hybridOf.length) return true;
  return false;
}

/** Live era openers (unlock_tech_tier preferred; skip path/hybrid). */
function liveSpine(techs) {
  const spine = {};
  for (const t of Object.values(techs)) {
    if (!t?.id || t.catalogPending || isPathOrHybrid(t)) continue;
    const hasTier = (t.effects || []).some((e) => e.effect === "unlock_tech_tier");
    const k = `${t.category}:${t.era}`;
    const cur = spine[k];
    if (!cur || (hasTier && !cur.hasTier)) {
      spine[k] = { id: t.id, hasTier };
    }
  }
  return spine;
}

function addTag(def, tag) {
  const tags = Array.isArray(def.tags) ? def.tags.slice() : [];
  if (!tags.includes(tag)) tags.push(tag);
  def.tags = tags;
}

/**
 * Cluster catalogPending so a later fill can enter offers:
 * path-gate era 3+ B/D; repair inverted live prereqs; seed era-1 after live opener.
 */
function applyCluster(techs) {
  const spine = liveSpine(techs);
  let pathTagged = 0;
  let prereqFixed = 0;
  let seeds = 0;
  for (const t of Object.values(techs)) {
    if (!t?.catalogPending) continue;
    const era = Number(t.era) || 1;
    const cat = t.category;
    const pathId = era >= 3 ? PATH_BY_CATEGORY[cat] : null;
    if (pathId) {
      t.researchPath = pathId;
      addTag(t, "general");
      addTag(t, "catalog");
      addTag(t, `path:${pathId}`);
      addTag(t, "path_cluster");
      pathTagged += 1;
    }
    const pres = Array.isArray(t.prerequisites) ? t.prerequisites.slice() : [];
    if (pres.length === 0 && era === 1) {
      const opener = spine[`${cat}:1`];
      if (opener?.id && opener.id !== t.id) {
        t.prerequisites = [opener.id];
        seeds += 1;
      }
      continue;
    }
    let changed = false;
    t.prerequisites = pres.map((p) => {
      const pre = techs[p];
      if (pre && !pre.catalogPending && Number(pre.era) > era) {
        const same = spine[`${cat}:${era}`];
        const prev = spine[`${cat}:${era - 1}`];
        const next = same?.id || prev?.id || p;
        if (next !== p) changed = true;
        return next;
      }
      return p;
    });
    if (changed) prereqFixed += 1;
  }
  return { pathTagged, prereqFixed, seeds };
}

function propertyForCatalogId(id, cat) {
  const s = String(id).toLowerCase();
  if (cat === "C") {
    if (/shield|fortress/i.test(s)) return "shield";
    if (/frame|hull|scaffold|structure/i.test(s)) return "strong";
    if (/gate|corridor/i.test(s)) return "corridor_open";
    return "malleable";
  }
  if (cat === "E") {
    if (/filter|hazard|plague|null|toxic/i.test(s)) return "toxic";
    if (/spore|terraform|species|design|growth|spread/i.test(s)) return "self_spreading";
    return "self_spreading";
  }
  if (cat === "F") {
    if (/psi_lattice|chorus|broadcast|emit/i.test(s)) return "psion_emit";
    if (/psi|ascension|store|hold/i.test(s)) return "psion_store";
    if (/anomaly|relic|quarantine|harness/i.test(s)) return "anomaly";
    if (/archive|catalog|info|data|memory/i.test(s)) return "info_store";
    if (/sensor|observatory|mesh|optics/i.test(s)) return "optics";
    if (/matter_destr/i.test(s)) return "matter_destroy";
    return "info_store";
  }
  if (cat === "A") {
    if (/oracle|mapping|claim|isotope|microquake/i.test(s)) return "info_store";
    return "optics";
  }
  if (cat === "B") return "malleable";
  if (cat === "D") return "energy";
  return "info_store";
}

function scaleEffect(e, def) {
  const era = Number(def.era) || 1;
  const cat = def.category;
  const res = RES[cat];
  if (!e?.effect) return e;
  if (e.effect === "production_mult") {
    return {
      effect: "production_mult",
      args: { resource: e.args?.resource || res, mult: PROD_MULT_BY_ERA[era] },
    };
  }
  if (e.effect === "production_flat") {
    return {
      effect: "production_flat",
      args: { resource: e.args?.resource || res, amount: FLAT_BY_ERA[era] },
    };
  }
  if (e.effect === "upkeep_mult") {
    return {
      effect: "upkeep_mult",
      args: { resource: e.args?.resource || res, mult: UPGRADE_UPKEEP_MULT },
    };
  }
  if (e.effect === "capacity_add") {
    return {
      effect: "capacity_add",
      args: {
        category: e.args?.category || cat,
        tier: TIER_BY_ERA[era] || 1,
        amount: Number(e.args?.amount) || 1,
      },
    };
  }
  if (e.effect === "unlock_property") {
    const prop = String(e.args?.property || "");
    const ok =
      prop && !prop.startsWith("catalog.") ? prop : propertyForCatalogId(def.id, cat);
    return { effect: "unlock_property", args: { property: ok } };
  }
  if (e.effect === "stat_mult") {
    const stat = String(e.args?.stat || "");
    if (stat === "ops" || !stat || stat.endsWith("_ops")) {
      return {
        effect: "production_mult",
        args: { resource: res, mult: PROD_MULT_BY_ERA[era] },
      };
    }
    return {
      effect: "stat_mult",
      args: { stat, mult: Math.max(Number(e.args?.mult) || 1, 1.04) },
    };
  }
  if (e.effect === "pop_growth_mult") {
    const mult = era >= 5 ? 1.05 : era >= 3 ? 1.03 : 1.02;
    return {
      effect: "pop_growth_mult",
      args: { mult },
    };
  }
  if (e.effect === "research_cost_mult") {
    return {
      effect: "research_cost_mult",
      args: { category: e.args?.category || cat, mult: 0.96 },
    };
  }
  if (e.effect === "cost_mult") {
    return {
      effect: "cost_mult",
      args: { tag: "build", mult: 0.96 },
    };
  }
  if (e.effect === "building_level_mult") {
    return {
      effect: "building_level_mult",
      args: { mult: 1.05 },
    };
  }
  if (e.effect === "logistics_disconnected_penalty") {
    return {
      effect: "logistics_disconnected_penalty",
      args: { mult: 0.9 },
    };
  }
  if (e.effect === "ap_add") {
    return {
      effect: "ap_add",
      args: { amount: 1 },
    };
  }
  return e;
}

function flavorForFilled(def) {
  const id = String(def.id).toLowerCase();
  const n = def.name;
  const cat = def.category;
  let spin = "усиливает развитие направления";
  if (cat === "A") {
    if (/scan|sensor|survey|map|oracle|isotope|microquake|claim/i.test(id)) {
      spin = "даёт свойство разведки по словарю economy_schema";
    } else if (/network|train|logistics|mass_driver|vault|captur|compress/i.test(id)) {
      spin = "добавляет ёмкость слотов категории A";
    } else if (/refine|enrich|catalyst|separat|sinter|loop|closed/i.test(id)) {
      spin = "поднимает выход руды без новых валют";
    } else if (/waste|tailing|slag|recycl|zero_waste|strip/i.test(id)) {
      spin = "режет потери шлама (upkeep Extracta)";
    } else if (/doctrine|printer|genesis|cracking|starlift/i.test(id)) {
      spin = "прорывной контур экстракции";
    } else {
      spin = "усиливает съём жил Extracta";
    }
  } else if (cat === "B") {
    if (/armor|plate|shield|hull|reactive|defensive|laminate|ablative/i.test(id)) {
      spin = "усиливает прочность обшивок и бронирование кораблей";
    } else if (/crystal|graphene|superconduct|composite|metamaterial|polymer|alloy|steel|billet/i.test(id)) {
      spin = "поднимает выпуск конструкционных сплавов Materia";
    } else if (/flexible|cable|harness|vault|storage|matrix/i.test(id)) {
      spin = "добавляет ёмкость и гибкость материальных слотов B";
    } else if (/recycle|scrap|waste|slag|heat_pipe|radiation|corrosion/i.test(id)) {
      spin = "снижает издержки переработки и износ конструкций (upkeep Materia)";
    } else if (/doctrine|programmable|genesis|molecular|zero_defect/i.test(id)) {
      spin = "прорывной контур метаматериалов и наноструктур";
    } else {
      spin = "усиливает металлургические и материальные контуры Materia";
    }
  } else if (cat === "D") {
    if (/reactor|tokamak|fusion|fission|antimatter|singularity|core/i.test(id)) {
      spin = "поднимает генерацию и плотность энергии Energia";
    } else if (/engine|thruster|drive|spike|plasma_thruster|tanker/i.test(id)) {
      spin = "повышает тягу двигателей и энергоотдачу флота";
    } else if (/capacitor|battery|grid|microgrid|storage|bank|island/i.test(id)) {
      spin = "добавляет ёмкость накопителей и энергосетей категории D";
    } else if (/safeguard|radiator|heat_sink|waste_heat|telematics|blackout|failsafe/i.test(id)) {
      spin = "снижает тепловые потери и издержки сетей (upkeep Energia)";
    } else if (/doctrine|zero_point|star_siphon|hypergrid|emergency/i.test(id)) {
      spin = "прорывной контур генерации чистой энергии и сингулярностей";
    } else {
      spin = "усиливает энергетические потоки и стабильность энергосети";
    }
  } else if (cat === "C") {
    if (/yard|ship|keel|hull|drydock|batch/i.test(id)) {
      spin = "ускоряет верфи и постройку флота (Industria)";
    } else if (/megastructure|habitat|arcology|scaffold|foundation/i.test(id)) {
      spin = "увеличивает темп и масштаб строительства мегаструктур";
    } else if (/network|crane|grid|cache|bay|queue|parts/i.test(id)) {
      spin = "добавляет ёмкость и гибкость слотов категории C";
    } else if (/printer|forge|foundry|assembly|automation|quantum|nano|forges/i.test(id)) {
      spin = "поднимает выпуск Industria и темп роботизации";
    } else if (/idle|waste|refit|repair|tool|hotswap|symbiosis/i.test(id)) {
      spin = "снижает издержки и простой сборочных линий (upkeep Industria)";
    } else if (/doctrine|world_forge|factory_seed|instant_scaffold|authority/i.test(id)) {
      spin = "прорывной контур тяжёлой индустрии и верфей";
    } else {
      spin = "усиливает фабричные контуры и выпуск Industria";
    }
  } else if (cat === "E") {
    if (/pop|growth|creche|womb|clone|surge|immortal|longevity|draft|ward/i.test(id)) {
      spin = "стимулирует рост населения и демографический потенциал";
    } else if (/farm|crop|hydroponic|ocean|flora|food|synthesis|agriculture/i.test(id)) {
      spin = "поднимает сбор и синтез биоресурсов Bios";
    } else if (/gene|bank|vault|storage|diversity/i.test(id)) {
      spin = "добавляет ёмкость био-хранилищ категории E";
    } else if (/filter|hazard|quarantine|hygiene|null|rehab|health|diet|recycl/i.test(id)) {
      spin = "оптимизирует биосодержание и экозащиту колоний (upkeep Bios)";
    } else if (/doctrine|tree|canopy|design|genesis|ascension|mastery/i.test(id)) {
      spin = "прорывной контур высшей биоинженерии и евгеники";
    } else {
      spin = "усиливает биосферные комплексы и поток Bios";
    }
  } else if (cat === "F") {
    if (/psi|chorus|lattice|mind|consciousness|amplification|practices|theory/i.test(id)) {
      spin = "раскрывает псионический потенциал и ментальные контуры";
    } else if (/anomaly|relic|expedition|quarantine|harness|containment/i.test(id)) {
      spin = "позволяет изучать и удерживать аномальные реликты";
    } else if (/archive|compress|caching|storage|mesh|observatory/i.test(id)) {
      spin = "добавляет ёмкость архивов и сенсорных сетей категории F";
    } else if (/peer|model|scheduler|simulator|sync|oracle|pact|hypothesis|deep_learning/i.test(id)) {
      spin = "ускоряет исследовательские циклы и обмен знаниями";
    } else if (/intel|counterintel|truth|cryptanalysis|college|analysis/i.test(id)) {
      spin = "усиливает аналитический аппарат и сбор разведданных";
    } else if (/doctrine|self_improving|surge|destruction/i.test(id)) {
      spin = "прорывной контур высшего знания Cognitio";
    } else {
      spin = "поднимает генерацию и точность исследований Cognitio";
    }
  }
  const text = `${n}: ${spin}.`;
  return text.length > 200 ? text.slice(0, 197) + "…" : text;
}

function fillCategory(techs, cat) {
  const spine = liveSpine(techs);
  const openerE1 = spine[`${cat}:1`]?.id;
  let filled = 0;
  for (const t of Object.values(techs)) {
    if (!t?.catalogPending || t.category !== cat) continue;
    delete t.catalogPending;
    t.tags = (t.tags || ["general"]).filter((tag) => tag !== "catalog");
    if (!t.tags.includes("general")) t.tags.unshift("general");
    t.cost = { "currency.cognitio": ERA_COST[t.era] || t.cost?.["currency.cognitio"] || 42 };
    t.flavor = flavorForFilled(t);
    t.effects = (t.effects || []).map((e) => scaleEffect(e, t));
    if (t.era === 1 && openerE1 && openerE1 !== t.id) {
      t.prerequisites = [openerE1];
    }
    if (t.era >= 5) {
      t.isBreakthrough = true;
      t.upgrades = [];
      addTag(t, "breakthrough");
    } else {
      t.upgrades = (t.upgrades || []).map((u) => {
        const kind = String(u.id || "").split(".").pop();
        const name =
          kind === "efficiency"
            ? `Выход · ${t.name}`
            : kind === "austerity"
              ? `Рецикл · ${t.name}`
              : `Ёмкость · ${t.name}`;
        return {
          ...u,
          name,
          effects: (u.effects || []).map((e) => {
            if (e.effect === "production_mult") {
              return {
                effect: "production_mult",
                args: {
                  resource: e.args?.resource || RES[cat],
                  mult: UPGRADE_PROD_MULT,
                },
              };
            }
            if (e.effect === "upkeep_mult") {
              return {
                effect: "upkeep_mult",
                args: {
                  resource: e.args?.resource || RES[cat],
                  mult: UPGRADE_UPKEEP_MULT,
                },
              };
            }
            if (e.effect === "capacity_add") {
              return {
                effect: "capacity_add",
                args: {
                  category: e.args?.category || cat,
                  tier: TIER_BY_ERA[t.era] || 1,
                  amount: 1,
                },
              };
            }
            return e;
          }),
        };
      });
    }
    filled += 1;
  }
  return filled;
}

function main() {
  const live = JSON.parse(fs.readFileSync(OUT, "utf8"));

  if (clusterFlag || fillCats.length) {
    const cluster = clusterFlag ? applyCluster(live) : null;
    let filled = 0;
    for (const cat of fillCats) {
      filled += fillCategory(live, cat);
    }
    const pending = Object.values(live).filter((t) => t.catalogPending).length;
    const report = {
      cluster,
      fill: fillCats.length ? fillCats.join(",") : null,
      filled,
      pendingLeft: pending,
      total: Object.keys(live).length,
      dry,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!dry) {
      fs.writeFileSync(OUT, JSON.stringify(live, null, 2) + "\n", "utf8");
      console.log("Wrote", OUT);
    }
    return;
  }

  const md = fs.readFileSync(SPEC, "utf8");
  const rows = parseSpec(md);
  if (!rows.length) {
    console.error("No catalog rows parsed from", SPEC);
    process.exit(1);
  }

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
