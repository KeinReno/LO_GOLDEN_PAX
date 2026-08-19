export type EconomySectionId =
  | "overview"
  | "production"
  | "budget"
  | "stockpile"
  | "policies";

export const ECONOMY_SECTIONS: {
  id: EconomySectionId;
  label: string;
  hotkey: string;
}[] = [
  { id: "overview", label: "Обзор", hotkey: "Alt+1" },
  { id: "production", label: "Производство", hotkey: "Alt+2" },
  { id: "budget", label: "Бюджет", hotkey: "Alt+3" },
  { id: "stockpile", label: "Склад", hotkey: "Alt+4" },
  { id: "policies", label: "Политики", hotkey: "Alt+5" },
];

export const ECONOMY_SECTION_BY_DIGIT: Record<string, EconomySectionId> = {
  "1": "overview",
  "2": "production",
  "3": "budget",
  "4": "stockpile",
  "5": "policies",
};

export type CategoryStatus = "ok" | "warn" | "deficit";

export const ECO_SECTION_STORAGE = "gmap-eco-section";
