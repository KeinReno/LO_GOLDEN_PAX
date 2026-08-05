/**
 * GM Atelier — read/write content JSON catalogs on disk.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT, loadContent } from "./contentLoader.mjs";

/** @typedef {"flat" | "nested" | "document"} CatalogMode */

/**
 * @type {Record<string, { file: string, mode: CatalogMode, bags?: string[], label: string }>}
 */
export const ATELIER_CATALOGS = {
  technologies: {
    file: "core/technologies.json",
    mode: "flat",
    label: "Технологии",
  },
  tech_recipes: {
    file: "core/tech_recipes.json",
    mode: "flat",
    label: "Рецепты алхимии",
  },
  tech_combos: {
    file: "core/tech_combos.json",
    mode: "flat",
    label: "Combo-tech",
  },
  economy_balance: {
    file: "core/economy_balance.json",
    mode: "document",
    label: "Баланс экономики",
  },
  council_seats: {
    file: "core/council_seats.json",
    mode: "nested",
    bags: ["seats", "portfolios"],
    label: "Места совета",
  },
  court_tasks: {
    file: "core/court_tasks.json",
    mode: "nested",
    bags: ["tasks"],
    label: "Поручения двора",
  },
  npc_traits: {
    file: "core/npc_traits.json",
    mode: "nested",
    bags: ["traits"],
    label: "Трейты NPC",
  },
  yearly_quests: {
    file: "core/yearly_quests.json",
    mode: "flat",
    label: "Ежходные квесты",
  },
  story_quests: {
    file: "core/story_quests.json",
    mode: "nested",
    bags: ["quests"],
    label: "Сюжетные квесты",
  },
  buildings: {
    file: "core/buildings.json",
    mode: "flat",
    label: "Здания",
  },
  rules: {
    file: "core/rules.json",
    mode: "document",
    label: "Правила",
  },
};

function catalogDef(catalogId) {
  const def = ATELIER_CATALOGS[catalogId];
  if (!def) return null;
  return { id: catalogId, ...def };
}

function filePath(def) {
  return path.join(CONTENT_ROOT, def.file);
}

function readCatalogFile(def) {
  const fp = filePath(def);
  if (!fs.existsSync(fp)) {
    throw new Error(`Файл не найден: ${def.file}`);
  }
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function writeCatalogFile(def, data) {
  const fp = filePath(def);
  if (fs.existsSync(fp)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.copyFileSync(fp, `${fp}.${stamp}.bak`);
  }
  fs.writeFileSync(fp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function entryLabel(data, key) {
  if (!data || typeof data !== "object") return key;
  const o = /** @type {Record<string, unknown>} */ (data);
  return String(o.name ?? o.label ?? o.id ?? key);
}

function entryPreview(data) {
  if (!data || typeof data !== "object") return "";
  const o = /** @type {Record<string, unknown>} */ (data);
  const bits = [];
  if (o.era != null) bits.push(`era ${o.era}`);
  if (o.tier != null) bits.push(`tier ${o.tier}`);
  if (o.category != null) bits.push(String(o.category));
  if (o.etaTurns != null) bits.push(`${o.etaTurns} х`);
  if (o.scope != null) bits.push(String(o.scope));
  if (o.kind != null) bits.push(String(o.kind));
  return bits.join(" · ");
}

function resolveBag(def, bag) {
  if (def.mode === "nested") {
    const bags = def.bags || [];
    if (!bag) return bags[0] || null;
    if (!bags.includes(bag)) return null;
    return bag;
  }
  return null;
}

function listFlatEntries(root) {
  return Object.keys(root || {})
    .filter((k) => k !== "meta")
    .sort((a, b) => a.localeCompare(b));
}

function listNestedEntries(root, bag) {
  const bagObj = root?.[bag];
  if (!bagObj || typeof bagObj !== "object") return [];
  return Object.keys(bagObj).sort((a, b) => a.localeCompare(b));
}

function getEntry(root, def, key, bag) {
  if (def.mode === "flat") return root?.[key] ?? null;
  if (def.mode === "nested") {
    const b = resolveBag(def, bag);
    if (!b) return null;
    return root?.[b]?.[key] ?? null;
  }
  return null;
}

function setEntry(root, def, key, bag, data) {
  if (def.mode === "flat") {
    root[key] = data;
    return;
  }
  if (def.mode === "nested") {
    const b = resolveBag(def, bag);
    if (!b) throw new Error("Неверный bag");
    root[b] = root[b] || {};
    root[b][key] = data;
  }
}

function deleteEntry(root, def, key, bag) {
  if (key === "meta") throw new Error("Нельзя удалить meta");
  if (def.mode === "flat") {
    delete root[key];
    return;
  }
  if (def.mode === "nested") {
    const b = resolveBag(def, bag);
    if (!b) throw new Error("Неверный bag");
    delete root[b]?.[key];
  }
}

export function listAtelierCatalogs() {
  return Object.entries(ATELIER_CATALOGS).map(([id, def]) => ({
    id,
    label: def.label,
    file: def.file,
    mode: def.mode,
    bags: def.bags ?? [],
  }));
}

export function getCatalogMeta(catalogId) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  const root = readCatalogFile(def);
  let count = 0;
  if (def.mode === "document") count = 1;
  else if (def.mode === "flat") count = listFlatEntries(root).length;
  else if (def.mode === "nested") {
    for (const bag of def.bags || []) {
      count += listNestedEntries(root, bag).length;
    }
  }
  return {
    ok: true,
    id: def.id,
    label: def.label,
    file: def.file,
    mode: def.mode,
    bags: def.bags ?? [],
    count,
  };
}

export function listCatalogEntries(catalogId, opts = {}) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode === "document") {
    return { ok: false, error: "Каталог — документ, используйте /document" };
  }

  const root = readCatalogFile(def);
  const q = String(opts.q || "")
    .trim()
    .toLowerCase();
  const limit = Math.min(Math.max(Number(opts.limit) || 80, 1), 500);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const bag = resolveBag(def, opts.bag);

  /** @type {{ key: string, bag: string | null, label: string, preview: string }[]} */
  let rows = [];

  if (def.mode === "flat") {
    rows = listFlatEntries(root).map((key) => {
      const data = root[key];
      return {
        key,
        bag: null,
        label: entryLabel(data, key),
        preview: entryPreview(data),
      };
    });
  } else {
    const bags = bag ? [bag] : def.bags || [];
    for (const b of bags) {
      for (const key of listNestedEntries(root, b)) {
        const data = root[b][key];
        rows.push({
          key,
          bag: b,
          label: entryLabel(data, key),
          preview: entryPreview(data),
        });
      }
    }
  }

  if (q) {
    rows = rows.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        r.preview.toLowerCase().includes(q),
    );
  }

  const total = rows.length;
  rows = rows.slice(offset, offset + limit);
  return { ok: true, entries: rows, total, bag: bag ?? def.bags?.[0] ?? null };
}

