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
    hint: "Трон игрока + советники · клик слота, затем посадить",
    hotkey: "1",
  },
  {
    id: "field",
    label: "Поле",
    echo: "посты",
    hint: "На систему, легион или флот",
    hotkey: "2",
  },
  {
    id: "nations",
    label: "Народы",
    echo: "голоса",
    hint: "Назначить лидера народа",
    hotkey: "3",
  },
  {
    id: "houses",
    label: "Дома",
    echo: "влияние",
    hint: "Назначить главу дома",
    hotkey: "4",
  },
];

export function courtTabById(id: CourtTabId): CourtTabDef {
  return COURT_TABS.find((t) => t.id === id) ?? COURT_TABS[0]!;
}
