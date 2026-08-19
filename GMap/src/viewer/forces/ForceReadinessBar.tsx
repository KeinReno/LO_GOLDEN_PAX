import { Crosshair, Swords } from "lucide-react";
import type { DeckBattlePreview, ForceEngagementHit, ForceUpkeep } from "../../state/forceReadiness";
import { formatUpkeepShort } from "../../state/forceReadiness";

type Props = {
  preview: DeckBattlePreview;
  upkeep: ForceUpkeep;
  engagements?: ForceEngagementHit[];
  onOpenEngagement?: (engagementId: string) => void;
  onOpenCardBattle?: (engagementId: string) => void;
  compact?: boolean;
};

export function ForceReadinessBar({
  preview,
  upkeep,
  engagements = [],
  onOpenEngagement,
  onOpenCardBattle,
  compact,
}: Props) {
  const eng = engagements[0];
  const isCard = eng?.mode === "card";

  return (
    <div
      className={`forces-readiness${compact ? " is-compact" : ""}`}
      aria-label="Боевая готовность"
    >
      <div className="forces-readiness-roles" role="list">
        {preview.roles.length === 0 ? (
          <span className="hint">Состав пуст</span>
        ) : (
          preview.roles.map((r) => (
            <span
              key={r.role}
              className="forces-role-chip"
              role="listitem"
              title={
                r.keywordLabel
                  ? `${r.label} · ${r.keywordLabel} · энергия ${r.energyCost}`
                  : `${r.label} · энергия ${r.energyCost}`
              }
            >
              <strong>{r.label}</strong>
              <span>×{r.count}</span>
              {r.keywordLabel ? (
                <span className="forces-role-kw">{r.keywordLabel}</span>
              ) : null}
            </span>
          ))
        )}
      </div>

      <div className="forces-readiness-meta">
        <span className="forces-readiness-deck" title="Превью: порядок в колоде Сил = приоритет руки">
          <Swords size={12} aria-hidden />
          Колода {preview.cardCount}
          {preview.heavyCards > 0 ? ` · тяжёлых ${preview.heavyCards}` : ""}
        </span>
        <span className="forces-readiness-upkeep" title="Содержание / ход">
          {formatUpkeepShort(upkeep)}
        </span>
      </div>

      {eng && (
        <div className="forces-readiness-battle">
          <span className="forces-battle-badge">В БОЮ</span>
          <span className="hint">
            {eng.theater}
            {eng.cardBattleOffer && !isCard ? " · можно карты" : ""}
            {isCard ? " · карточный стол" : ""}
          </span>
          {isCard && onOpenCardBattle ? (
            <button
              type="button"
              className="btn"
              onClick={() => onOpenCardBattle(eng.id)}
            >
              <Crosshair size={14} aria-hidden /> Открыть стол
            </button>
          ) : onOpenEngagement ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenEngagement(eng.id)}
            >
              К бою
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
