export type GateModeId = "strategia" | "rpg" | "saga";

export type GateCampaign = {
  id: string;
  title: string;
  kicker: string;
  blurb: string;
  live: boolean;
  image: string;
};

export const GATE_MODES: {
  id: GateModeId;
  label: string;
  live: boolean;
  hotkey: string;
}[] = [
  { id: "strategia", label: "STRATEGIA", live: true, hotkey: "F1" },
  { id: "rpg", label: "RPG", live: false, hotkey: "F2" },
  { id: "saga", label: "SAGA", live: false, hotkey: "F3" },
];

export const FALLBACK_GATE_CAMPAIGNS: GateCampaign[] = [
  {
    id: "silver_hearts",
    title: "Silver Hearts Part IV",
    kicker: "Скоро",
    blurb:
      "Старые герои соберутся вновь, чтобы завершить историю, длящуюся 8 лет.",
    live: false,
    image: "",
  },
  {
    id: "golden_pax",
    title: "Golden Pax",
    kicker: "Campaign",
    blurb: "Галактика Оберона: карта, державы, наука и сцена.",
    live: true,
    image: "/campaigns/art/golden-pax.png",
  },
  {
    id: "final_crusade",
    title: "The Final Crusade",
    kicker: "Скоро",
    blurb:
      "Это локальная история о последнем подвиге Адмирала Руффо, погружающегося всё глубже в пучины просторов, куда никогда не входили люди. Объединяйтесь, жертвуйте, молитесь, чтобы найти то, что даст ключ к пониманию природы Обливиона.",
    live: false,
    image: "",
  },
];

export const DEFAULT_GATE_MODE: GateModeId = "strategia";

export function campaignsForMode(
  _mode: GateModeId | null,
  overlay: GateCampaign[] = FALLBACK_GATE_CAMPAIGNS,
): GateCampaign[] {
  return overlay.length ? overlay : FALLBACK_GATE_CAMPAIGNS;
}

export function defaultCampaignId(list: GateCampaign[]): string {
  return list.find((c) => c.live)?.id ?? list[0]?.id ?? "";
}

export function coverflowNeighbors(list: GateCampaign[], centerId: string) {
  const n = list.length;
  const idx = Math.max(
    0,
    list.findIndex((c) => c.id === centerId),
  );
  if (n === 0) return { prev: null, center: null, next: null, idx: 0 };
  return {
    prev: n > 1 ? list[(idx - 1 + n) % n] : null,
    center: list[idx] ?? null,
    next: n > 1 ? list[(idx + 1) % n] : null,
    idx,
  };
}

/** Shortest wrap direction: +1 next (right), -1 previous (left). */
export function coverflowStep(
  list: GateCampaign[],
  fromId: string,
  toId: string,
): 1 | -1 {
  const n = list.length;
  const from = list.findIndex((c) => c.id === fromId);
  const to = list.findIndex((c) => c.id === toId);
  if (from < 0 || to < 0 || from === to || n < 2) return 1;
  let delta = ((to - from) % n + n) % n;
  if (delta > n / 2) delta -= n;
  return delta < 0 ? -1 : 1;
}

export function digitsKey(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}
