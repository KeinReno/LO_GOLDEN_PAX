import { v4 as uuid } from "uuid";
import { classifyPlanet, HABIT_LABELS } from "../state/planets";
import { getCachedContent } from "../state/contentCatalog";
import type { Planet, StarSystem } from "../state/types";
import type {
  BuildingDef,
  PlanetActionRequest,
} from "../viewer/PlayerPlanetManage";
import { PlanetRadialSlots } from "../viewer/PlanetRadialSlots";
import { applyGmPlanetAction } from "./gm/applyGmPlanetAction";

type Props = {
  system: StarSystem;
  planet: Planet;
  onBack: () => void;
  onChange: (patch: Partial<Planet>) => void;
};

function catalogBuildings(): Record<string, BuildingDef> {
  const raw = getCachedContent()?.buildings ?? {};
  return raw as Record<string, BuildingDef>;
}

/**
 * GM planet stage: same radial board as the player, local writes, no AP/tech.
 */
export function GmPlanetStage({ system, planet, onBack, onChange }: Props) {
  const habit = classifyPlanet(planet);
  const buildings = catalogBuildings();

  const onAction = (req: PlanetActionRequest) => {
    const result = applyGmPlanetAction(planet, req, {
      buildings,
      factionId: planet.ownerFactionId || system.ownerFactionId || "",
      nextId: () => uuid(),
    });
    if (result) onChange(result.planet);
  };

  return (
    <div className="gm-planet-stage">
      <div className="planet-detail-head">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← К системе
        </button>
        <span className={`habit-badge ${habit}`}>{HABIT_LABELS[habit]}</span>
      </div>
      <p className="hint gm-planet-stage__hint">
        Как у игрока: тап по пустому слоту — колода, перетащи карту — стройка.
        Плюс на кольце — грейд. ПКМ по постройке — снос.
      </p>
      <PlanetRadialSlots
        planet={planet}
        systemId={system.id}
        planetId={planet.id}
        buildings={buildings}
        stocks={{}}
        reservedAp={0}
        apMax={99}
        busy={false}
        gmFree
        onAction={onAction}
      />
    </div>
  );
}
