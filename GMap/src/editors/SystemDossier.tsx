import { useWorldStore } from "../state/worldStore";
import { SystemView } from "./SystemView";

/** Full-screen system drill-down (double-click / ПКМ → открыть систему). */
export function SystemDossier() {
  const dossierSystemId = useWorldStore((s) => s.dossierSystemId);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.dossierSystemId),
  );

  if (!dossierSystemId || !system) return null;

  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => closeSystemView()}
    >
      <div
        className="dossier-panel dossier-panel-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Галактика → система → планета</p>
            <h2>{system.name}</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => closeSystemView()}
          >
            На галактику
          </button>
        </header>
        <div className="dossier-body">
          <SystemView system={system} />
        </div>
      </div>
    </div>
  );
}
