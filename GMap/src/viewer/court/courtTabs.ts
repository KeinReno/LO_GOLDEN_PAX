export type CourtTabId = "council" | "field" | "nations" | "houses";

export type CourtTabDef = {
  id: CourtTabId;
  label: string;
  echo: string;
  hint: string;
  hotkey: string;
};

/** Tab 4 = «Дома» — houses, orders, caucuses. */
export const COURT_TABS: CourtTabDef[] = [
  {
    id: "council",
    label: "Совет",
    echo: "стол",
    hint: "Трон игрока + советники · drag из пула",
    hotkey: "Alt+1",
  },
  {
    id: "field",
    label: "Поле",
    echo: "посты",
    hint: "Drop на систему / легион / флот",
    hotkey: "Alt+2",
  },
  {
    id: "nations",
    label: "Народы",
    echo: "голоса",
    hint: "Drop на народ — назначить лидера",
    hotkey: "Alt+3",
  },
  {
    id: "houses",
    label: "Дома",
    echo: "влияние",
    hint: "Drop на дом — назначить главу",
    hotkey: "Alt+4",
  },
];

export function courtTabById(id: CourtTabId): CourtTabDef {
  return COURT_TABS.find((t) => t.id === id) ?? COURT_TABS[0]!;
}
