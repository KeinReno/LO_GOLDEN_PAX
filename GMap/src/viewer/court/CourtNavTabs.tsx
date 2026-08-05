import { LayoutGroup, motion } from "motion/react";
import { COURT_TABS, type CourtTabId } from "./courtTabs";

/**
 * Aceternity «Animated Tabs» port — sliding pill under the active tab.
 */
export function CourtNavTabs({
  value,
  onChange,
  badges,
}: {
  value: CourtTabId;
  onChange: (id: CourtTabId) => void;
  badges?: Partial<Record<CourtTabId, number>>;
}) {
  return (
    <LayoutGroup id="court-nav-tabs">
      <div className="court-nav-tabs" role="tablist" aria-label="Разделы двора">
        {COURT_TABS.map((tab) => {
          const active = value === tab.id;
          const badge = badges?.[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`court-tab-${tab.id}`}
              className={`court-nav-tab${active ? " is-active" : ""}`}
              title={tab.hint}
              onClick={() => onChange(tab.id)}
            >
              {active ? (
                <motion.span
                  layoutId="court-nav-pill"
                  className="court-nav-tab__pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              ) : null}
              <span className="court-nav-tab__label">{tab.label}</span>
              {badge != null && badge > 0 ? (
                <span className="court-nav-tab__badge" aria-label={`${badge}`}>
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
