import type { WorldState } from "../state/types";
import { assembleWorld } from "./campaignIo";

const DRAFT_KEY = "gmap:draft:v1";
const DRAFT_META_KEY = "gmap:draft-meta:v1";
const LAST_SAVED_KEY = "gmap:last-saved-at:v1";

export type DraftMeta = {
  savedAt: string;
  name: string;
  turn: number;
  systems: number;
};

export function getDraftMeta(): DraftMeta | null {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftMeta;
  } catch {
    return null;
  }
}

export function loadDraft(): WorldState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data.meta || !data.systems) return null;
    return assembleWorld(data as unknown as WorldState);
  } catch {
    return null;
  }
}

export function saveDraft(world: WorldState): DraftMeta {
  const meta: DraftMeta = {
    savedAt: new Date().toISOString(),
    name: world.meta.name,
    turn: world.meta.turn,
    systems: world.systems.length,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(world));
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
  return meta;
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_META_KEY);
}

export function getLastSavedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SAVED_KEY);
  } catch {
    return null;
  }
}

export function markSaved(at = new Date().toISOString()): void {
  localStorage.setItem(LAST_SAVED_KEY, at);
}

export function isDirty(world: WorldState): boolean {
  const last = getLastSavedAt();
  if (!last) return world.systems.length > 0;
  return world.meta.updatedAt > last;
}
