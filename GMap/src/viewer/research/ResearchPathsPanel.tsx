import { useMemo, type CSSProperties } from "react";
import type { ViewerPayload } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import { fmtInt } from "../../state/numberFormat";

/**
 * RoleScore path rows + Прорыв. Extracted from the retired radial overview.
 */
export function ResearchPathsPanel({
  eco,
  cognitio,
  busy,
  factionId,
  world,
  onResearch,
}: {
  eco?: ViewerPayload["economy"];
  cognitio: number;
  busy?: boolean;
  factionId?: string;
  world?: ViewerPayload["world"];
  onResearch?: (techId: string) => void;
}) {
  const pathRows = useMemo(() => {
    const content = getCachedContent();
    const paths = content?.tech_paths?.paths || {};
    const ms = content?.role_milestones;
    const schemaTh =
      content?.economy_schema?.role_score_pilot?.thresholds || {};
    const open = new Set(eco?.openPaths || []);
    const scores = eco?.roleScores || {};
    const fac = world?.factions?.find((f) => f.id === factionId) as
      | { primaryRaceId?: string; primaryRace?: string; raceId?: string }
      | undefined;
    const raceRaw =
      fac?.primaryRaceId || fac?.primaryRace || fac?.raceId || null;
    const raceId = raceRaw
      ? String(raceRaw).startsWith("race_")
        ? String(raceRaw)
        : `race_${String(raceRaw).replace(/^race\./, "")}`
      : null;
    const affinityTable =
      (content?.tech_paths as { raceAffinity?: Record<string, Record<string, number>> })
        ?.raceAffinity || {};
    return Object.values(paths).map((p) => {
      const key = p.roleScoreKey || p.id;
      const score = Number(scores[key as keyof typeof scores]) || 0;
      const threshold =
        Number(
          (ms as Record<string, { threshold?: number }> | undefined)?.[key]
            ?.threshold,
        ) ||
        Number(schemaTh[key]) ||
        0;
      const isOpen = open.has(p.id);
      const techId = p.breakthroughTechId || null;
      let techCost = techId
        ? Number(
            content?.technologies?.[techId]?.cost?.["currency.cognitio"] || 0,
          )
        : 0;
      const aff = Number(raceId && affinityTable[raceId]?.[p.id]);
      const affinityMult =
        Number.isFinite(aff) && aff > 0 && aff !== 1 ? aff : 1;
      if (techCost > 0 && affinityMult !== 1) {
        techCost = Math.max(1, Math.ceil(techCost * affinityMult));
      }
      const ready = !isOpen && threshold > 0 && score >= threshold;
      return {
        id: p.id,
        label: p.label,
        description: p.description || "",
        score,
        threshold,
        isOpen,
        ready,
        techId,
        techCost,
        affinityMult,
        pct:
          threshold > 0
            ? Math.min(100, Math.round((score / threshold) * 100))
            : isOpen
              ? 100
              : 0,
      };
    });
  }, [eco?.openPaths, eco?.roleScores, factionId, world?.factions]);

  if (pathRows.length === 0) return null;

  return (
    <div className="research-paths" aria-label="Пути развития">
      <header className="research-paths__head">
        <h4>Пути развития</h4>
        <span className="hint">пилот · RoleScore + Прорыв</span>
      </header>
      <ul className="research-paths__list">
        {pathRows.map((row) => (
          <li
            key={row.id}
            className={`research-paths__item${row.isOpen ? " is-open" : ""}${row.ready ? " is-ready" : ""}`}
          >
            <div className="research-paths__meta">
              <strong>{row.label}</strong>
              <span className="hint">{row.description}</span>
              <span className="tabular-nums research-paths__score">
                {fmtInt(row.score)}
                {row.threshold > 0 ? ` / ${fmtInt(row.threshold)}` : ""}
                {row.isOpen ? " · открыт" : ` · ${row.pct}%`}
                {row.affinityMult !== 1
                  ? ` · аффинити ×${row.affinityMult}`
                  : ""}
              </span>
              <span
                className="research-paths__bar"
                style={{ "--rp-pct": `${row.pct}%` } as CSSProperties}
                aria-hidden
              />
            </div>
            {row.isOpen ? (
              <span className="research-paths__badge">Открыт</span>
            ) : (
              <button
                type="button"
                className="btn sm primary"
                disabled={
                  !!busy ||
                  !row.ready ||
                  !row.techId ||
                  !onResearch ||
                  (row.techCost > 0 && cognitio < row.techCost)
                }
                title={
                  row.ready
                    ? row.techCost > cognitio
                      ? `Нужно ${row.techCost} знания`
                      : "Совершить Прорыв"
                    : "Накопите RoleScore"
                }
                onClick={() => row.techId && onResearch?.(row.techId)}
              >
                Прорыв
                {row.techCost > 0 ? (
                  <span className="tabular-nums"> · {row.techCost}</span>
                ) : null}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
