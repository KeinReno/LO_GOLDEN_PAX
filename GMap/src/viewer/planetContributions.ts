import type { Planet, StarSystem } from "../state/types";
import { getCachedContent } from "../state/contentCatalog";
import { COLONY_TYPE_LABELS } from "../state/defaults";
import { classifyPlanet } from "../state/planets";

export type ContributionChip = {
  id: string;
  label: string;
  /** positive | warn | muted */
  tone?: "good" | "warn" | "muted";
  title?: string;
};

function normalizeColony(t?: string | null): string {
  if (!t || t === "none") return "none";
  if (t === "capital") return "core";
  return t;
}

/**
 * Skimmable "what does this place give me?" chips for status strip / preview.
 */
export function planetContributionChips(
  planet: Planet,
  system: StarSystem,
  factionId?: string | null,
): ContributionChip[] {
  const chips: ContributionChip[] = [];
  const content = getCachedContent();
  const owner =
    planet.ownerFactionId || system.ownerFactionId || null;
  const own = !!factionId && owner === factionId;
  const colony = normalizeColony(planet.colonyType);
  const habit = classifyPlanet(planet);

  if (own && colony !== "none") {
    chips.push({
      id: "colony",
      label: COLONY_TYPE_LABELS[colony] ?? colony,
      tone: "good",
      title: "Тип колонии",
    });
  } else if (habit === "habitable" && colony === "none") {
    chips.push({
      id: "empty",
      label: "можно колонизировать",
      tone: "warn",
      title: "Пустой пригодный мир",
    });
  } else if (!own && habit === "inhabited") {
    chips.push({
      id: "foreign",
      label: "чужой мир",
      tone: "muted",
    });
  }

  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const all = [...surface, ...orbital].filter((b) => !b.disabled);

  const kindCount = new Map<string, number>();
  const catCount = new Map<string, number>();
  let popCap = 0;
  let hasShipyard = false;
  let hasMine = false;
  let hasLab = false;
  let hasDefense = false;

  for (const b of all) {
    kindCount.set(b.kind, (kindCount.get(b.kind) ?? 0) + 1);
    if (b.kind === "shipyard" || b.kind === "spaceport") hasShipyard = true;
    if (b.kind === "mine") hasMine = true;
    if (b.kind === "lab") hasLab = true;
    if (b.kind === "defense" || b.kind === "barracks") hasDefense = true;

    const def =
      (b.buildingId && content?.buildings?.[b.buildingId]) ||
      Object.values(content?.buildings ?? {}).find(
        (d) =>
          d.kind === b.kind &&
          (d.zone || "surface") === (b.zone || "surface"),
      );
    if (def?.category) {
      catCount.set(
        String(def.category),
        (catCount.get(String(def.category)) ?? 0) + 1,
      );
    }
    for (const fx of def?.effects ?? []) {
      if (fx.effect === "pop_cap_add") {
        popCap += Number((fx.args as { amount?: number })?.amount ?? 0);
      }
    }
  }

  if (popCap > 0) {
    chips.push({
      id: "popcap",
      label: `+${popCap} ёмкость`,
      tone: "good",
      title: "Прирост лимита населения от построек",
    });
  }

  if (hasMine) {
    chips.push({
      id: "mine",
      label: "добыча",
      tone: "good",
      title: "Есть шахты на поверхности",
    });
  }
  if (hasShipyard) {
    chips.push({
      id: "yard",
      label: "верфь",
      tone: "good",
      title: "Космопорт / верфь — производство кораблей",
    });
  }
  if (hasLab) {
    chips.push({
      id: "lab",
      label: "наука",
      tone: "good",
    });
  }
  if (hasDefense) {
    chips.push({
      id: "def",
      label: "оборона",
      tone: "good",
    });
  }

  const res = planet.resources ?? [];
  if (res.length > 0) {
    chips.push({
      id: "ores",
      label: `${res.length} местн. res`,
      tone: own ? "good" : "muted",
      title: res.join(", "),
    });
  }

  const surfMax = planet.surfaceSlots ?? 8;
  const orbMax = planet.orbitalSlots ?? 4;
  const freeSurf = Math.max(0, surfMax - surface.length);
  const freeOrb = Math.max(0, orbMax - orbital.length);
  if (own && (freeSurf > 0 || freeOrb > 0)) {
    chips.push({
      id: "slots",
      label: `свободно ${freeSurf}+${freeOrb}`,
      tone: freeSurf + freeOrb >= 3 ? "warn" : "muted",
      title: `Свободные слоты: поверхность ${freeSurf}, орбита ${freeOrb}`,
    });
  }

  if (own && all.length === 0 && colony !== "none") {
    chips.push({
      id: "nobuild",
      label: "нет построек",
      tone: "warn",
      title: "Колония без инфраструктуры",
    });
  }

  return chips.slice(0, 8);
}

export function systemContributionChips(
  system: StarSystem,
  factionId?: string | null,
): ContributionChip[] {
  const chips: ContributionChip[] = [];
  const planets = system.planets ?? [];
  const ownPlanets = planets.filter((p) => {
    const o = p.ownerFactionId || system.ownerFactionId;
    return factionId && o === factionId && (p.population ?? 0) > 0;
  });
  chips.push({
    id: "worlds",
    label: `${ownPlanets.length} колоний`,
    tone: ownPlanets.length ? "good" : "muted",
  });

  const belt = system.resources ?? [];
  if (belt.length) {
    const miners = (system.stations ?? []).filter((s) => s.kind === "mining");
    const ownMiner = miners.some((s) => s.factionId === factionId);
    chips.push({
      id: "belt",
      label: ownMiner
        ? `пояс ×${belt.length} · добыча`
        : `пояс ×${belt.length} · idle`,
      tone: ownMiner ? "good" : "warn",
      title: ownMiner
        ? "Системные депозиты добываются"
        : "Депозиты пояса без вашей mining-станции",
    });
  }

  const stations = system.stations ?? [];
  const ownSt = stations.filter((s) => s.factionId === factionId);
  if (ownSt.length) {
    chips.push({
      id: "st",
      label: `${ownSt.length} станций`,
      tone: "good",
    });
  }

  let shipyards = 0;
  for (const p of ownPlanets) {
    for (const b of [
      ...(p.orbitalBuildings ?? []),
      ...(p.surfaceBuildings ?? []),
    ]) {
      if (b.kind === "shipyard" || b.kind === "spaceport") shipyards++;
    }
  }
  if (shipyards > 0) {
    chips.push({
      id: "sys-yard",
      label: "верфь в системе",
      tone: "good",
    });
  }

  return chips.slice(0, 6);
}
