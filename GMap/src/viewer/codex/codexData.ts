import type {
  FactionIntelPublic,
  KnowledgeLevel,
  ViewerPayload,
} from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import {
  buildingKindLabel,
  buildingZoneLabel,
  cultureLabel,
  economyCategoryLabel,
  faithLabel,
  ideologyLabel,
  raceKindLabel,
  resolveBuildingDef,
  resolveIntelEntityName,
  shipRoleLabel,
  traitLabel,
} from "./codexResolve";

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
      return "Хорошо изучено";
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
          const capId = String(fac.capitalSystemId);
          const capName =
            payload.world.systems.find((s) => s.id === capId)?.name ?? capId;
          lines.push(`Столица: ${capName}`);
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
        if ("dominantIdeology" in fac && fac.dominantIdeology) {
          lines.push(
            `Идеология: ${ideologyLabel(String(fac.dominantIdeology))}`,
          );
        }
      }
      if (level >= 3 && "primaryRaceId" in fac && fac.primaryRaceId) {
        const rid = String(fac.primaryRaceId);
        const raceName = content?.races?.[rid]?.name ?? rid;
        lines.push(`Основная раса: ${raceName}`);
      }
      if (level >= 3 && "primaryFaith" in fac && fac.primaryFaith) {
        lines.push(`Вера: ${faithLabel(String(fac.primaryFaith))}`);
      }
      if (level >= 3 && "defaultCultureId" in fac && fac.defaultCultureId) {
        lines.push(`Культура: ${cultureLabel(String(fac.defaultCultureId))}`);
      }
      out.push({
        id,
        name,
        category: "Государство",
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
      const formatTraits = (ids: string[]) =>
        ids.map((tid) => traitLabel(tid, content)).join(", ");
      if (level >= 1) {
        lines.push(`Тип: ${raceKindLabel(def?.kind)}`);
        if (def?.origin) lines.push(`Происхождение: ${def.origin}`);
      }
      if (level >= 2) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const shown = traits.slice(0, 2).map(traitId);
        if (shown.length) lines.push(`Черты: ${formatTraits(shown)}`);
      }
      if (level >= 3) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const visible = traits
          .map(traitId)
          .filter((tid) => !tid.includes("hidden"));
        const idx = lines.findIndex((l) => l.startsWith("Черты:"));
        const line = `Черты: ${visible.length ? formatTraits(visible) : "—"}`;
        if (idx >= 0) lines[idx] = line;
        else if (visible.length) lines.push(line);
      }
      if (level >= 4) {
        const traits = Array.isArray(def?.traits) ? def.traits : [];
        const all = traits.map(traitId).filter(Boolean);
        const idx = lines.findIndex((l) => l.startsWith("Черты:"));
        const line = `Черты: ${all.length ? formatTraits(all) : "—"}`;
        if (idx >= 0) lines[idx] = line;
        else if (all.length) lines.push(line);
      }
      out.push({
        id,
        name,
        category: raceKindLabel(def?.kind),
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
        lines.push(`Категория: ${economyCategoryLabel(def?.category)}`);
        const era = def?.era;
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
        if (cost != null) {
          lines.push(
            `Стоимость: ${cost} ${economyCategoryLabel("currency.cognitio")}`,
          );
        }
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
        category: economyCategoryLabel(def?.category),
        level,
        section,
        lines,
        hint: LEVEL_HINT[level],
      });
    }
  }

  if (section === "buildings") {
    for (const [id, raw] of Object.entries(intel.knownBuildings)) {
      const level = clampLevel(raw);
      if (level < Math.max(1, minLevel)) continue;
      const def = resolveBuildingDef(content, id);
      const name =
        def?.name ??
        buildingKindLabel(def?.kind) ??
        resolveIntelEntityName(payload, "building", id);
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      if (level >= 1) {
        lines.push(`Тип: ${buildingKindLabel(def?.kind)}`);
        if (def?.zone) lines.push(`Зона: ${buildingZoneLabel(def.zone)}`);
        if (def?.category) {
          lines.push(`Поток: ${economyCategoryLabel(def.category)}`);
        }
      }
      if (level >= 2 && def?.tier != null) lines.push(`Тир: ${def.tier}`);
      if (level >= 2 && def?.signature) {
        lines.push(def.signature.slice(0, 120));
      }
      out.push({
        id,
        name,
        category: buildingKindLabel(def?.kind),
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
      const ships = content?.ships ?? {};
      const def =
        ships[id] ??
        units[id] ??
        ships[id.startsWith("ship.") ? id : `ship.${id}`] ??
        units[id.startsWith("unit.") ? id : `unit.${id}`];
      const name = def?.name ?? resolveIntelEntityName(payload, "unit", id);
      if (q && !name.toLowerCase().includes(q) && !id.toLowerCase().includes(q))
        continue;
      const lines: string[] = [];
      const roleRaw =
        (def as { class?: string; roles?: string[] } | undefined)?.class ??
        (def as { roles?: string[] } | undefined)?.roles?.[0];
      const roleLabel = roleRaw
        ? shipRoleLabel(roleRaw)
        : ships[id] || id.startsWith("ship.")
          ? "Корабль"
          : "Юнит";
      if (level >= 1) lines.push(`Роль: ${roleLabel}`);
      if (level >= 2 && def?.tier != null) lines.push(`Тир: ~${def.tier}`);
      out.push({
        id,
        name,
        category: roleLabel,
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
