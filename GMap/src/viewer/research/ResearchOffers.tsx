import { useMemo, useState, type CSSProperties } from "react";
import { Dices } from "lucide-react";
import type { TechnologyDef } from "../../state/contentCatalog";
import { getCachedContent } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import { effectiveCognitioCost } from "../../state/researchCosts";
import { renderEffect } from "../../state/EffectRenderers";
import {
  directionColor,
  directionLabel,
  groupOffersByDirection,
  listDirectionIds,
} from "../../state/techDirections";
import { techGlyph } from "./techGlyph";

function effectLine(tech: TechnologyDef): string {
  const first = (tech.effects || [])[0];
  return first ? renderEffect(first).short : "Эффект на карточке справа";
}

function OfferCard({
  tech,
  cost,
  busy,
  canBuy,
  selected,
  onSelect,
  onResearch,
}: {
  tech: TechnologyDef;
  cost: number;
  busy?: boolean;
  canBuy: boolean;
  selected: boolean;
  onSelect: () => void;
  onResearch?: (techId: string) => void;
}) {
  const glyph = techGlyph(tech);
  return (
    <li>
      <article className={`research-offers__card ${selected ? "is-on" : ""}`}>
        <button
          type="button"
          className="research-offers__pick"
          role="radio"
          aria-checked={selected}
          disabled={!!busy}
          onClick={onSelect}
        >
          <span className="research-offers__glyph" aria-hidden>
            {glyph}
          </span>
          <strong>{tech.name}</strong>
          <span className="research-offers__give">{effectLine(tech)}</span>
          <span className="tabular-nums hint">
            {cost > 0 ? `${cost} знания` : "выбрать"}
          </span>
        </button>
        {selected && onResearch ? (
          <button
            type="button"
            className={`btn sm ${canBuy ? "primary" : ""}`}
            disabled={!!busy || !canBuy}
            onClick={() => onResearch(tech.id)}
          >
            Выбрать эту
          </button>
        ) : (
          <span className="hint research-offers__pick-hint">нажмите, чтобы выбрать</span>
        )}
      </article>
    </li>
  );
}

/**
 * 3 frontier candidates per player-facing direction. Pick exactly one;
 * researching it regenerates that axis offer. Everything else on the ring
 * stays researchable at a cognitio premium.
 */
