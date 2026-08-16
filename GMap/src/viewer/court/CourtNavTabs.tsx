import { useEffect, useRef } from "react";
import { LayoutGroup, motion } from "motion/react";
import { COURT_TABS, type CourtTabId } from "./courtTabs";
import { isInputFocused } from "../hooks/isInputFocused";

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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (isInputFocused(e.target)) return;
      const digit =
        /^Digit([1-4])$/.exec(e.code)?.[1] ??
        (/^[1-4]$/.test(e.key) ? e.key : null);
      if (!digit) return;
      const tab = COURT_TABS[Number(digit) - 1];
      if (!tab) return;
      e.preventDefault();
      onChangeRef.current(tab.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
              title={`${tab.hint} · ${tab.hotkey}`}
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
              <kbd className="ex-tab-kbd">{tab.hotkey}</kbd>
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
