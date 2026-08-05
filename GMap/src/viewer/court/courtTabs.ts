export type CourtTabId = "council" | "field" | "nations" | "houses";

export type CourtTabDef = {
  id: CourtTabId;
  label: string;
  echo: string;
  hint: string;
};

/** Tab 4 = «Дома» — houses, orders, caucuses. */
export const COURT_TABS: CourtTabDef[] = [
  {
    id: "council",
    label: "Совет",
    echo: "стол",
    hint: "Трон игрока + советники · drag из пула",
  },
  {
    id: "field",
    label: "Поле",
    echo: "посты",
    hint: "Drop на систему / легион / флот",
  },
  {
    id: "nations",
    label: "Народы",
    echo: "голоса",
    hint: "Drop на народ — назначить лидера",
  },
  {
    id: "houses",
    label: "Дома",
    echo: "влияние",
    hint: "Drop на дом — назначить главу",
  },
];

export function courtTabById(id: CourtTabId): CourtTabDef {
  return COURT_TABS.find((t) => t.id === id) ?? COURT_TABS[0]!;
}
