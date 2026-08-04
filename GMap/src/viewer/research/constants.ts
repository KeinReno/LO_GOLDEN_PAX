export const QUEUE_MAX = 5;

/** Custom DnD type for tech queue / map highlight. */
export const TECH_DND_MIME = "application/x-lo-tech-id";

/** Drag cognitio stock onto a tech node to research / rush. */
export const COGNITIO_DND_MIME = "application/x-lo-cognitio";

/** Drag stockpile currency onto a system drop zone. */
export const STOCK_DND_MIME = "application/x-lo-stock-currency";

export type ResearchFilter =
  | "all"
  | "available"
  | "exclusive"
  | "breakthrough"
  | "researched";

export const RESEARCH_FILTER_LABELS: Record<ResearchFilter, string> = {
  all: "Все",
  available: "Доступные",
  exclusive: "Эксклюзивы",
  breakthrough: "Прорывные",
  researched: "Изученные",
};
