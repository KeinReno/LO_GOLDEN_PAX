import { FloatingPanel } from "../../ui/FloatingPanel";
import { useEffect } from "react";
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
import { GmCommandCard } from "./GmCommandCard";
import { domainById } from "./gmDomains";
import type { GmLiveDomainId } from "../../state/types";

function DiploWorkbench() {
  const setDiplomacyPanelOpen = useWorldStore((s) => s.setDiplomacyPanelOpen);
  // Open full diplo overlay when domain activates — DealDesk lives there.
  useEffect(() => {
    setDiplomacyPanelOpen(true);
    return () => setDiplomacyPanelOpen(false);
  }, [setDiplomacyPanelOpen]);
  return (
    <div className="gm-domain-body">
      <p className="hint">
        Дипло-верстак открыт поверх карты. Ниже — столкновения.
      </p>
      <div className="gmsys-row" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => setDiplomacyPanelOpen(true)}
        >
          Снова открыть дипло
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
      return <GmSystemsPanel forcedTab="quests" hideChrome />;
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
  const card = (
    <GmCommandCard onOpenDomain={(id) => setGmLiveDomain(id)} />
  );

  if (!def?.workbench) {
    return (
      <div
        style={{
          position: "fixed",
          left: 56,
          top: 88,
          zIndex: 370,
          width: 360,
          maxHeight: "46vh",
          overflow: "auto",
        }}
      >
        {card}
      </div>
    );
  }

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
      headerExtra={<kbd className="gm-workbench-hotkey">F{def.hotkey}</kbd>}
    >
      {card}
      <DomainBody id={def.id} />
    </FloatingPanel>
  );
}
