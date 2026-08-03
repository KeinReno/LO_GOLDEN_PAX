import { createPortal } from "react-dom";
import { useWorldStore } from "../state/worldStore";
import { SystemView, type PlayerPlanetManageProps } from "./SystemView";

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
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const close = onClose ?? closeSystemView;
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.dossierSystemId),
  );

  if (!dossierSystemId || !system) return null;

  const ownedByOther =
    !!system.ownerFactionId &&
    !!playerActions &&
    system.ownerFactionId !== playerActions.factionId;

  const node = (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => close()}
    >
      <div
        className="dossier-panel dossier-panel-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">
              {readOnly
                ? "Карта → система → планета"
                : "Галактика → система → планета"}
            </p>
            <h2>{system.name}</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => close()}
          >
            На карту
          </button>
        </header>
        <div className="dossier-body">
          <SystemView
            system={system}
            readOnly={readOnly}
            playerFactionId={playerActions?.factionId}
            onSelectOwnFleet={playerActions?.onSelectOwnFleet}
            onSelectOwnLegion={playerActions?.onSelectOwnLegion}
            planetManage={planetManage}
          />
        </div>
        {readOnly && playerActions && (
          <footer className="dossier-player-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                close();
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
                ownedByOther
                  ? "Атаковать систему"
                  : "Нет чужого владельца"
              }
              onClick={() => {
                close();
                playerActions.onAttack(system.id);
              }}
            >
              Атака
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                close();
                playerActions.onOpenRp();
              }}
            >
              Сцена с ГМом
            </button>
          </footer>
        )}
      </div>
    </div>
  );

  // Portal out of map stacking context so mobile dock / topbar stay under.
  if (typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}
