/** Staff-radio interrupts. Chrome stays silent. Music beds are out of scope. */

export type StaffCueId =
  | "radio_squelch"
  | "turn_advance"
  | "contact_alert"
  | "seal_stamp"
  | "token_drop";

const STORAGE = "gmap-staff-sfx";
const DEBOUNCE_MS: Record<StaffCueId, number> = {
  radio_squelch: 400,
  turn_advance: 800,
  contact_alert: 1200,
  seal_stamp: 250,
  token_drop: 180,
};

type Prefs = {
  muted: boolean;
  volume: number;
  variant: Partial<Record<StaffCueId, number>>;
};

const DEFAULT_PREFS: Prefs = { muted: false, volume: 0.7, variant: {} };

let prefs: Prefs = loadPrefs();
let unlocked = false;
let unlockBound = false;
const lastPlayed: Partial<Record<StaffCueId, number>> = {};
const listeners = new Set<() => void>();

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      muted: !!parsed.muted,
      volume:
        typeof parsed.volume === "number"
          ? Math.min(1, Math.max(0, parsed.volume))
          : DEFAULT_PREFS.volume,
      variant: parsed.variant ?? {},
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn();
}

function cueUrl(id: StaffCueId): string {
  const n = Math.min(4, Math.max(1, prefs.variant[id] ?? 1));
  return `/audio/sfx/${id}__${String(n).padStart(2, "0")}.wav`;
}

export function unlockStaffAudio(): void {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;
  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function isStaffSfxMuted(): boolean {
  return prefs.muted;
}

export function getStaffSfxVolume(): number {
  return prefs.volume;
}

export function setStaffSfxMuted(muted: boolean): void {
  prefs = { ...prefs, muted };
  savePrefs();
}

export function setStaffSfxVolume(volume: number): void {
  const v = Math.min(1, Math.max(0, Math.round(volume * 100) / 100));
  if (v === prefs.volume) return;
  prefs = { ...prefs, volume: v };
  savePrefs();
}

export function subscribeStaffSfx(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function playStaffCue(id: StaffCueId): void {
  if (typeof window === "undefined") return;
  if (prefs.muted || prefs.volume <= 0 || document.hidden) return;
  const now = performance.now();
  const wait = DEBOUNCE_MS[id] ?? 200;
  if (now - (lastPlayed[id] ?? 0) < wait) return;
  lastPlayed[id] = now;
  if (!unlocked) {
    unlocked = true;
  }
  try {
    const audio = new Audio(cueUrl(id));
    audio.volume = prefs.volume;
    void audio.play().catch(() => {
      /* autoplay until first gesture */
    });
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") unlockStaffAudio();
