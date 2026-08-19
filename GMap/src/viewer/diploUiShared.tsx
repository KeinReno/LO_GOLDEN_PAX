import type { CSSProperties } from "react";
import type {
  DiplomacyEvent,
  DiplomacyRelation,
  Faction,
  ViewerPayload,
} from "../state/types";
import { DIPLOMACY_LABELS } from "../state/defaults";

export function getRelation(
  payload: ViewerPayload,
  a: string,
  b: string,
): DiplomacyRelation {
  const [x, y] = a < b ? [a, b] : [b, a];
  const edge = payload.world.diplomacy.find((d) => d.aId === x && d.bId === y);
  const rel = edge?.relation ?? edge?.status ?? edge?.state;
  return (rel as DiplomacyRelation | undefined) ?? "neutral";
}

export function opinionOf(fac: Faction | undefined, otherId: string): number {
  return fac?.diplomacy?.opinions?.[otherId] ?? 0;
}

export function opinionTone(value: number): "good" | "warm" | "cold" | "bad" {
  if (value >= 40) return "good";
  if (value <= -40) return "bad";
  if (value >= 10) return "warm";
  return "cold";
}

export function opinionLabel(value: number): string {
  if (value >= 60) return "Дружелюбны";
  if (value >= 25) return "Благожелательны";
  if (value >= 5) return "Нейтрально-позитивно";
  if (value > -5) return "Безразличие";
  if (value > -25) return "Недоверие";
  if (value > -60) return "Враждебность";
  return "Ненависть";
}

export function OpinionBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value + 100) / 200) * 100));
  const tone = opinionTone(value);
  return (
    <div
      className={`diplo-opinion-bar diplo-opinion-bar--${tone}`}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={-100}
      aria-valuemax={100}
      aria-label={`Отношение ${value}`}
    >
      <div className="diplo-opinion-bar__fill" style={{ width: `${pct}%` }} />
      <span className="diplo-opinion-bar__label">
        {value > 0 ? `+${value}` : value}
      </span>
    </div>
  );
}

export function RelationBadge({ relation }: { relation: DiplomacyRelation }) {
  return (
    <span className={`diplo-badge diplo-badge--${relation}`}>
      {DIPLOMACY_LABELS[relation] ?? relation}
    </span>
  );
}

/** Attitude line for diplomacy faceoff. */
export function DiploAttitudeLabel({ opinion }: { opinion: number }) {
  const tone = opinionTone(opinion);
  return (
    <p className={`gc-diplo-faceoff__attitude gc-diplo-faceoff__attitude--${tone}`}>
      {opinionLabel(opinion)}
    </p>
  );
}

export function DiploTimeline({ events }: { events: DiplomacyEvent[] }) {
  if (!events.length) {
    return (
      <p className="hint">Пока тихо на дипломатическом фронте.</p>
    );
  }
  return (
    <ol className="diplo-timeline diplo-timeline--beam">
      {events
        .slice()
        .reverse()
        .slice(0, 10)
        .map((e, i) => (
          <li key={`${e.turn}-${i}`} className="diplo-timeline__item">
            <span className="diplo-timeline__turn">Ход {e.turn}</span>
            <span className="diplo-timeline__label">{e.label}</span>
            {typeof e.opinionDelta === "number" && (
              <span
                className={`diplo-timeline__delta ${
                  e.opinionDelta >= 0 ? "is-plus" : "is-minus"
                }`}
              >
                {e.opinionDelta > 0 ? `+${e.opinionDelta}` : e.opinionDelta}
              </span>
            )}
          </li>
        ))}
    </ol>
  );
}

export function FactionEmblem({
  faction,
  className = "",
  size = "md",
}: {
  faction: Faction;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const cls = `gc-diplo-emblem gc-diplo-emblem--${size} ${className}`.trim();
  if (faction.emblemPath) {
    return <img className={cls} src={faction.emblemPath} alt="" />;
  }
  const initial = (faction.name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <span
      className={`${cls} gc-diplo-emblem--mono`}
      style={
        {
          "--gc-emblem-color": faction.color || "var(--accent)",
        } as CSSProperties
      }
      aria-hidden
    >
      {initial}
    </span>
  );
}

/** GC-style leader plate: portrait above, name below — never side-by-side squeeze. */
export function DiploLeaderCard({
  faction,
  align = "start",
  compact = false,
}: {
  faction: Faction;
  align?: "start" | "end";
  compact?: boolean;
}) {
  const kind =
    faction.kind === "faction"
      ? "Фракция"
      : faction.kind === "state"
        ? "Государство"
        : null;
  return (
    <div
      className={`gc-leader-card gc-leader-card--${align}${compact ? " gc-leader-card--compact" : ""}`}
      style={{ "--gc-leader-accent": faction.color } as CSSProperties}
    >
      <div className="gc-leader-card__frame">
        <FactionEmblem faction={faction} size={compact ? "md" : "xl"} />
      </div>
      <div className="gc-leader-card__meta">
        <strong className="gc-leader-card__name" title={faction.name}>
          {faction.name}
        </strong>
        {kind ? <span className="gc-leader-card__kind">{kind}</span> : null}
      </div>
    </div>
  );
}
