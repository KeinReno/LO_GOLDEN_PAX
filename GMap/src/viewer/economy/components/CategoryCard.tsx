import type { CSSProperties } from "react";
import { fmtInt } from "../../../state/numberFormat";
import { useSpotlight } from "../../../ui/aceternityFx";
import type { CategorySnapshot } from "../economyMath";
import { StatusChip } from "../../shared/StatusChip";
import { Sparkline } from "./Sparkline";
import { EcoTip } from "./EcoTip";
import { NumberTicker } from "./NumberTicker";

type Props = {
  cat: CategorySnapshot;
  sparkValues?: number[];
  onSelect?: (letter: string) => void;
};

export function CategoryCard({ cat, sparkValues, onSelect }: Props) {
  /** Spotlight only on deficit — keep ≤2 heavy glows in the panel. */
  const useGlow = cat.status === "deficit";
  const spot = useSpotlight();
  const tip = (
    <>
      <strong>
        {cat.letter} · {cat.name}
      </strong>
      <div>Запас {fmtInt(cat.stock)}</div>
      {cat.net != null && (
        <div>
          {cat.net > 0 ? "+" : ""}
          {fmtInt(cat.net)}/ход
        </div>
      )}
      {cat.bottleneckDeficit > 0 && (
        <div>Узкое место −{fmtInt(cat.bottleneckDeficit)}</div>
      )}
    </>
  );

  return (
    <EcoTip content={tip}>
      <button
        type="button"
        className={[
          "eco-category-card",
          `eco-category-card--${cat.status}`,
          useGlow ? "fx-spotlight" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={
          {
            "--eco-card-accent": cat.cssVar,
            "--fx-spot-color": cat.cssVar,
          } as CSSProperties
        }
        {...(useGlow ? spot.bind : {})}
        onClick={() => onSelect?.(cat.letter)}
      >
        <header className="eco-category-card__head">
          <span className="eco-category-card__letter" aria-hidden>
            {cat.letter}
          </span>
          <span className="eco-category-card__name">{cat.name}</span>
          <StatusChip
            status={cat.status}
            className="eco-category-card__status"
          />
        </header>
        <div className="eco-category-card__body">
          <strong className="eco-category-card__stock tabular-nums">
            <NumberTicker value={cat.stock} />
          </strong>
          {sparkValues && sparkValues.length > 1 && (
            <Sparkline
              values={sparkValues}
              stroke="var(--eco-card-accent)"
              width={64}
              height={20}
            />
          )}
        </div>
        {cat.net != null && cat.net !== 0 && (
          <span
            className={`eco-category-card__net tabular-nums ${
              cat.net > 0 ? "is-up" : "is-down"
            }`}
          >
            {cat.net > 0 ? `+${fmtInt(cat.net)}` : fmtInt(cat.net)}/ход
          </span>
        )}
        {cat.bottleneckDeficit > 0 && (
          <span className="eco-category-card__bn hint">
            узкое место −{fmtInt(cat.bottleneckDeficit)}
          </span>
        )}
      </button>
    </EcoTip>
  );
}
