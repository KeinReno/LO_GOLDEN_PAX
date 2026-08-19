import { createPortal } from "react-dom";
import { useWorldStore } from "../state/worldStore";
import type { StarSystem } from "../state/types";
import { SystemView, type PlayerPlanetManageProps } from "./SystemView";
import { useGmSystemDive } from "./gm/useGmSystemDive";

export type PlayerSystemActions = {
  factionId: string;
  onClaim: (systemId: string) => void;
  onAttack: (systemId: string) => void;
  onOpenRp: () => void;
  onSelectOwnFleet?: (fleetId: string) => void;
  onSelectOwnLegion?: (legionId: string) => void;
};

/** Full-screen system drill-down (double-click / ПКМ → открыть систему). */
export function SystemDossier({
  readOnly = false,
  playerActions,
  planetManage,
  onClose,
}: {
  readOnly?: boolean;
  playerActions?: PlayerSystemActions;
  planetManage?: PlayerPlanetManageProps;
  /** When set, overrides store close (e.g. player help overlay). */
  onClose?: () => void;
}) {
  const dossierSystemId = useWorldStore((s) => s.dossierSystemId);
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const close = onClose ?? closeSystemView;
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.dossierSystemId),
  );
  const faction = useWorldStore((s) => {
    const sys = s.world.systems.find((sys) => sys.id === s.dossierSystemId);
    const id = sys?.ownerFactionId || s.activeFactionId;
    return s.world.factions.find((f) => f.id === id);
  });

  if (gmShellMode !== "gm") return null;
  if (!dossierSystemId || !system) return null;

  return createPortal(
      <SystemDossierBody
      system={system}
      factionId={faction?.id ?? playerActions?.factionId ?? ""}
      defaultCultureId={faction?.defaultCultureId}
      primaryFaith={faction?.primaryFaith}
      readOnly={readOnly}
      playerActions={playerActions}
      planetManage={planetManage}
      onClose={close}
    />,
    document.body,
  );
}

function SystemDossierBody({
  system,
  factionId,
  defaultCultureId,
  primaryFaith,
  readOnly,
  playerActions,
  planetManage: planetManageProp,
  onClose,
}: {
  system: StarSystem;
  factionId: string;
  defaultCultureId?: string;
  primaryFaith?: string;
  readOnly: boolean;
  playerActions?: PlayerSystemActions;
  planetManage?: PlayerPlanetManageProps;
  onClose: () => void;
}) {
  const dive = useGmSystemDive(system);
  const playAs = dive.factionId || factionId;
  const eco = dive.play.payload.economy;
  const gmPlay = !readOnly && !!playAs;

  const planetManage: PlayerPlanetManageProps | undefined = gmPlay
    ? {
        factionId: playAs,
        stocks: eco?.stocks ?? {},
        reservedAp: 0,
        apMax: 99,
        buildings: dive.catalogs.buildings,
        colonies: dive.catalogs.colonies,
        mapResources: dive.catalogs.mapResources,
        techEco: {
          techTiers: eco?.techTiers,
          unlockedProperties: eco?.unlockedProperties,
          unlockedLineages: eco?.unlockedLineages,
          roleScores: eco?.roleScores,
        },
        defaultCultureId: defaultCultureId ?? "culture.baseline",
        primaryFaith: primaryFaith ?? "faith.secular",
        unlockedLineages: eco?.unlockedLineages ?? [],
        message: dive.message,
        onAction: dive.onPlanetAction,
        godMode: true,
      }
    : planetManageProp;

  const ownedByOther =
    !!system.ownerFactionId &&
    !!playerActions &&
    system.ownerFactionId !== playerActions.factionId;

  const node = (
    <div className="gm-system-layer" role="region" aria-label={system.name}>
      <div className="viewer-system-body gm-system-layer__body">
        <SystemView
          system={system}
          readOnly={readOnly}
          playerFactionId={playAs || playerActions?.factionId}
          onSelectOwnFleet={playerActions?.onSelectOwnFleet}
          onSelectOwnLegion={playerActions?.onSelectOwnLegion}
          planetManage={planetManage}
          systemManage={
            gmPlay
              ? {
                  factionId: playAs,
                  stocks: eco?.stocks ?? {},
                  reservedAp: 0,
                  apMax: 99,
                  unlockedProperties: eco?.unlockedProperties,
                  ships: dive.catalogs.ships,
                  units: dive.catalogs.units,
                  mapResourceNames: dive.catalogs.mapResourceNames,
                  message: dive.message,
                  onAction: dive.onSystemAction,
                  buildings: dive.catalogs.buildings,
                  gmFree: true,
                }
              : undefined
          }
        />
      </div>
      {readOnly && playerActions && (
        <footer className="dossier-player-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              onClose();
              playerActions.onClaim(system.id);
            }}
          >
            Захват
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!ownedByOther}
            title={
              ownedByOther ? "Атаковать систему" : "Нет чужого владельца"
            }
            onClick={() => {
              onClose();
              playerActions.onAttack(system.id);
            }}
          >
            Атака
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onClose();
              playerActions.onOpenRp();
            }}
          >
            Сцена с ГМом
          </button>
        </footer>
      )}
    </div>
  );

  return node;
}
