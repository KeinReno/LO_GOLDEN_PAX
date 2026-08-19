import { useWorldStore } from "../state/worldStore";
import { PolityEditor } from "./PolityEditor";

/** Wide dossier for state / faction editing. */
export function PolityDossier() {
  const dossierFactionId = useWorldStore((s) => s.dossierFactionId);
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const closePolityEditor = useWorldStore((s) => s.closePolityEditor);

  if (dossierFactionId == null) return null;
  if (gmShellMode !== "gm") return null;

  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => closePolityEditor()}
    >
      <div
        className="dossier-panel dossier-panel-wide"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Политика кампании</p>
            <h2>Державы и фракции</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => closePolityEditor()}
          >
            Закрыть
          </button>
        </header>
        <div className="dossier-body dossier-body-polity">
          <PolityEditor />
        </div>
      </div>
    </div>
  );
}
