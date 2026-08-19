import { FloatingPanel } from "../../ui/FloatingPanel";
import { useWorldStore } from "../../state/worldStore";
import { GmLedgerPanel } from "../GmLedgerPanel";
import { CombatPanel } from "../CombatPanel";
import { GmOpsPanel } from "../GmOpsPanel";
import { GmSystemsPanel } from "../GmSystemsPanel";
import { OpsHealthPanel } from "../OpsHealthPanel";
import {
  GmIntelPanel,
  GmSciencePanel,
} from "./GmSciencePanel";
import { GmCourtPanel } from "./GmCourtPanel";
import { domainById, domainHotkeyLabel } from "./gmDomains";
import type { GmLiveDomainId } from "../../state/types";

function DiploWorkbench() {
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  return (
    <div className="gm-domain-body">
      <p className="hint">
        Столкновения на карте. Дипломатия — отдельный стол (меню «Стол…»).
      </p>
      <div className="gmsys-row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDiplomacyPanelOpen(true)}
        >
          Открыть дипло-стол
        </button>
      </div>
      <CombatPanel />
    </div>
  );
}

function DomainBody({ id }: { id: GmLiveDomainId }) {
  switch (id) {
    case "economy":
      return <GmLedgerPanel />;
    case "science":
      return <GmSciencePanel />;
    case "court":
      return <GmCourtPanel />;
    case "diplo":
      return <DiploWorkbench />;
    case "intel":
      return <GmIntelPanel />;
    case "quests":
      return <GmSystemsPanel hideChrome />;
    case "ops":
      return <GmOpsPanel />;
    case "health":
      return <OpsHealthPanel />;
    default:
      return <p className="hint">Домен без workbench.</p>;
  }
}

export function GmWorkbench() {
  const domain = useWorldStore((s) => s.gmLiveDomain);
  const setGmLiveDomain = useWorldStore((s) => s.setGmLiveDomain);
  const def = domain && domain !== "inbox" ? domainById(domain) : null;
  if (!def?.workbench) return null;
  const hk = domainHotkeyLabel(def.hotkey);

  return (
    <FloatingPanel
      open
      onClose={() => setGmLiveDomain(null)}
      title={`ГМ · ${def.label}`}
      storageKey={`gm-workbench-${def.id}`}
      defaultGeom={{ x: 56, y: 88, w: 420, h: 560 }}
      minW={300}
      minH={280}
      resizable
      zIndex={380}
      className="gm-workbench-panel"
      headerExtra={
        hk ? <kbd className="gm-workbench-hotkey">{hk}</kbd> : undefined
      }
    >
      <DomainBody id={def.id} />
    </FloatingPanel>
  );
}
