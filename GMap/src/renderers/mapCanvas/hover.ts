import type { StarSystem } from "../../state/types";
import { isCorridorSystem, censusPlanets } from "../../state/planets";

export function buildSystemHoverLines(s: StarSystem): string[] {
  const lines: string[] = [];
  if (s.isCapital) lines.push("Столица");
  if (isCorridorSystem(s)) lines.push("Коридор");
  const census = censusPlanets(s.planets ?? []);
  if (census.total > 0) {
    const bits: string[] = [];
    if (census.inhabited) bits.push(`${census.inhabited} нас.`);
    if (census.habitable) bits.push(`${census.habitable} приг.`);
    if (census.uninhabitable) bits.push(`${census.uninhabitable} пуст.`);
    if (bits.length) lines.push(bits.join(" · "));
  }
  const nRes = s.resources?.length ?? 0;
  if (nRes > 0) lines.push(`Ресурсы: ${nRes}`);
  const nSt = s.stations?.length ?? 0;
  if (nSt > 0) lines.push(`Станции: ${nSt}`);
  if (s.activity && s.activity !== "none") lines.push(`Активность: ${s.activity}`);
  if (s.blockaded) lines.push("Блокада");
  return lines.slice(0, 5);
}
