import { useCallback, useMemo, useState } from "react";
import { v4 as uuid } from "uuid";
import { useWorldStore } from "../../state/worldStore";
import type { StarSystem } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import { catalogsFromContent } from "../../viewer/hooks/viewerContentCatalogs";
import type { PlanetActionRequest } from "../../viewer/PlayerPlanetManage";
import type { SystemActionRequest } from "../../viewer/SystemCommandPanel";
import { useGmFactionPlay } from "./useGmFactionPlay";
import { applyGmPlanetAction } from "./applyGmPlanetAction";
import { applyGmSystemAction } from "./applyGmSystemAction";

function resourceNames(
  map: Record<string, { name?: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, def] of Object.entries(map ?? {})) {
    if (def?.name) out[id] = def.name;
  }
  return out;
}

export function useGmSystemDive(system: StarSystem) {
  const world = useWorldStore((s) => s.world);
  const activeFactionId = useWorldStore((s) => s.activeFactionId);
  const updatePlanet = useWorldStore((s) => s.updatePlanet);
  const updateSelectedSystem = useWorldStore((s) => s.updateSelectedSystem);
  const factionId =
    system.ownerFactionId ||
    activeFactionId ||
    world.factions[0]?.id ||
    "";
  const play = useGmFactionPlay(factionId);
  const [message, setMessage] = useState<string | null>(null);

  const catalogs = useMemo(
    () => catalogsFromContent(getCachedContent()),
    [world.meta.tableRevision],
  );
  const buildings = catalogs?.buildingsCatalog ?? {};
  const colonies = catalogs?.coloniesCatalog ?? {};
  const ships = catalogs?.shipsCatalog ?? {};
  const units = catalogs?.unitsCatalog ?? {};
  const mapResources = catalogs?.mapResourcesCatalog;
  const mapResourceNames = useMemo(
    () => resourceNames(mapResources),
    [mapResources],
  );

  const onPlanetAction = useCallback(
    (req: PlanetActionRequest) => {
      const planet = system.planets.find((p) => p.id === req.planetId);
      if (!planet || !factionId) return;
      const source = req.sourcePlanetId
        ? world.systems
            .flatMap((s) => s.planets)
            .find((p) => p.id === req.sourcePlanetId)
        : null;
      const result = applyGmPlanetAction(planet, req, {
        buildings,
        factionId,
        nextId: () => uuid(),
        sourcePlanet: source,
      });
      if (!result) {
        setMessage("Нельзя применить");
        return;
      }
      updatePlanet(planet.id, result.planet);
      if (result.source) {
        updatePlanet(result.source.planetId, result.source.patch);
      }
      setMessage(null);
    },
    [system.planets, factionId, world.systems, buildings, updatePlanet],
  );

  const onSystemAction = useCallback(
    (req: SystemActionRequest) => {
      if (!factionId) return;
      const patch = applyGmSystemAction(system, req, {
        factionId,
        nextId: () => uuid(),
      });
      if (patch) {
        updateSelectedSystem(patch);
        setMessage(null);
        return;
      }
      if (req.action === "produce_ship" || req.action === "produce_unit") {
        setMessage("Найм кораблей и войск — в комнате Силы этой державы.");
      }
    },
    [system, factionId, updateSelectedSystem],
  );

  return {
    factionId,
    play,
    catalogs: {
      buildings,
      colonies,
      ships,
      units,
      mapResources,
      mapResourceNames,
    },
    message: message ?? play.loadError,
    onPlanetAction,
    onSystemAction,
  };
}
