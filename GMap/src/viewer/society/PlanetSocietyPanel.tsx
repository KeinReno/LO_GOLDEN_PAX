import type { Planet } from "../../state/types";
import {
  cultureLabel,
  faithLabel,
  resolveResourceOrCurrencyLabel,
} from "../../state/displayLabels";
import { getCulture } from "../../state/societyRegistry";
import { hybridCandidatesForPlanet } from "../../state/hybridClient";
import { getCachedContent } from "../../state/contentCatalog";
import { HoldRevealButton } from "../../ui/HoldRevealButton";

type Props = {
  planet: Planet;
  managed: boolean;
  busy?: boolean;
  apLeft: number;
  defaultCultureId?: string;
  primaryFaith?: string;
  unlockedLineages?: string[];
  onFoundHybrid?: (raceA: string, raceB: string) => void;
};

function faithSummary(planet: Planet, primaryFaith: string): string {
  const rows = planet.faithShare?.length
    ? planet.faithShare
    : [{ faithId: primaryFaith, percent: 100 }];
  return rows
    .filter((r) => (r.percent ?? 0) > 0)
    .map((r) => {
      const name = faithLabel(r.faithId);
      return `${name} ${Math.round(r.percent ?? 0)}%`;
    })
    .join(" · ");
}

export function PlanetSocietyPanel({
  planet,
  managed,
  busy,
  apLeft,
  defaultCultureId = "culture.baseline",
  primaryFaith = "faith.secular",
  unlockedLineages = [],
  onFoundHybrid,
}: Props) {
  const cultureId = planet.cultureId ?? defaultCultureId;
  const culture = getCulture(cultureId);
  const minShare =
    getCachedContent()?.hybrid_rules?.minParentSharePercent ?? 35;
  const cost = getCachedContent()?.hybrid_rules?.foundLineageCost ?? {
    "currency.cognitio": 40,
    "currency.bios": 8,
  };
  const candidates = hybridCandidatesForPlanet(
    planet.raceComposition ?? [],
    minShare,
  );
  const lineageOnPlanet = planet.lineageId;
  const lineageName = lineageOnPlanet
    ? (getCachedContent()?.races?.[lineageOnPlanet]?.name ?? lineageOnPlanet)
    : null;

  return (
    <section className="planet-manage-block planet-society" aria-label="Общество">
      <h4>Культура и вера</h4>
      <div className="planet-society-chips">
        <span className="planet-society-chip" title={cultureLabel(cultureId)}>
          <span className="planet-society-chip__label">Культура</span>
          <strong>{culture?.name ?? cultureLabel(cultureId)}</strong>
        </span>
        <span className="planet-society-chip">
          <span className="planet-society-chip__label">Вера</span>
          <strong>{faithSummary(planet, primaryFaith)}</strong>
        </span>
        {lineageName && (
          <span className="planet-society-chip planet-society-chip--hybrid">
            <span className="planet-society-chip__label">Линейдж</span>
            <strong>{lineageName}</strong>
          </span>
        )}
      </div>

      {managed && onFoundHybrid && candidates.length > 0 && (
        <>
          <p className="hint">
            Смешанная колония: зажми, чтобы основать линейдж (2 AP,{" "}
            {resolveResourceOrCurrencyLabel("currency.cognitio")} +{" "}
            {resolveResourceOrCurrencyLabel("currency.bios")}). Нужно ≥{minShare}
            % каждой расы на планете.
          </p>
          <ul className="planet-society-hybrid-list">
            {candidates.map((c) => {
              const unlocked = unlockedLineages.includes(c.lineageId);
              const races = getCachedContent()?.races ?? {};
              const label = `${races[c.raceA]?.name ?? c.raceA} + ${races[c.raceB]?.name ?? c.raceB}`;
              return (
                <li key={c.lineageId}>
                  <HoldRevealButton
                    className="btn ghost planet-society-hybrid-btn"
                    disabled={
                      busy ||
                      !c.ready ||
                      apLeft < 2 ||
                      unlocked
                    }
                    holdMs={900}
                    title={
                      unlocked
                        ? "Линейдж уже открыт империей"
                        : `→ ${c.lineageName}. ${label} (${c.shareA}% / ${c.shareB}%)`
                    }
                    onHoldComplete={() =>
                      onFoundHybrid(c.raceA, c.raceB)
                    }
                  >
                    <strong>{c.lineageName}</strong>
                    <span className="hint">
                      {label} · {cost["currency.cognitio"] ?? 40}{" "}
                      {resolveResourceOrCurrencyLabel("currency.cognitio")} ·{" "}
                      {cost["currency.bios"] ?? 8}{" "}
                      {resolveResourceOrCurrencyLabel("currency.bios")} · 2 AP
                      {unlocked ? " · открыт" : ""}
                    </span>
                  </HoldRevealButton>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
