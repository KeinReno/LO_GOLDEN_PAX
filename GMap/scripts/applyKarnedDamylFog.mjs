/**
 * Reveal Damillian-gate corridor from Голоколь for faction_karned FoW.
 *
 * Chain (damyl_planet links marked on the table):
 *   Голоколь → SYS-765 → SYS-540 → SYS-763 → SYS-192
 *   Голоколь → Стык 8 → Улей-Пепел
 *
 * Stops before Belator core (Солис / Гурез / Элегантия / Десерти).
 * Also reveals COR-776 (local corridor hub off Holokol).
 *
 * Run: node GMap/scripts/applyKarnedDamylFog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FACTION = "faction_karned";

const WORLD_FILES = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];
const FOG_PATH = path.join(ROOT, "data/fog-masks.json");

/** Named systems on the Damyl stretch from Holokol (not Belator capitals). */
const DAMYL_REVEAL_NAMES = [
  "SYS-765",
  "SYS-540",
  "SYS-763",
  "SYS-192",
  "Стык 8",
  "Улей-Пепел",
  "COR-776",
];

const BELATOR_CORE = new Set(["Солис", "Гурез", "Элегантия", "Десерти"]);

function discoverFromHolokol(world) {
  const byId = new Map(world.systems.map((s) => [s.id, s]));
  const hol = world.systems.find((s) => s.name === "Голоколь" || s.name === "SYS-562");
  if (!hol) return [];

  const adj = new Map();
  for (const l of world.links ?? []) {
    if (l.type !== "damyl_planet" && l.type !== "damyl_space") continue;
    if (!l.fromId || !l.toId) continue;
    if (!adj.has(l.fromId)) adj.set(l.fromId, []);
    if (!adj.has(l.toId)) adj.set(l.toId, []);
    adj.get(l.fromId).push(l.toId);
    adj.get(l.toId).push(l.fromId);
  }

  const out = [];
  const seen = new Set([hol.id]);
  const q = [hol.id];
  while (q.length) {
    const id = q.shift();
    for (const to of adj.get(id) || []) {
      if (seen.has(to)) continue;
      const sys = byId.get(to);
      if (!sys) continue;
      if (BELATOR_CORE.has(sys.name)) continue; // stop at Belator home worlds
      seen.add(to);
      out.push(sys);
      q.push(to);
    }
  }
  return out;
}

function patchWorld(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const world = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const byName = new Map(world.systems.map((s) => [s.name, s]));

  const discovered = discoverFromHolokol(world);
  const targets = new Map();
  for (const s of discovered) targets.set(s.id, s);
  for (const name of DAMYL_REVEAL_NAMES) {
    const s = byName.get(name);
    if (s) targets.set(s.id, s);
  }

  // Always keep Holokol visible (owned) + annotate gate nodes
  for (const s of targets.values()) {
    const vis = new Set(s.visibleToFactionIds ?? []);
    vis.add(FACTION);
    s.visibleToFactionIds = [...vis];

    const tag = "Дамильские врата (коридор от Голоколя) — разведано Карнед.";
    if (!(s.gmNotes || "").includes("Дамильские врата (коридор от Голоколя)")) {
      s.gmNotes = [s.gmNotes, tag].filter(Boolean).join("\n");
    }
    // Player-facing activity hint (notes stripped in /view — use activity/stations)
    if (!s.activity || s.activity === "none") s.activity = "trade";
    const hasGateStation = (s.stations || []).some((t) =>
      /дамил|врат/i.test(t.name || ""),
    );
    if (!hasGateStation) {
      s.stations = [
        ...(s.stations || []),
        {
          id: cryptoRandom(),
          name: "Дамильские врата",
          kind: "relay",
          factionId: null,
        },
      ];
    }
  }

  if (world.meta) {
    world.meta.updatedAt = new Date().toISOString();
    world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
  }

  fs.writeFileSync(filePath, JSON.stringify(world, null, 2) + "\n", "utf8");
  return [...targets.values()].map((s) => s.name).sort((a, b) => a.localeCompare(b, "ru"));
}

function cryptoRandom() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function patchFog(systemIds) {
  const fog = fs.existsSync(FOG_PATH)
    ? JSON.parse(fs.readFileSync(FOG_PATH, "utf8"))
    : { masks: {}, permanentReveal: {} };
  fog.masks = fog.masks || {};
  fog.permanentReveal = fog.permanentReveal || {};
  // Clear any paint-mask bits for these systems
  if (Array.isArray(fog.masks[FACTION])) {
    const hide = new Set(systemIds);
    fog.masks[FACTION] = fog.masks[FACTION].filter((id) => !hide.has(id));
  } else {
    fog.masks[FACTION] = [];
  }
  for (const id of systemIds) {
    const list = new Set(fog.permanentReveal[id] ?? []);
    list.add(FACTION);
    fog.permanentReveal[id] = [...list];
  }
  fs.writeFileSync(FOG_PATH, JSON.stringify(fog, null, 2) + "\n", "utf8");
}

function main() {
  let names = [];
  let ids = [];
  for (const file of WORLD_FILES) {
    names = patchWorld(file);
    console.log(path.basename(file), "revealed:", names.join(", "));
  }
  // ids from published
  const pub = JSON.parse(fs.readFileSync(WORLD_FILES[0], "utf8"));
  const nameSet = new Set(names);
  ids = pub.systems.filter((s) => nameSet.has(s.name)).map((s) => s.id);
  // include Holokol id for permanent reveal completeness
  const hol = pub.systems.find((s) => s.name === "Голоколь");
  if (hol) ids.push(hol.id);
  patchFog([...new Set(ids)]);
  console.log("fog-masks permanentReveal updated for", ids.length, "systems");
}

main();
