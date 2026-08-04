import type {
  FactionIntelPublic,
  KnowledgeLevel,
  ViewerPayload,
} from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";

export type CodexSection =
  | "races"
  | "factions"
  | "buildings"
  | "units"
  | "techs"
  | "history";

export type CodexEntryModel = {
  id: string;
  name: string;
  category?: string;
  level: KnowledgeLevel;
  section: Exclude<CodexSection, "history">;
  /** Extra lines depending on level */
  lines: string[];
  hint?: string;
  lore?: string;
};

const LEVEL_HINT: Record<KnowledgeLevel, string | undefined> = {
  0: undefined,
  1: "Детальная информация не собрана.",
  2: "Точные характеристики не собраны.",
  3: "Скрытые свойства не изучены.",
  4: undefined,
};

export function knowledgeLabel(level: KnowledgeLevel): string {
  switch (level) {
    case 0:
      return "Неизвестно";
    case 1:
      return "Обнаружено";
    case 2:
      return "Базовые данные";
    case 3:
      return "Детальная разведка";
    case 4:
      return "Полное изучение";
    default:
      return "?";
  }
}

function clampLevel(n: unknown): KnowledgeLevel {
  const v = Math.floor(Number(n) || 0);
  if (v <= 0) return 0;
  if (v >= 4) return 4;
  return v as KnowledgeLevel;
}

export function buildCodexEntries(
  payload: ViewerPayload,
  section: Exclude<CodexSection, "history">,
  query: string,
  minLevel: KnowledgeLevel,
): CodexEntryModel[] {
  const intel: FactionIntelPublic = payload.intel ?? {
    knownFactions: {},
    knownRaces: {},
    knownTechs: {},
    knownBuildings: {},
    knownUnits: {},
    intelHistory: [],
  };
  const content = getCachedContent();
  const q = query.trim().toLowerCase();
  const out: CodexEntryModel[] = [];

  if (section === "factions") {
    for (const [id, raw] of Object.entries(intel.knownFactions)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const fac =
        payload.world.factions.find((f) => f.id === id) ??
        ({ id, name: id } as { id: string; name: string });
      const name = fac.name || id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      if (level >= 1) {
        lines.push(`Тип: государство`);
        if ("capitalSystemId" in fac && fac.capitalSystemId) {
          lines.push(`Столица: ${String(fac.capitalSystemId)}`);
        }
      }
      if (level >= 2) {
        const tier =
          ("approximateTier" in fac && fac.approximateTier) ||
          ("techTier" in fac && fac.techTier);
        if (tier != null) lines.push(`Тир: ${String(tier)}`);
        if ("specialization" in fac && fac.specialization) {
          lines.push(`Специализация: ${String(fac.specialization)}`);
        }
      }
      if (level >= 3 && "primaryRaceId" in fac && fac.primaryRaceId) {
        lines.push(`Основная раса: ${String(fac.primaryRaceId)}`);
      }
      out.push({
        id,
        name,
        category: "faction",
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
      });
    }
  }

  if (section === "races") {
    const races = content?.races ?? {};
    for (const [id, raw] of Object.entries(intel.knownRaces)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const def = races[id];
      const name = def?.name ?? id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      const traitId = (t: unknown) =>
        typeof t === "string" ? t : (t as { id?: string })?.id ?? String(t);
      if (level >= 1) {
        lines.push(`Тип: ${def?.kind ?? "раса"}`);
        if (def?.origin) lines.push(`Происхождение: ${def.origin}`);
      }
      if (level >= 2) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const shown = traits.slice(0, 2).map(traitId);
        if (shown.length) lines.push(`Черты: ${shown.join(", ")}`);
      }
      if (level >= 3) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const visible = traits
          .map(traitId)
          .filter((tid) => !tid.includes("hidden"));
        const idx = lines.findIndex((l) => l.startsWith("Черты:"));
        const line = `Черты: ${visible.join(", ") || "—"}`;
        if (idx >= 0) lines[idx] = line;
        else if (visible.length) lines.push(line);
      }
      if (level >= 4) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const all = traits.map(traitId).filter(Boolean);
        const idx = lines.findIndex((l) => l.startsWith("Черты:"));
        const line = `Черты: ${all.join(", ") || "—"}`;
        if (idx >= 0) lines[idx] = line;
        else if (all.length) lines.push(line);
      }
      out.push({
        id,
        name,
        category: def?.kind ?? "race",
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
        lore: level >= 4 ? def?.origin : undefined,
      });
    }
  }

  if (section === "techs") {
    const techs = content?.technologies ?? {};
    for (const [id, raw] of Object.entries(intel.knownTechs)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const def = techs[id];
      const name = def?.name ?? id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      if (level >= 1) {
        lines.push(`Категория: ${def?.category ?? "—"}`);
        const era = (def as { era?: number | string } | undefined)?.era;
        if (era != null) lines.push(`Эпоха: ${String(era)}`);
      }
      if (level >= 2) {
        const desc =
          (def as { description?: string; flavor?: string } | undefined)
            ?.flavor ||
          (def as { description?: string } | undefined)?.description;
        lines.push(`Назначение: ${desc?.slice(0, 120) ?? "—"}`);
      }
      if (level >= 3) {
        const cost = def?.cost?.["currency.cognitio"];
        if (cost != null) lines.push(`Стоимость: ${cost} cognitio`);
        const effects = (def as { effects?: unknown[] } | undefined)?.effects;
        if (effects?.length) {
          lines.push(`Эффекты: ${effects.length}`);
        }
      }
      if (level >= 4) {
        const upgrades = (def as { upgrades?: unknown[] } | undefined)?.upgrades;
        if (upgrades?.length) {
          lines.push(`Апгрейды: ${upgrades.length}`);
        }
      }
      out.push({
        id,
        name,
        category: def?.category ?? "tech",
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
      });
    }
  }

  if (section === "buildings") {
    const buildings = content?.buildings ?? {};
    for (const [id, raw] of Object.entries(intel.knownBuildings)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const def = buildings[id] as
        | { name?: string; category?: string; tier?: number; description?: string }
        | undefined;
      const name = def?.name ?? id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      if (level >= 1) lines.push(`Категория: ${def?.category ?? "здание"}`);
      if (level >= 2 && def?.tier != null) lines.push(`Тир: ${def.tier}`);
      if (level >= 2 && def?.description) {
        lines.push(def.description.slice(0, 120));
      }
      out.push({
        id,
        name,
        category: def?.category ?? "building",
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
      });
    }
  }

  if (section === "units") {
    const units =
      (content as { units?: Record<string, { name?: string; class?: string; tier?: number }> })
        ?.units ?? {};
    for (const [id, raw] of Object.entries(intel.knownUnits)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const ships = (content as { ships?: Record<string, { name?: string; class?: string; roles?: string[]; tier?: number }> })?.ships ?? {};
      const def = ships[id] ?? units[id];
      const name = def?.name ?? id;
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      const klass = def?.class ?? (def as { roles?: string[] } | undefined)?.roles?.[0] ?? (ships[id] ? "корабль" : "юнит");
      if (level >= 1) lines.push(`Класс: ${klass}`);
      if (level >= 2 && def?.tier != null) lines.push(`Тир: ~${def.tier}`);
      out.push({
        id,
        name,
        category: klass,
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
      });
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function countUnknownHint(intel: FactionIntelPublic | undefined): number {
  if (!intel) return 0;
  // History length as soft activity signal; true unknown count is unknowable by design
  return 0;
}