export function ResearchOffers({
  eco,
  cognitio,
  busy,
  focus,
  layout = "dock",
  selectedId,
  onResearch,
  onReroll,
  onOpenBranch,
  onSelectTech,
}: {
  eco?: ViewerPayload["economy"];
  cognitio: number;
  busy?: boolean;
  focus?: string | null;
  layout?: "dock" | "stage";
  selectedId?: string | null;
  onResearch?: (techId: string) => void;
  onReroll?: (direction: string) => void;
  onOpenBranch?: (direction: string) => void;
  onSelectTech?: (techId: string) => void;
}) {
  const [spinDir, setSpinDir] = useState<string | null>(null);
  const rows = useMemo(() => {
    const content = getCachedContent();
    const techs = content?.technologies || {};
    const grouped = groupOffersByDirection(eco?.currentOffers);
    return listDirectionIds().map((dir) => {
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
  }, [eco?.currentOffers]);

  const fireReroll = (dir: string, empty: boolean, rerolled: boolean) => {
    if (!onReroll || spinDir || rerolled) return;
    const reduced =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      onReroll(dir);
      return;
    }
    setSpinDir(dir);
    window.setTimeout(() => {
      onReroll(dir);
      setSpinDir(null);
    }, empty ? 200 : 720);
  };

  if (layout !== "stage" && !rows.some((r) => r.candidates.length > 0) && !focus) {
    return null;
  }

  if (layout === "stage") {
    return (
      <div
        className="research-offers research-offers--stage"
        aria-label="Предложения науки"
      >
        <header className="research-offers__head">
          <h4>Предложения стола</h4>
          <span className="hint">
            По каждому направлению берите <strong>одну</strong> из трёх. После
            выбора карты сменятся. Остальное на кольце — за ×1.5 знания.
          </span>
        </header>
        <ul className="research-offers__board">
          {rows.map((row) => {
            const spinning = spinDir === row.dir;
            const empty = row.candidates.length === 0;
            return (
              <li
                key={row.dir}
                className={`research-offers__row ${focus === row.dir ? "is-focus" : ""}`}
              >
                <div className="research-offers__axis">
                  <button
                    type="button"
                    className="research-offers__cat"
                    style={{ color: row.color } as CSSProperties}
                    onClick={() => onOpenBranch?.(row.dir)}
                  >
                    {row.label}
                    {!empty ? (
                      <span className="hint research-offers__one">1 из 3</span>
                    ) : null}
                  </button>
                  {onReroll ? (
                    <button
                      type="button"
                      className={`research-dice research-dice--row ${spinning ? "is-spin" : ""}`}
                      disabled={!!busy || row.rerolled || spinning}
                      title={
                        row.rerolled
                          ? "Переброс уже использован"
                          : empty
                            ? "Вытянуть предложение — затем выберите одну из трёх"
                            : "Один переброс"
                      }
                      onClick={() => fireReroll(row.dir, empty, row.rerolled)}
                    >
                      <Dices size={16} strokeWidth={1.7} aria-hidden />
                      {row.rerolled ? "Переброс ✓" : empty ? "Вытянуть" : "Переброс"}
                    </button>
                  ) : null}
                </div>
                <ul
                  className="research-offers__cards"
                  role="radiogroup"
                  aria-label={`${row.label}: выберите одну технологию`}
                >
                  {empty ? (
                    <li className="hint research-offers__empty">
                      Карт нет — направление закрыто или всё уже в кольце. Зелёные
                      узлы всё равно можно изучить (дороже).
                    </li>
                  ) : (
                    row.candidates.map((tech) => {
                      const cost = effectiveCognitioCost(tech, eco, tech.category);
                      return (
                        <OfferCard
                          key={tech.id}
                          tech={tech}
                          cost={cost}
                          busy={busy}
                          canBuy={cognitio >= cost}
                          selected={selectedId === tech.id}
                          onSelect={() => {
                            onOpenBranch?.(row.dir);
                            onSelectTech?.(tech.id);
                          }}
                          onResearch={onResearch}
                        />
                      );
                    })
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const dockRows = focus ? rows.filter((r) => r.dir === focus) : rows;

  return (
    <div className="research-offers research-offers--dock" aria-label="Предложение науки">
      <header className="research-offers__head">
        <h4>Предложение науки</h4>
        <span className="hint">1 из 3 на направление · иначе ×1.5</span>
      </header>
      <ul className="research-offers__list">
        {dockRows.map((row) => (
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
                  className={`btn sm ${spinDir === row.dir ? "is-spin" : ""}`}
                  disabled={!!busy || row.rerolled || spinDir != null}
                  onClick={() =>
                    fireReroll(row.dir, row.candidates.length === 0, row.rerolled)
                  }
                >
                  <Dices size={14} strokeWidth={1.8} aria-hidden />
                  {row.rerolled ? "Переброс ✓" : "Переброс"}
                </button>
              ) : null}
            </div>
            <ul className="research-offers__cards" role="radiogroup" aria-label={`${row.label}: выберите одну`}>
              {row.candidates.length === 0 ? (
                <li className="hint">Нет кандидатов</li>
              ) : (
                row.candidates.map((tech) => {
                  const cost = effectiveCognitioCost(tech, eco, tech.category);
                  return (
                    <OfferCard
                      key={tech.id}
                      tech={tech}
                      cost={cost}
                      busy={busy}
                      canBuy={cognitio >= cost}
                      selected={selectedId === tech.id}
                      onSelect={() => {
                        onOpenBranch?.(row.dir);
                        onSelectTech?.(tech.id);
                      }}
                      onResearch={onResearch}
                    />
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
