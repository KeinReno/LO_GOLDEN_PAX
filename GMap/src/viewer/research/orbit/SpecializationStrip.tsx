import { Box, Zap, Target, Shield, Rocket, Brain, Leaf, Sparkles } from "lucide-react";
import { getCachedContent } from "../../../state/contentCatalog";
import { liveBreakthroughTechId } from "../../../state/techPathLive";
import type { ViewerPayload } from "../../../state/types";
import {
  directionColor,
  directionLabel,
  type TechDirectionId,
} from "../../../state/techDirections";
import {
  roleScorePathsForDirection,
  type MaterialRoleScoreId,
} from "./directionRoleScorePaths";

/**
 * Tier 3 of the science screen (§1a of SCIENCE_ORBIT_REDESIGN_SPEC.md) —
 * replaces the old buried "Пути развития" fold that used to live inside
 * ResearchPanel.tsx's tree body. Gauges, not a button: each RoleScore path
 * is grouped under the orbit direction that owns it (directionRoleScorePaths
 * .ts), with a marked breakthrough threshold instead of a flat "Прорыв"
 * click target.
 *
 * Does NOT touch the global topbar `PathsStrip.tsx` chip (ViewerPlayTopbar
 * .tsx) — that shows all 10 paths (8 material + 2 civic) from any screen and
 * is out of scope here; this strip only covers the 8 material paths that
 * navigate to Research, grouped by direction, and only renders while inside
 * the science screen.
 */

const ROLE_ICONS: Record<MaterialRoleScoreId, typeof Box> = {
  structural: Box,
  energy: Zap,
  offensive: Target,
  defensive: Shield,
  mobility: Rocket,
  cognitive: Brain,
  biological: Leaf,
  exotic: Sparkles,
};

const ROLE_LABELS: Record<MaterialRoleScoreId, string> = {
  structural: "Структурный",
  energy: "Энергетический",
  offensive: "Ударный",
  defensive: "Защитный",
  mobility: "Мобильность",
  cognitive: "Когнитивный",
  biological: "Биологический",
  exotic: "Экзотический",
};

type GaugeState = "accumulating" | "ready" | "open";

type RoleGauge = {
  id: MaterialRoleScoreId;
  label: string;
  score: number;
  threshold: number;
  pct: number;
  state: GaugeState;
  breakthroughName: string | null;
};

function buildGauge(
  id: MaterialRoleScoreId,
  eco: ViewerPayload["economy"] | undefined,
  content: ReturnType<typeof getCachedContent>,
): RoleGauge {
  const scores = eco?.roleScores ?? {};
  const score = Number(scores[id]) || 0;
  const ms = content?.role_milestones as Record<string, { threshold?: number }> | undefined;
  const schemaTh =
    (content?.economy_schema?.role_score_pilot?.thresholds as Record<string, number>) ?? {};
  const threshold = Number(ms?.[id]?.threshold) || Number(schemaTh[id]) || 0;
  const open = (eco?.openPaths ?? []).includes(id);
  const breakthroughId = liveBreakthroughTechId(
    content?.tech_paths?.paths?.[id],
    content?.technologies,
  );
  const ready =
    !open && Boolean(breakthroughId) && threshold > 0 && score >= threshold;
  const pct = threshold > 0 ? Math.min(100, Math.round((score / threshold) * 100)) : 0;

  const breakthroughName = breakthroughId
    ? content?.technologies?.[breakthroughId]?.name ?? null
    : null;

  return {
    id,
    label: ROLE_LABELS[id],
    score,
    threshold,
    pct,
    state: open ? "open" : ready ? "ready" : "accumulating",
    breakthroughName,
  };
}

export function SpecializationStrip({
  economy,
  directions,
  compact = false,
}: {
  economy: ViewerPayload["economy"] | undefined;
  directions: TechDirectionId[];
  compact?: boolean;
}) {
  const content = getCachedContent();

  const groups = directions
    .map((direction) => ({
      direction,
      roleIds: roleScorePathsForDirection(direction, content),
    }))
    .filter((g) => g.roleIds.length > 0);

  return (
    <aside
      className={`orbit-spec-strip${compact ? " orbit-spec-strip--rail" : ""}`}
      aria-label="Специализация державы"
    >
      {!compact ? (
      <div className="orbit-spec-strip__head">
        <h4>Специализация державы</h4>
        <p className="hint">Порог прорыва — когда шкала загорается</p>
      </div>
      ) : null}
      <div className="orbit-spec-strip__list">
        {groups.map(({ direction, roleIds }) => (
          <div className="orbit-spec-group" key={direction}>
            <div
              className="orbit-spec-group__label"
              style={{ color: directionColor(direction, content) }}
            >
              {directionLabel(direction, content)}
            </div>
            {roleIds.map((id) => {
              const g = buildGauge(id, economy, content);
              const Icon = ROLE_ICONS[id];
              return (
                <div
                  className={`orbit-gauge orbit-gauge--${g.state}`}
                  key={id}
                  title={
                    g.breakthroughName
                      ? `${g.label}: ${g.score}${g.threshold ? ` / ${g.threshold}` : ""} · прорыв «${g.breakthroughName}»`
                      : `${g.label}: ${g.score}${g.threshold ? ` / ${g.threshold}` : ""}`
                  }
                >
                  <span className="orbit-gauge__icon">
                    <Icon size={14} strokeWidth={1.8} aria-hidden />
                  </span>
                  <div className="orbit-gauge__body">
                    <div className="orbit-gauge__top">
                      <span className="orbit-gauge__label">{g.label}</span>
                      <span className="orbit-gauge__val tabular-nums">
                        {g.state === "open" ? "открыт" : `${g.pct}%`}
                      </span>
                    </div>
                    <div className="orbit-gauge__track">
                      <span
                        className="orbit-gauge__fill"
                        style={{ width: `${g.state === "open" ? 100 : g.pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="hint orbit-spec-strip__empty">
            Нет активных путей специализации для открытых направлений
          </p>
        )}
      </div>
    </aside>
  );
}
