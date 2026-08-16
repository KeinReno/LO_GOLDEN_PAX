import { clampPerfForDevice } from "../ui/viewerGraphics";
import type { ViewerPerfChoice } from "../ui/mapLayers";
import { isLikelyMobile } from "./useViewerViewport";

/** Modes shown to players (no vague «auto»). */
export type PerfMode = ViewerPerfChoice;

export interface FactionOption {
  id: string;
  name: string;
  color: string;
}

export function readStoredPerf(): PerfMode | null {
  try {
    const v = localStorage.getItem("gmap-viewer-perf");
    if (
      v === "quality" ||
      v === "quality_mobile" ||
      v === "mobile" ||
      v === "ultralight" ||
      v === "cinematic"
    )
      return clampPerfForDevice(v);
  } catch {
    /* ignore */
  }
  return null;
}

export function defaultPerfForDevice(): PerfMode {
  return clampPerfForDevice(isLikelyMobile() ? "ultralight" : "quality");
}

export const PERF_OPTIONS: {
  id: PerfMode;
  label: string;
  hint: string;
  mobileRec?: boolean;
  desktopOnly?: boolean;
}[] = [
  {
    id: "ultralight",
    label: "Суперлайт",
    hint: "Максимум FPS. Минимум эффектов — для слабых телефонов.",
    mobileRec: true,
  },
  {
    id: "mobile",
    label: "Лайт",
    hint: "Баланс: карта читается, анимаций меньше.",
  },
  {
    id: "quality_mobile",
    label: "Качество",
    hint: "Красивая карта без бешеной перерисовки — для телефонов.",
  },
  {
    id: "quality",
    label: "Максимум",
    hint: "Все эффекты и анимации. Лучше на ПК.",
  },
  {
    id: "cinematic",
    label: "Кино",
    hint: "Максимум красоты и все слои карты. Тяжелее — только ПК или мощный планшет.",
    desktopOnly: true,
  },
];
