import { useMemo, useState } from "react";
import type { Planet, Race, StarSystem } from "../state/types";
import {
  ChevronDown,
  ChevronUp,
  Users,
  Gem,
  Factory,
  Orbit,
} from "lucide-react";
import { formatOdMeter } from "../state/playerUiTerms";
import {
  planetContributionChips,
  systemContributionChips,
} from "./planetContributions";
import { systemMineInfo, systemMineLabel } from "./depositMining";

function formatPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function shortRes(
  id: string,
  mapNames?: Record<string, string>,
): string {
  const n = mapNames?.[id] ?? id.replace(/^map\./, "").replace(/_/g, " ");
  return n.length > 12 ? `${n.slice(0, 11)}…` : n;
}

/**
 * Compact system/planet status — yields & affordances at a glance.
 */
export function SystemStatusStrip({
  system,
  focusPlanet,
  races,
  mapResourceNames,
  reservedAp,
  apMax,
  metal,
  supply,
  factionId,
}: {
  system: StarSystem;
  focusPlanet?: Planet | null;
  races: Race[];
  mapResourceNames?: Record<string, string>;
  reservedAp?: number;
  apMax?: number;
  metal?: number;
  supply?: number;
  factionId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const planets = system.planets ?? [];
  const totalPop = focusPlanet
    ? (focusPlanet.population ?? 0)
    : planets.reduce((s, p) => s + (p.population ?? 0), 0);
  const showRes = focusPlanet
    ? (focusPlanet.resources ?? [])
    : (system.resources ?? []);
  const scope = focusPlanet ? "планета" : "система";
  const mine = systemMineInfo(system, factionId);

  const contrib = useMemo(
    () =>
      focusPlanet
        ? planetContributionChips(focusPlanet, system, factionId)
        : systemContributionChips(system, factionId),
    [focusPlanet, system, factionId],
  );

  const raceHint = useMemo(() => {
    const p = focusPlanet;
    if (!p || !(p.population > 0)) return null;
    const shares = p.raceComposition ?? [];
    if (!shares.length) return null;
    const top = [...shares].sort((a, b) => b.percent - a.percent)[0];
    if (!top) return null;
    const name =
      races.find((r) => r.id === top.raceId)?.name ?? top.raceId;
    return `${name} ${Math.round(top.percent)}%`;
  }, [focusPlanet, races]);

  const primary = contrib.slice(0, 3);

  return (
    <div className="system-status-strip">
      <button
        type="button"
        className="system-status-strip__row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="system-status-strip__chip">
          <Users size={12} />
          {formatPop(totalPop)}
          <em>{scope}</em>
        </span>
        <span
          className={`system-status-strip__chip system-status-strip__chip--mine-${mine.status}`}
          title={systemMineLabel(mine.status)}
        >
          <Orbit size={12} />
          {mine.status === "own"
            ? "добыча"
            : mine.status === "other"
              ? "чужой"
              : showRes.length
                ? "idle"
                : "—"}
        </span>
        {primary.map((c) => (
          <span
            key={c.id}
            className={`system-status-strip__chip system-status-strip__chip--${c.tone ?? "muted"}`}
            title={c.title ?? c.label}
          >
            <Factory size={11} />
            {c.label}
          </span>
        ))}
        {apMax != null && (
          <span className="system-status-strip__chip system-status-strip__chip--ap">
            {formatOdMeter(reservedAp ?? 0, apMax)}
            {metal != null ? ` · M${metal}` : ""}
            {supply != null ? ` · S${supply}` : ""}
          </span>
        )}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <div className="system-status-strip__yields" aria-label="Что даёт">
        {contrib.length === 0 ? (
          <span className="hint">Нет данных о вкладе</span>
        ) : (
          contrib.map((c) => (
            <span
              key={c.id}
              className={`system-yield-chip system-yield-chip--${c.tone ?? "muted"}`}
              title={c.title ?? c.label}
            >
              {c.label}
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="system-status-strip__body">
          {raceHint && <p className="hint">Население: {raceHint}</p>}
          <div className="system-status-strip__res">
            <Gem size={12} className="system-status-strip__res-icon" />
            {showRes.length === 0 ? (
              <span className="hint">Нет месторождений</span>
            ) : (
              showRes.slice(0, 8).map((id) => (
                <span key={id} className="system-hud-res-chip" title={id}>
                  {shortRes(id, mapResourceNames)}
                </span>
              ))
            )}
          </div>
          <p className="hint system-hud-note">
            ПКМ по объекту на схеме — быстрые действия. Зажми idle-депозит или
            ПКМ → mining.
          </p>
        </div>
      )}
    </div>
  );
}
