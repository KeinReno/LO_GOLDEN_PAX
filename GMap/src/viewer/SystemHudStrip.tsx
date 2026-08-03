import { useMemo } from "react";
import type { Planet, Race, StarSystem } from "../state/types";
import { Users, Gem, Orbit } from "lucide-react";

type RaceRow = { raceId: string; percent: number; pop: number };

const PIE_COLORS = [
  "#c9a227",
  "#6ec8d9",
  "#5cdb95",
  "#e85d4c",
  "#b388ff",
  "#f0c14a",
  "#7a9bb8",
  "#d4a574",
];

function aggregateRaces(planets: Planet[]): RaceRow[] {
  const weighted = new Map<string, number>();
  let totalPop = 0;
  for (const p of planets) {
    const pop = p.population ?? 0;
    if (pop <= 0) continue;
    totalPop += pop;
    const shares = p.raceComposition ?? [];
    if (shares.length === 0) {
      weighted.set("_unknown", (weighted.get("_unknown") ?? 0) + pop);
      continue;
    }
    for (const s of shares) {
      weighted.set(
        s.raceId,
        (weighted.get(s.raceId) ?? 0) + (pop * (s.percent || 0)) / 100,
      );
    }
  }
  if (totalPop <= 0) return [];
  return [...weighted.entries()]
    .map(([raceId, w]) => ({
      raceId,
      pop: Math.round(w),
      percent: Math.round((w / totalPop) * 100),
    }))
    .sort((a, b) => b.pop - a.pop);
}

function resourceChips(
  ids: string[],
  mapNames?: Record<string, string>,
): { id: string; label: string }[] {
  return ids.slice(0, 8).map((id) => ({
    id,
    label: mapNames?.[id] ?? id.replace(/^map\./, "").replace(/_/g, " "),
  }));
}

function formatPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function RacePie({ rows }: { rows: RaceRow[] }) {
  const size = 72;
  const r = 30;
  const cx = size / 2;
  const cy = size / 2;
  const total = rows.reduce((s, x) => s + Math.max(x.pop, 0), 0);
  if (total <= 0) return null;

  let angle = -Math.PI / 2;
  const slices = rows.map((row, i) => {
    const share = Math.max(row.pop, 0) / total;
    const sweep = share * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    const large = sweep > Math.PI ? 1 : 0;
    const d =
      share >= 0.999
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    return {
      d,
      color: PIE_COLORS[i % PIE_COLORS.length],
      row,
    };
  });

  return (
    <svg
      className="system-hud-pie"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      {slices.map((s) => (
        <path key={s.row.raceId} d={s.d} fill={s.color}>
          <title>
            {s.row.raceId}: {s.row.pop} ({s.row.percent}%)
          </title>
        </path>
      ))}
      <circle cx={cx} cy={cy} r={14} fill="rgba(10,14,20,0.92)" />
    </svg>
  );
}

export function SystemHudStrip({
  system,
  focusPlanet,
  races,
  mapResourceNames,
  extractionByResource,
}: {
  system: StarSystem;
  focusPlanet?: Planet | null;
  races: Race[];
  mapResourceNames?: Record<string, string>;
  /** Optional net extraction per resource id for this system. */
  extractionByResource?: Record<string, number>;
}) {
  const planets = system.planets ?? [];
  const raceRows = useMemo(() => {
    if (focusPlanet) {
      const pop = focusPlanet.population ?? 0;
      const shares = focusPlanet.raceComposition ?? [];
      if (pop <= 0) return [];
      if (shares.length === 0) {
        return [{ raceId: "_unknown", percent: 100, pop }];
      }
      return shares
        .map((s) => ({
          raceId: s.raceId,
          percent: Math.round(s.percent || 0),
          pop: Math.round((pop * (s.percent || 0)) / 100),
        }))
        .sort((a, b) => b.pop - a.pop);
    }
    return aggregateRaces(planets);
  }, [focusPlanet, planets]);

  const totalPop = focusPlanet
    ? (focusPlanet.population ?? 0)
    : planets.reduce((s, p) => s + (p.population ?? 0), 0);

  const planetRes = focusPlanet?.resources ?? [];
  const systemRes = system.resources ?? [];
  const showRes = focusPlanet ? planetRes : systemRes;
  const scopeLabel = focusPlanet ? "планета" : "система";

  const raceName = (id: string) =>
    id === "_unknown"
      ? "неизв."
      : (races.find((r) => r.id === id)?.name ?? id);

  return (
    <aside className="system-hud-strip" aria-label="Сводка системы">
      <div className="system-hud-card">
        <div className="system-hud-card__head">
          <Users size={14} strokeWidth={2} />
          <span>Население · {scopeLabel}</span>
        </div>
        <strong className="system-hud-card__value" title={String(totalPop)}>
          {formatPop(totalPop)}
          <span className="system-hud-card__exact">{totalPop}</span>
        </strong>
        {raceRows.length > 0 ? (
          <div className="system-hud-pop-row">
            <RacePie rows={raceRows.slice(0, 8)} />
            <div className="system-hud-races">
              {raceRows.slice(0, 5).map((r, i) => (
                <div key={r.raceId} className="system-hud-race">
                  <i
                    className="system-hud-race__swatch"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="system-hud-race__label">
                    {raceName(r.raceId)}
                  </span>
                  <span className="system-hud-race__nums">
                    {formatPop(r.pop)}
                    <em>{r.percent}%</em>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span className="hint">Нет колонистов</span>
        )}
      </div>

      <div className="system-hud-card">
        <div className="system-hud-card__head">
          <Gem size={14} strokeWidth={2} />
          <span>Ресурсы · {scopeLabel}</span>
        </div>
        <div className="system-hud-res">
          {showRes.length === 0 ? (
            <span className="hint">Нет месторождений</span>
          ) : (
            resourceChips(showRes, mapResourceNames).map((r) => {
              const yieldN = extractionByResource?.[r.id];
              return (
                <span key={r.id} className="system-hud-res-chip" title={r.id}>
                  {r.label}
                  {yieldN != null && yieldN !== 0 ? <em>+{yieldN}</em> : null}
                </span>
              );
            })
          )}
        </div>
        {!focusPlanet && planetRes.length === 0 && systemRes.length > 0 && (
          <p className="hint system-hud-note">
            Системные депозиты — добыча станциями
          </p>
        )}
        {focusPlanet && (
          <p className="hint system-hud-note">
            Системные: {(system.resources ?? []).length} · станции:{" "}
            {(system.stations ?? []).length}
          </p>
        )}
      </div>

      <div className="system-hud-card system-hud-card--layers">
        <div className="system-hud-card__head">
          <Orbit size={14} strokeWidth={2} />
          <span>Слои</span>
        </div>
        <ul className="system-hud-layers">
          <li>
            <i className="layer-dot layer-dot--planet" /> Планета / поверхность
          </li>
          <li>
            <i className="layer-dot layer-dot--orbit" /> Орбита мира
          </li>
          <li>
            <i className="layer-dot layer-dot--system" /> Пояс системы
          </li>
        </ul>
      </div>
    </aside>
  );
}
