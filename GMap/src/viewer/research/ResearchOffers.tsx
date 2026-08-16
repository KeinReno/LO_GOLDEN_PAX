import { useMemo } from "react";
import type { TechnologyDef } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import { effectiveCognitioCost } from "../../state/researchCosts";
import {
  directionColor,
  directionLabel,
  groupOffersByDirection,
  listDirectionIds,
} from "../../state/techDirections";

/**
 * 3 frontier candidates per player-facing direction.
 * Everything else in the catalog is still researchable at a cognitio premium.
 */
export function ResearchOffers({
  eco,
  cognitio,
  busy,
  focus,
  onResearch,
  onReroll,
  onOpenBranch,
}: {
  eco?: ViewerPayload["economy"];
  cognitio: number;
  busy?: boolean;
  focus?: string | null;
  onResearch?: (techId: string) => void;
  onReroll?: (direction: string) => void;
  onOpenBranch?: (direction: string) => void;
}) {
  const rows = useMemo(() => {
    const content = getCachedContent();
    const techs = content?.technologies || {};
    const grouped = groupOffersByDirection(eco?.currentOffers);
    const axes = focus ? [focus] : listDirectionIds().filter((d) => grouped[d]);
    const list = axes.length ? axes : listDirectionIds();
    return list.map((dir) => {
      const offer = grouped[dir];
      const candidates = (offer?.candidates || [])
        .map((id) => techs[id])
        .filter((d): d is TechnologyDef => Boolean(d?.id));
      return {
        dir,
        label: directionLabel(dir),
        color: directionColor(dir),
        candidates,
        rerolled: Boolean(offer?.rerolled),
      };
    });
  }, [eco?.currentOffers, focus]);

  if (!rows.some((r) => r.candidates.length > 0) && !focus) return null;

  return (
    <div className="research-offers research-offers--dock" aria-label="Предложение науки">
      <header className="research-offers__head">
        <h4>Предложение науки</h4>
        <span className="hint">3 на направление · вне оффера ×1.5</span>
      </header>
      <ul className="research-offers__list">
        {rows.map((row) => (
          <li key={row.dir} className="research-offers__row">
            <div className="research-offers__axis">
              <button
                type="button"
                className="research-offers__cat"
                style={{ color: row.color }}
                onClick={() => onOpenBranch?.(row.dir)}
              >
                {row.label}
              </button>
              {onReroll ? (
                <button
                  type="button"
                  className="btn sm"
                  disabled={!!busy || row.rerolled || row.candidates.length === 0}
                  title={
                    row.rerolled
                      ? "Переброс уже использован"
                      : "Один переброс на это предложение"
                  }
                  onClick={() => onReroll(row.dir)}
                >
                  {row.rerolled ? "Переброс ✓" : "Переброс"}
                </button>
              ) : null}
            </div>
            <ul className="research-offers__cards">
              {row.candidates.length === 0 ? (
                <li className="hint">Нет кандидатов</li>
              ) : (
                row.candidates.map((tech) => {
                  const cost = effectiveCognitioCost(tech, eco, tech.category);
                  return (
                    <li key={tech.id}>
                      <button
                        type="button"
                        className="research-offers__card"
                        disabled={!!busy || !onResearch || cognitio < cost}
                        title={tech.flavor || tech.name}
                        onClick={() => onResearch?.(tech.id)}
                      >
                        <strong>{tech.name}</strong>
                        <span className="tabular-nums hint">
                          {cost > 0 ? `${cost} знания` : "изучить"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
