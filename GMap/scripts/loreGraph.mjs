/**
 * Realistic hyperlane graph + wild-space seeding for LO GOLDEN PAX.
 * - Per-faction MST (not a full mesh)
 * - Few backup chords + frontier bridges
 * - Neutrals / pirates / anomalies / hubs / extra corridors in voids
 */
import { randomUUID } from "node:crypto";

function keyOf(a, b) {
  return [a, b].sort().join("|");
}

/** Kruskal MST within a group; edges longer than maxDist ignored. */
export function mstLinks(nodes, maxDist) {
  if (nodes.length < 2) return [];
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d <= maxDist) edges.push({ a: nodes[i], b: nodes[j], d });
    }
  }
  edges.sort((e1, e2) => e1.d - e2.d);
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (id) => {
    let p = parent.get(id);
    while (p !== parent.get(p)) p = parent.get(p);
    parent.set(id, p);
    return p;
  };
  const unite = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa === pb) return false;
    parent.set(pa, pb);
    return true;
  };
  const out = [];
  for (const e of edges) {
    if (unite(e.a.id, e.b.id)) {
      out.push({
        id: randomUUID(),
        fromId: e.a.id,
        toId: e.b.id,
        type: "corridor",
        _d: e.d,
      });
    }
  }
  // Connect leftover components with nearest cross-edge (even if > maxDist)
  const comps = new Map();
  for (const n of nodes) {
    const r = find(n.id);
    const list = comps.get(r) ?? [];
    list.push(n);
    comps.set(r, list);
  }
  const roots = [...comps.keys()];
  if (roots.length > 1) {
    for (let i = 1; i < roots.length; i++) {
      const A = comps.get(roots[0]);
      const B = comps.get(roots[i]);
      let best = null;
      for (const a of A) {
        for (const b of B) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      if (best && unite(best.a.id, best.b.id)) {
        out.push({
          id: randomUUID(),
          fromId: best.a.id,
          toId: best.b.id,
          type: best.d > maxDist * 1.2 ? "unstable" : "corridor",
          _d: best.d,
        });
        for (const b of B) A.push(b);
      }
    }
  }
  return out;
}

/** Add up to `extra` short chords so average degree isn't always 2. */
function addChords(nodes, existing, maxDist, extraRatio = 0.18) {
  const seen = new Set(existing.map((l) => keyOf(l.fromId, l.toId)));
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d > maxDist * 0.55) continue;
      const k = keyOf(nodes[i].id, nodes[j].id);
      if (seen.has(k)) continue;
      edges.push({ a: nodes[i], b: nodes[j], d });
    }
  }
  edges.sort((a, b) => a.d - b.d);
  const budget = Math.max(0, Math.floor(nodes.length * extraRatio));
  const out = [];
  for (let i = 0; i < edges.length && out.length < budget; i++) {
    const e = edges[i];
    const k = keyOf(e.a.id, e.b.id);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: randomUUID(),
      fromId: e.a.id,
      toId: e.b.id,
      type: "corridor",
    });
  }
  return out;
}

function nearestForeignLinks(systems, maxDist, maxPerSystem = 1) {
  const out = [];
  const seen = new Set();
  const byId = new Map(systems.map((s) => [s.id, s]));
  for (const a of systems) {
    if (!a.ownerFactionId) continue;
    const candidates = [];
    for (const b of systems) {
      if (a.id === b.id) continue;
      if (b.ownerFactionId === a.ownerFactionId) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > maxDist) continue;
      candidates.push({ b, d });
    }
    candidates.sort((x, y) => x.d - y.d);
    let added = 0;
    for (const c of candidates) {
      if (added >= maxPerSystem) break;
      // Only frontier: require they are among the closest overall
      if (c.d > maxDist * 0.85 && added > 0) break;
      const k = keyOf(a.id, c.b.id);
      if (seen.has(k)) continue;
      // Probabilistic — not every border pair
      const h = Math.abs(Math.sin(a.x * 0.01 + c.b.y * 0.013));
      if (h > 0.42) continue;
      seen.add(k);
      const type =
        a.poiType === "anomaly" || c.b.poiType === "anomaly"
          ? "unstable"
          : "corridor";
      out.push({ id: randomUUID(), fromId: a.id, toId: c.b.id, type });
      added++;
    }
  }
  void byId;
  return out;
}

