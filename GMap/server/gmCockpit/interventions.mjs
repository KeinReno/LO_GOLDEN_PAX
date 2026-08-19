/**
 * GM intervention append-only log.
 * Extracted from ../gmCockpit.mjs.
 */
import path from "node:path";
import { DATA_DIR, readJson, writeJson } from "../tableStore.mjs";

export const GM_INTERVENTIONS_PATH = path.join(
  DATA_DIR,
  "gm-interventions.json",
);

/** @returns {{ entries: object[] }} */
function readInterventionStore() {
  const raw = readJson(GM_INTERVENTIONS_PATH, null);
  if (!raw || typeof raw !== "object") return { entries: [] };
  return {
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

/**
 * Append-only GM intervention row (JSON via tableStore — no raw fs).
 * @param {object} entry
 */
export function appendGmIntervention(entry) {
  const store = readInterventionStore();
  const row = {
    id: `gmi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    actor: entry?.actor || "gm",
    action: entry?.action || "unknown",
    before: entry?.before ?? null,
    after: entry?.after ?? null,
    detail: entry?.detail ?? null,
  };
  store.entries.push(row);
  // keep last 500 — never rewrite older payloads, only trim head
  if (store.entries.length > 500) {
    store.entries = store.entries.slice(-500);
  }
  writeJson(GM_INTERVENTIONS_PATH, store);
  return row;
}

export function listGmInterventions(limit = 40) {
  const n = Math.max(1, Math.min(200, Number(limit) || 40));
  const store = readInterventionStore();
  return {
    ok: true,
    path: "data/gm-interventions.json",
    entries: store.entries.slice(-n).reverse(),
    total: store.entries.length,
  };
}
