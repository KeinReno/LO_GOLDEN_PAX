import type { WorldState } from "../state/types";
import { SYSTEM_ACTIVITY_LABELS } from "../state/defaults";
import { systemKindLabel } from "../state/displayLabels";
import { censusPlanets } from "../state/planets";
import { captureMapPngDataUrl, type MapPngExportOptions } from "./mapExportBridge";

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
      `- Тип: ${systemKindLabel(s.kind)} · Владелец: ${owner} · Сектор: ${sector} · Активность: ${SYSTEM_ACTIVITY_LABELS[s.activity ?? "none"] ?? s.activity ?? "—"}`,
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
export async function exportMapPng(
  filename: string,
  opts?: MapPngExportOptions,
): Promise<boolean> {
  const url = await captureMapPngDataUrl(opts);
  if (!url) return false;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  return true;
}

/**
 * Poster: map PNG + title / turn stamp chrome (P8.4).
 * scope=playerVisible — только системы в зоне видимости фракции, с fit по ним.
 */
export async function exportMapPosterPng(
  world: WorldState,
  opts?: {
    filename?: string;
    subtitle?: string;
    scope?: MapPngExportOptions["scope"];
    factionId?: string | null;
  },
): Promise<boolean> {
  const mapUrl = await captureMapPngDataUrl({
    scope: opts?.scope ?? "viewport",
    factionId: opts?.factionId,
  });
  if (!mapUrl) return false;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("map image load failed"));
    el.src = mapUrl;
  });

  const pad = 48;
  const headerH = 88;
  const footerH = 40;
  const w = Math.max(960, img.width + pad * 2);
  const h = img.height + headerH + footerH + pad;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  // Atmosphere — warm dark board, not flat white
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#1a1510");
  grad.addColorStop(0.5, "#241c14");
  grad.addColorStop(1, "#120e0a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#c9a227";
  ctx.font = "600 28px Georgia, 'Times New Roman', serif";
  ctx.fillText(world.meta.name || "Campaign", pad, 42);

  ctx.fillStyle = "#e8dcc8";
  ctx.font = "16px Georgia, 'Times New Roman', serif";
  const turnLine = `Ход ${world.meta.turn}${opts?.subtitle ? ` · ${opts.subtitle}` : ""}`;
  ctx.fillText(turnLine, pad, 68);

  const mapX = Math.floor((w - img.width) / 2);
  const mapY = headerH;
  ctx.strokeStyle = "rgba(201,162,39,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX - 1, mapY - 1, img.width + 2, img.height + 2);
  ctx.drawImage(img, mapX, mapY);

  ctx.fillStyle = "rgba(232,220,200,0.55)";
  ctx.font = "12px Georgia, 'Times New Roman', serif";
  const when = world.meta.updatedAt
    ? new Date(world.meta.updatedAt).toLocaleString("ru-RU")
    : new Date().toLocaleString("ru-RU");
  ctx.fillText(`LO Golden Pax · ${when}`, pad, h - 16);

  const out = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = out;
  a.download =
    opts?.filename ||
    `${(world.meta.name || "campaign").replace(/\s+/g, "_")}_turn${world.meta.turn}.png`;
  a.click();
  return true;
}

function slugify(name: string): string {
  return (name || "campaign").replace(/\s+/g, "_");
}

/** Плакат только по видимой игроку области (активная фракция + fog mask). */
export async function exportMapPlayerPosterPng(
  world: WorldState,
  opts?: {
    filename?: string;
    factionId?: string | null;
    factionName?: string;
  },
): Promise<boolean> {
  const facLabel = opts?.factionName?.trim() || "игрок";
  return exportMapPosterPng(world, {
    scope: "playerVisible",
    factionId: opts?.factionId,
    subtitle: `вид ${facLabel}`,
    filename:
      opts?.filename ??
      `${slugify(world.meta.name)}_ход${world.meta.turn}_${slugify(facLabel)}_вид.png`,
  });
}

/** PNG без рамки — только видимая игроку область. */
export async function exportMapPlayerPng(
  filename: string,
  opts?: { factionId?: string | null },
): Promise<boolean> {
  return exportMapPng(filename, {
    scope: "playerVisible",
    factionId: opts?.factionId,
  });
}