/** Connect wild POIs to 1–2 nearest systems. */
function attachWild(systems, wildIds, maxDist) {
  const out = [];
  const seen = new Set();
  const wild = systems.filter((s) => wildIds.has(s.id));
  for (const w of wild) {
    const others = systems
      .filter((s) => s.id !== w.id)
      .map((s) => ({ s, d: Math.hypot(s.x - w.x, s.y - w.y) }))
      .sort((a, b) => a.d - b.d);
    const n = w.poiType === "hub" ? 2 : w.poiType === "anomaly" ? 1 : 1;
    for (let i = 0; i < Math.min(n, others.length); i++) {
      const o = others[i];
      if (o.d > maxDist && i > 0) break;
      const k = keyOf(w.id, o.s.id);
      if (seen.has(k)) continue;
      seen.add(k);
      const type =
        w.poiType === "anomaly" || o.d > maxDist * 0.9 ? "unstable" : "corridor";
      out.push({ id: randomUUID(), fromId: w.id, toId: o.s.id, type });
    }
  }
  return out;
}

/**
 * Build sparse realistic link set for the whole map.
 */
export function buildRealisticLinks(systems, {
  factionMaxDist = 380,
  frontierMaxDist = 320,
  wildMaxDist = 480,
} = {}) {
  const links = [];
  const seen = new Set();
  const addAll = (arr) => {
    for (const l of arr) {
      const k = keyOf(l.fromId, l.toId);
      if (seen.has(k)) continue;
      seen.add(k);
      const { _d, ...rest } = l;
      void _d;
      links.push(rest);
    }
  };

  const factions = new Set(
    systems.map((s) => s.ownerFactionId).filter(Boolean),
  );
  for (const fid of factions) {
    const group = systems.filter((s) => s.ownerFactionId === fid);
    // Belator slightly denser (imperial highways); others sparse
    const maxD = fid === "faction_belator" ? factionMaxDist * 1.15 : factionMaxDist;
    const chord = fid === "faction_belator" ? 0.28 : 0.14;
    const mst = mstLinks(group, maxD);
    addAll(mst);
    addAll(addChords(group, mst, maxD, chord));
  }

  // Neutrals without faction — light MST among themselves if clustered
  const neutrals = systems.filter((s) => !s.ownerFactionId);
  if (neutrals.length > 1) {
    addAll(mstLinks(neutrals, factionMaxDist * 0.9));
  }

  addAll(nearestForeignLinks(systems, frontierMaxDist, 1));

  const wildIds = new Set(
    systems
      .filter(
        (s) =>
          s.poiType === "anomaly" ||
          s.poiType === "pirate" ||
          s.poiType === "hub" ||
          s.poiType === "ruin" ||
          (!s.ownerFactionId && s.kind === "stellar"),
      )
      .map((s) => s.id),
  );
  addAll(attachWild(systems, wildIds, wildMaxDist));

  return links;
}

function tooClose(x, y, pts, minD) {
  for (const p of pts) {
    if (Math.hypot(p.x - x, p.y - y) < minD) return true;
  }
  return false;
}

function jitterSeed(i, scale) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 23758.1234;
  return {
    x: (a - Math.floor(a) - 0.5) * scale,
    y: (b - Math.floor(b) - 0.5) * scale,
  };
}

/**
 * Place wild-space content in flat (pre-iso) coordinates.
 * Returns new flat system defs to push into the builder.
 */
