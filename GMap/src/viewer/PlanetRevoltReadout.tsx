import type { Planet } from "../state/types";
import { computePlanetRevoltReadout } from "../state/stabilityRevolt";

export function PlanetRevoltReadout({
  planet,
  currentTurn = 0,
  compact = false,
  className = "",
}: {
  planet: Planet;
  currentTurn?: number;
  compact?: boolean;
  className?: string;
}) {
  const data = computePlanetRevoltReadout(planet, currentTurn);

  return (
    <div
      className={`planet-revolt-readout planet-revolt-readout--${data.tone} ${compact ? "planet-revolt-readout--compact" : ""} ${className}`.trim()}
      role="region"
      aria-label="Сводка стабильности и восстания"
    >
      <div
        className="planet-revolt-readout__metric"
        title="Уровень стабильности планеты (0–100)"
      >
        <span className="hint">Стабильность</span>
        <strong className="mono">{data.stability}/100</strong>
      </div>
      <div
        className="planet-revolt-readout__metric"
        title={`Стадия бунта: ${data.stage} (${data.stageName})`}
      >
        <span className="hint">Стадия</span>
        <strong>
          {data.stage} · {data.stageName}
        </strong>
      </div>
      <div
        className="planet-revolt-readout__metric"
        title="Штраф к производству колонии"
      >
        <span className="hint">Производство</span>
        <strong
          className={data.productionPenaltyPercent > 0 ? "warn-text" : ""}
        >
          {data.productionPenaltyLabel}
          {data.productionMult < 1 && data.productionMult > 0
            ? ` (×${data.productionMult})`
            : ""}
        </strong>
      </div>
      {data.stage === 2 && data.turnsToSecession != null && (
        <div
          className="planet-revolt-readout__metric planet-revolt-readout__secession"
          title="Ходов до сецессии (отделения планеты в мятежную фракцию)"
        >
          <span className="hint">До отделения</span>
          <strong className="bad-text mono">
            {data.turnsToSecession === 0
              ? "0 ходов (сецессия)"
              : `${data.turnsToSecession} ${
                  data.turnsToSecession === 1
                    ? "ход"
                    : data.turnsToSecession < 5
                      ? "хода"
                      : "ходов"
                }`}
          </strong>
        </div>
      )}
    </div>
  );
}
