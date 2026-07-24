import type { WorldState } from "../state/types";
import { censusPlanets } from "../state/planets";
import { captureMapPngDataUrl } from "./mapExportBridge";

/** Human-readable campaign brief for notes / Discord / wiki. */
export function exportCampaignMarkdown(world: WorldState): string {
  const lines: string[] = [];
  lines.push(`# ${world.meta.name}`);
  lines.push("");
  lines.push(`- Ход: **${world.meta.turn}**`);
  lines.push(`- Систем: ${world.systems.length}`);
  lines.push(`- Связей: ${world.links.length}`);
  lines.push(`- Секторов: ${world.sectors.length}`);
  lines.push(`- Флотов: ${world.fleets.length}`);
  lines.push(`- Легионов: ${world.legions.length}`);
  lines.push(`- Обновлено: ${world.meta.updatedAt}`);
  lines.push("");

  lines.push(`## Государства`);
  lines.push("");
  for (const f of world.factions) {
    const owned = world.systems.filter((s) => s.ownerFactionId === f.id).length;
    lines.push(`- **${f.name}** (\`${f.color}\`) — систем: ${owned}`);
  }
  lines.push("");

  if (world.sectors.length) {
    lines.push(`## Секторы`);
    lines.push("");
    for (const sec of world.sectors) {
      const n = world.systems.filter((s) => s.sectorId === sec.id).length;
      lines.push(`- **${sec.name}** — систем внутри: ${n}`);
    }
    lines.push("");
  }

  lines.push(`## Системы`);
  lines.push("");
  for (const s of world.systems) {
    const owner =
      world.factions.find((f) => f.id === s.ownerFactionId)?.name ?? "—";
    const sector =
      world.sectors.find((sec) => sec.id === s.sectorId)?.name ?? "—";
    const census = censusPlanets(s.planets);
    lines.push(`### ${s.name}`);
    lines.push(
      `- Тип: ${s.kind} · Владелец: ${owner} · Сектор: ${sector} · Активность: ${s.activity}`,
    );
    if (s.kind === "stellar") {
      lines.push(
        `- Звёзды: ${s.stars.map((st) => st.class).join(", ") || "—"}`,
      );
      lines.push(
        `- Планеты: ${s.planets.length} (насел. ${census.inhabited}, пригод. пуст. ${census.habitable}, неприг. ${census.uninhabitable})`,
      );
      for (const p of s.planets) {
        const races = (p.raceComposition ?? [])
          .map((r) => {
            const name =
              world.races.find((x) => x.id === r.raceId)?.name ?? r.raceId;
            return `${name} ${r.percent}%`;
          })
          .join(", ");
        lines.push(
          `  - ${p.name}: ${p.type}/${p.climate}, нас. ${p.population}${races ? ` · ${races}` : ""}`,
        );
      }
    }
    if (s.resources.length) {
      lines.push(`- Ресурсы: ${s.resources.join(", ")}`);
    }
    lines.push("");
  }

  if (world.diplomacy.length) {
    lines.push(`## Дипломатия`);
    lines.push("");
    for (const e of world.diplomacy) {
      const a = world.factions.find((f) => f.id === e.aId)?.name ?? e.aId;
      const b = world.factions.find((f) => f.id === e.bId)?.name ?? e.bId;
      lines.push(`- ${a} ↔ ${b}: ${e.relation}`);
    }
    lines.push("");
  }

  if (world.turnHistory.length) {
    lines.push(`## История ходов`);
    lines.push("");
    for (const snap of world.turnHistory) {
      lines.push(
        `- Ход ${snap.turn}: ${snap.label} (${snap.savedAt}) — систем ${snap.systems.length}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export map via Pixi extract (avoids black WebGL canvas dumps). */
export async function exportMapPng(filename: string): Promise<boolean> {
  const url = await captureMapPngDataUrl();
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  return true;
}