export function seedWildSpace(existingFlat, { minDist = 140 } = {}) {
  const pts = existingFlat.map((s) => ({ x: s.x, y: s.y }));
  const out = [];

  const tryPlace = (def, dist = minDist) => {
    if (tooClose(def.x, def.y, pts, dist)) return false;
    pts.push({ x: def.x, y: def.y });
    out.push(def);
    return true;
  };

  // Hand-placed voids between power blocs (flat space, before iso)
  const scripted = [
    // Between Turanmal (W) and Belator
    {
      name: "Серый Перешеек",
      x: -780,
      y: -40,
      kind: "corridor",
      poiType: "none",
      ownerFactionId: null,
      activity: "transit",
      notes: "Нейтральный транзитный релей на западном рубеже",
    },
    {
      name: "Вольная Верфь Карга",
      x: -900,
      y: 220,
      kind: "stellar",
      poiType: "hub",
      ownerFactionId: null,
      activity: "trade",
      notes: "Вольный торговый хаб; не клянётся ни Туранмалу, ни Империи",
    },
    {
      name: "Клык Налётчиков",
      x: -1050,
      y: -280,
      kind: "stellar",
      poiType: "pirate",
      ownerFactionId: "faction_pirates",
      activity: "battle",
      notes: "Пиратское логово на западных караванных путях",
    },
    // Between Federation (N) and Belator
    {
      name: "Туманность Сирот",
      x: -200,
      y: -560,
      kind: "stellar",
      poiType: "anomaly",
      ownerFactionId: null,
      activity: "none",
      notes: "Пси-аномалия; навигация нестабильна — слепые прыжки",
    },
    {
      name: "Станция «Тихий Огонёк»",
      x: 120,
      y: -700,
      kind: "corridor",
      poiType: "none",
      ownerFactionId: null,
      activity: "transit",
      notes: "Нейтральный гуманитарный релей (не федеральный)",
    },
    {
      name: "Дрейф-Форт",
      x: 280,
      y: -1100,
      kind: "stellar",
      poiType: "pirate",
      ownerFactionId: "faction_pirates",
      activity: "battle",
      notes: "Пираты кормятся хаосом Северного Роя",
    },
    // Between Belator and Corvun / Balsagon
    {
      name: "Разлом Шепота",
      x: 780,
      y: -320,
      kind: "stellar",
      poiType: "anomaly",
      ownerFactionId: null,
      activity: "none",
      notes: "Аномалия у Складок Тишины; корвуны обходят",
    },
    {
      name: "Пепельный Хаб",
      x: 860,
      y: 80,
      kind: "stellar",
      poiType: "hub",
      ownerFactionId: null,
      activity: "trade",
      notes: "Чёрный рынок трофеев Балсагона / Т11-обломков",
    },
    {
      name: "Костяной Притон",
      x: 1280,
      y: -200,
      kind: "stellar",
      poiType: "pirate",
      ownerFactionId: "faction_pirates",
      activity: "battle",
      notes: "Пираты между Корвун'тай и оккупированным Балсагоном",
    },
    // Between Belator and Taala / SE
    {
      name: "Стеклянная Пустошь",
      x: 1200,
      y: 520,
      kind: "stellar",
      poiType: "anomaly",
      ownerFactionId: null,
      activity: "none",
      notes: "Пси-стекло; Таала помечают как «не входить без нити»",
    },
    {
      name: "Караван-Оазис",
      x: 900,
      y: 700,
      kind: "stellar",
      poiType: "hub",
      ownerFactionId: null,
      activity: "trade",
      notes: "Перевалочный хаб к южным маршрутам",
    },
    // Between HeShah / Sikuri / South Swarm
    {
      name: "Зелёный Стык",
      x: -200,
      y: 900,
      kind: "corridor",
      poiType: "none",
      ownerFactionId: null,
      activity: "transit",
      notes: "Нейтральный стык Сикури / ХэШах / Белатор-юг",
    },
    {
      name: "Улей-Призрак",
      x: 900,
      y: 1100,
      kind: "stellar",
      poiType: "ruin",
      ownerFactionId: null,
      activity: "none",
      notes: "Руины роевого мира; биомасса мертва, эхо пси осталось",
    },
    {
      name: "Падальщики Юга",
      x: 700,
      y: 1280,
      kind: "stellar",
      poiType: "pirate",
      ownerFactionId: "faction_pirates",
      activity: "battle",
      notes: "Мародёры на пепле Южного Роя",
    },
    {
      name: "Маяк-Слепец",
      x: 400,
      y: 600,
      kind: "stellar",
      poiType: "anomaly",
      ownerFactionId: null,
      activity: "none",
      notes: "Ложный маяк; возможно хвост ОР или древний артефакт",
    },
    // Deep gaps NW / far W
    {
      name: "Холодный Колодец",
      x: -600,
      y: -400,
      kind: "stellar",
      poiType: "anomaly",
      ownerFactionId: null,
      activity: "none",
      notes: "Гравитационный колодец; редкие научные экспедиции",
    },
    {
      name: "Станция Три-Флага",
      x: -400,
      y: 400,
      kind: "stellar",
      poiType: "hub",
      ownerFactionId: null,
      activity: "trade",
      notes: "Вольный порт: Турон / Белатор / Сикури — без флага",
    },
    {
      name: "Мёртвый Конвой",
      x: 200,
      y: 200,
      kind: "stellar",
      poiType: "ruin",
      ownerFactionId: null,
      activity: "none",
      notes: "Остов торгового конвоя; ловушки и мародёры",
    },
    {
      name: "Релей «Серый Луч»",
      x: 500,
      y: -200,
      kind: "corridor",
      poiType: "none",
      ownerFactionId: null,
      activity: "transit",
      notes: "Нейтральный релей между ядром и востоком",
    },
    {
      name: "Нора Шакалов",
      x: -500,
      y: 700,
      kind: "stellar",
      poiType: "pirate",
      ownerFactionId: "faction_pirates",
      activity: "battle",
      notes: "Пираты на юго-западных тропах Сикури",
    },
  ];

  for (const s of scripted) {
    const def = {
      ...s,
      raceId: s.ownerFactionId === "faction_pirates" ? "race_human" : "race_belator",
    };
    // Scripted POIs: try several jitters if the void is crowded
    let ok = tryPlace(def, 110);
    if (!ok) {
      for (let t = 1; t <= 8 && !ok; t++) {
        const j = jitterSeed(t * 17 + s.name.length, 90);
        ok = tryPlace({ ...def, x: def.x + j.x, y: def.y + j.y }, 100);
      }
    }
    if (!ok) {
      // Last resort — place anyway slightly offset so lore POIs aren't lost
      const j = jitterSeed(s.name.length, 120);
      def.x += j.x;
      def.y += j.y;
      pts.push({ x: def.x, y: def.y });
      out.push(def);
    }
  }

  // A few more random neutrals in the bounding void
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) + 80;
  const maxX = Math.max(...xs) - 80;
  const minY = Math.min(...ys) + 80;
  const maxY = Math.max(...ys) - 80;
  const neutralNames = [
    "Пыль-7",
    "Орбита Без Имени",
    "Камень-Странник",
    "Тихий Скат",
    "Пустой Регистр",
    "Сторожка-19",
    "Безымянный Газ",
    "Кольцо Пепла",
  ];
  let n = 0;
  for (let i = 0; i < 80 && n < neutralNames.length; i++) {
    const j = jitterSeed(i + 99, 1);
    const x = minX + ((i * 97) % 1000) / 1000 * (maxX - minX) + j.x * 40;
    const y = minY + ((i * 53) % 1000) / 1000 * (maxY - minY) + j.y * 40;
    if (
      tryPlace({
        name: neutralNames[n],
        x,
        y,
        kind: "stellar",
        poiType: "none",
        ownerFactionId: null,
        activity: "none",
        notes: "Независимая / забытая система",
        raceId: "race_human",
      })
    ) {
      n++;
    }
  }

  return out;
}
