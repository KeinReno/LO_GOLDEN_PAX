import { v4 as uuid } from "uuid";
import { classifyPlanet, HABIT_LABELS } from "../state/planets";
import { getCachedContent } from "../state/contentCatalog";
import { patchFromCatalogDef } from "../state/gmCatalogBuildings";
import type { Planet, PlanetBuilding, StarSystem } from "../state/types";
import type {
  BuildingDef,
  PlanetActionRequest,
} from "../viewer/PlayerPlanetManage";
import { PlanetRadialSlots } from "../viewer/PlanetRadialSlots";
import {
  MAX_PLANET_GRADE,
  orbitalSlotsForGrade,
  planetOrbitalGrade,
  planetSurfaceGrade,
  surfaceSlotsForGrade,
} from "../state/planetGrade";

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

function dropBuilding(list: PlanetBuilding[], id: string): PlanetBuilding[] {
  return list.filter((b) => b.id !== id);
}

/**
 * GM planet stage: same radial board as the player, local writes, no AP/tech.
 */
export function GmPlanetStage({ system, planet, onBack, onChange }: Props) {
  const habit = classifyPlanet(planet);
  const buildings = catalogBuildings();
  const surface = planet.surfaceBuildings ?? [];
  const orbital = planet.orbitalBuildings ?? [];
  const surfaceMax = planet.surfaceSlots ?? 8;
  const orbitalMax = planet.orbitalSlots ?? 4;

  const onAction = (req: PlanetActionRequest) => {
    if (req.action === "demolish" && req.instanceId) {
      const id = req.instanceId;
      onChange({
        surfaceBuildings: dropBuilding(surface, id),
        orbitalBuildings: dropBuilding(orbital, id),
      });
      return;
    }
    if (req.action === "rename" && req.name) {
      onChange({ name: req.name });
      return;
    }
    if (req.action === "upgrade_grade") {
      if (req.zone === "orbital") {
        const g = planetOrbitalGrade(planet);
        if (g >= MAX_PLANET_GRADE) return;
        const next = g + 1;
        onChange({
          orbitalGrade: next,
          orbitalSlots: orbitalSlotsForGrade(next),
        });
        return;
      }
      const g = planetSurfaceGrade(planet);
      if (g >= MAX_PLANET_GRADE) return;
      const next = g + 1;
      onChange({
        grade: next,
        surfaceSlots: surfaceSlotsForGrade(next),
      });
      return;
    }
    if (req.action !== "build" || !req.buildingId) return;
    const def = buildings[req.buildingId];
    if (!def) return;
    const orbitalZone = def.zone === "orbital";
    const list = orbitalZone ? orbital : surface;
    const max = orbitalZone ? orbitalMax : surfaceMax;
    if (list.length >= max) return;
    const next: PlanetBuilding = {
      id: uuid(),
      ...patchFromCatalogDef({
        id: def.id,
        name: def.name,
        kind: def.kind,
        zone: def.zone,
      }),
    };
    if (orbitalZone) {
      onChange({
        orbitalBuildings: [...list, next],
      });
    } else {
      onChange({
        surfaceBuildings: [...list, next],
      });
    }
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