export function readCatalogEntry(catalogId, key, bag) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode === "document") {
    return { ok: false, error: "Используйте readCatalogDocument" };
  }
  if (!key) return { ok: false, error: "Нужен key" };

  const root = readCatalogFile(def);
  const data = getEntry(root, def, key, bag);
  if (data == null) return { ok: false, error: `Запись не найдена: ${key}` };
  return {
    ok: true,
    key,
    bag: resolveBag(def, bag),
    data,
  };
}

export function saveCatalogEntry(catalogId, key, bag, data, create = false) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode === "document") {
    return { ok: false, error: "Используйте saveCatalogDocument" };
  }
  if (!key || typeof key !== "string") {
    return { ok: false, error: "Нужен key" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "data — объект JSON" };
  }

  const root = readCatalogFile(def);
  const existing = getEntry(root, def, key, bag);
  if (existing != null && create) {
    return { ok: false, error: `Запись уже есть: ${key}` };
  }
  if (existing == null && !create) {
    return { ok: false, error: `Запись не найдена: ${key}` };
  }

  const payload = { ...data };
  if (payload.id == null) payload.id = key;
  if (String(payload.id) !== key) {
    return { ok: false, error: `id (${payload.id}) должен совпадать с key (${key})` };
  }

  setEntry(root, def, key, bag, payload);
  writeCatalogFile(def, root);
  loadContent();
  return { ok: true, key, bag: resolveBag(def, bag), data: payload };
}

export function removeCatalogEntry(catalogId, key, bag) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode === "document") {
    return { ok: false, error: "Документ нельзя удалить по key" };
  }
  if (!key) return { ok: false, error: "Нужен key" };

  const root = readCatalogFile(def);
  const existing = getEntry(root, def, key, bag);
  if (existing == null) return { ok: false, error: `Запись не найдена: ${key}` };

  try {
    deleteEntry(root, def, key, bag);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  writeCatalogFile(def, root);
  loadContent();
  return { ok: true, key, bag: resolveBag(def, bag) };
}

export function readCatalogDocument(catalogId) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode !== "document") {
    return { ok: false, error: "Каталог — не документ" };
  }
  const data = readCatalogFile(def);
  return { ok: true, data };
}

export function saveCatalogDocument(catalogId, data) {
  const def = catalogDef(catalogId);
  if (!def) return { ok: false, error: "Неизвестный каталог" };
  if (def.mode !== "document") {
    return { ok: false, error: "Каталог — не документ" };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "data — объект JSON" };
  }
  writeCatalogFile(def, data);
  loadContent();
  return { ok: true };
}

export function patchRulesKnobs(patch) {
  const def = catalogDef("rules");
  if (!def) return { ok: false, error: "rules недоступен" };
  const root = readCatalogFile(def);

  if (patch.alchemy && typeof patch.alchemy === "object") {
    root.alchemy = { ...(root.alchemy || {}), ...patch.alchemy };
  }
  if (patch.intel && typeof patch.intel === "object") {
    root.intel = { ...(root.intel || {}), ...patch.intel };
  }
  if (patch.apPerTurn != null) root.apPerTurn = Number(patch.apPerTurn);
  if (patch.forceAp && typeof patch.forceAp === "object") {
    root.forceAp = { ...(root.forceAp || {}), ...patch.forceAp };
  }
  if (patch.cardBattle && typeof patch.cardBattle === "object") {
    root.cardBattle = { ...(root.cardBattle || {}), ...patch.cardBattle };
  }

  writeCatalogFile(def, root);
  loadContent();
  return { ok: true, data: root };
}
