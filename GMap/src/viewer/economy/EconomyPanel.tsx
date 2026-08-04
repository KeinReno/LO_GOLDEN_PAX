import { useEffect, useState } from "react";
import {
  Banknote,
  Boxes,
  Factory,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
} from "lucide-react";
import type { ViewerPayload } from "../../state/types";
import { FloatingPanel } from "../../ui/FloatingPanel";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { OverviewSection } from "./OverviewSection";
import { ProductionSection } from "./ProductionSection";
import { BudgetSection } from "./BudgetSection";
import { StockpileSection } from "./StockpileSection";
import { PoliciesSection } from "./PoliciesSection";
import {
  ECONOMY_SECTION_BY_DIGIT,
  ECONOMY_SECTIONS,
  type EconomySectionId,
} from "./types";

const SIDEBAR_ICONS: Record<EconomySectionId, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  production: Factory,
  budget: Banknote,
  stockpile: Boxes,
  policies: ScrollText,
};

type Props = {
  open: boolean;
  payload: ViewerPayload;
  flowData?: EconomyFlowBreakdown | null;
  factionName?: string;
  onClose: () => void;
  onFocusBuild?: () => void;
  /** System opened from Production (highlight + snap). */
  linkedSystemId?: string | null;
  onOpenSystem?: (systemId: string) => void;
  /** Jump from deficit warning to a system with category highlight. */
  onFocusDeficit?: (letter: string, systemId?: string) => void;
  onFocusSystemOnMap?: (systemId: string) => void;
  onSetFlowPriority?: (opts: {
    from: string;
    to: string;
    systemId?: string | null;
  }) => void;
  priorityBusy?: boolean;
  onSetTax?: (taxSlot: string, tierId: string) => void;
  onSetDoctrine?: (policyId: string) => void;
  onReserveStock?: (
    currencyId: string,
    amount: number,
    label?: string,
  ) => void;
  onSellFromStock?: (currencyId: string) => void;
  onCaravanHint?: (currencyId: string, systemId?: string) => void;
  onStockAlert?: (currencyId: string) => void;
  stockBusy?: boolean;
  policyBusy?: boolean;
  /** Jump to Science when a tech is needed. */
  onOpenResearch?: (hint?: string) => void;
  /** External open: jump to production with category filter. */
  focusProductionCategory?: string | null;
};

export function EconomyPanel({
  open,
  payload,
  flowData,
  factionName,
  onClose,
  onFocusBuild,
  linkedSystemId,
  onOpenSystem,
  onFocusDeficit,
  onFocusSystemOnMap,
  onSetFlowPriority,
  priorityBusy,
  onSetTax,
  onSetDoctrine,
  onReserveStock,
  onSellFromStock,
  onCaravanHint,
  onStockAlert,
  stockBusy,
  policyBusy,
  onOpenResearch,
  focusProductionCategory,
}: Props) {
  const [section, setSection] = useState<EconomySectionId>("overview");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [productionFilter, setProductionFilter] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!focusProductionCategory) return;
    setProductionFilter(focusProductionCategory);
    setSection("production");
  }, [focusProductionCategory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      const next = ECONOMY_SECTION_BY_DIGIT[e.key];
      if (!next) return;
      e.preventDefault();
      e.stopPropagation();
      setSection(next);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const title = factionName
    ? `Экономика · ${factionName}`
    : "Экономика";

  const openProduction = (letter?: string) => {
    setProductionFilter(letter ?? null);
    setSection("production");
  };

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      title={title}
      storageKey="gmap-economy-panel"
      defaultGeom={{ x: 48, y: 72, w: 720, h: 520 }}
      minW={480}
      minH={320}
      zIndex={380}
      resizable
      snapLeft={Boolean(linkedSystemId)}
      className={`gmap-float-panel--economy ${
        linkedSystemId ? "is-snapped-left" : ""
      }`}
    >
      <div
        className={`eco-panel ${sidebarExpanded ? "eco-panel--expanded" : "eco-panel--collapsed"}`}
      >
        <aside className="eco-sidebar" aria-label="Разделы экономики">
          <button
            type="button"
            className="eco-sidebar__toggle"
            title={sidebarExpanded ? "Свернуть" : "Развернуть"}
            onClick={() => setSidebarExpanded((v) => !v)}
          >
            {sidebarExpanded ? (
              <PanelLeftClose size={16} strokeWidth={2} />
            ) : (
              <PanelLeftOpen size={16} strokeWidth={2} />
            )}
          </button>
          <nav className="eco-sidebar__nav">
            {ECONOMY_SECTIONS.map((s) => {
              const Icon = SIDEBAR_ICONS[s.id];
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`eco-sidebar__item ${active ? "is-active" : ""}`}
                  onClick={() => setSection(s.id)}
                  title={`${s.label} · ${s.hotkey}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} strokeWidth={2} aria-hidden />
                  {sidebarExpanded && (
                    <span className="eco-sidebar__label">{s.label}</span>
                  )}
                  {sidebarExpanded && (
                    <kbd className="eco-sidebar__kbd">{s.hotkey}</kbd>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="eco-content">
          {section === "overview" && (
            <OverviewSection
              payload={payload}
              flowData={flowData}
              onOpenProduction={openProduction}
              onOpenPolicies={() => setSection("policies")}
              onOpenBudget={() => setSection("budget")}
              onFocusBuild={onFocusBuild}
              onFocusDeficit={onFocusDeficit}
              onOpenResearch={onOpenResearch}
            />
          )}
          {section === "production" && (
            <ProductionSection
              payload={payload}
              flowData={flowData}
              filterCategory={productionFilter}
              linkedSystemId={linkedSystemId}
              onOpenSystem={onOpenSystem}
              onFocusOnMap={onFocusSystemOnMap}
              onSetFlowPriority={onSetFlowPriority}
              priorityBusy={priorityBusy}
            />
          )}
          {section === "budget" && <BudgetSection payload={payload} />}
          {section === "stockpile" && (
            <StockpileSection
              payload={payload}
              busy={stockBusy}
              onSell={onSellFromStock}
              onReserve={onReserveStock}
              onCaravan={onCaravanHint}
              onSetAlert={onStockAlert}
              onDropOnSystem={(currencyId, systemId) => {
                onCaravanHint?.(currencyId, systemId);
                onOpenSystem?.(systemId);
              }}
            />
          )}
          {section === "policies" && (
            <PoliciesSection
              payload={payload}
              busy={policyBusy}
              onSetTax={(slot, tier) => {
                onSetTax?.(slot, tier);
                setSection("budget");
              }}
              onSetDoctrine={onSetDoctrine}
            />
          )}
        </div>
      </div>
    </FloatingPanel>
  );
}
