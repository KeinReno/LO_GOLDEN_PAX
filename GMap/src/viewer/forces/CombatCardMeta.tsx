import {
  cardEnergyCost,
  keywordLabel,
  keywordsForCard,
  matchupHints,
  roleLabel,
} from "../../state/cardBattleHints";

type Props = {
  role: string;
  energyCost?: number;
  bonusKeywords?: string[];
  /** Show strong/weak matchup line. */
  showMatchup?: boolean;
  compact?: boolean;
  /** Optional HP fraction 0..100 for thin bar. */
  hpPercent?: number | null;
  className?: string;
};

/**
 * Shared combat chrome for Forces UnitCard and CardBattle CardFace.
 * Keeps role / keyword / energy language identical across sections.
 */
export function CombatCardMeta({
  role,
  energyCost,
  bonusKeywords,
  showMatchup,
  compact,
  hpPercent,
  className,
}: Props) {
  const cost = energyCost ?? cardEnergyCost(role);
  const kws = keywordsForCard({ role, bonusKeywords });
  const hints = showMatchup ? matchupHints(role) : null;

  return (
    <div
      className={[
        "combat-card-meta",
        compact ? "is-compact" : "",
        className || "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hpPercent != null && (
        <div
          className="combat-card-meta__hp"
          title={`Прочность ${Math.round(hpPercent)}%`}
        >
          <div
            className="combat-card-meta__hp-fill"
            style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
          />
        </div>
      )}
      <div className="combat-card-meta__row">
        <span className="combat-card-meta__role">{roleLabel(role)}</span>
        <span className="combat-card-meta__cost" title="Энергия в card battle">
          ⚡{cost}
        </span>
      </div>
      {kws.length > 0 && (
        <div className="combat-card-meta__kws">
          {kws.map((kw) => (
            <span
              key={kw}
              className={`combat-card-meta__kw${kw === "escort" ? " is-escort" : ""}`}
              title={keywordLabel(kw)}
            >
              {keywordLabel(kw)}
            </span>
          ))}
        </div>
      )}
      {hints && (hints.strongVs.length > 0 || hints.weakVs.length > 0) && (
        <p className="combat-card-meta__matchup">
          {hints.strongVs.length > 0 && (
            <span className="is-good">
              vs {hints.strongVs.map(roleLabel).join(", ")}
            </span>
          )}
          {hints.weakVs.length > 0 && (
            <span className="is-bad">
              {" "}
              / слаб vs {hints.weakVs.map(roleLabel).join(", ")}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
