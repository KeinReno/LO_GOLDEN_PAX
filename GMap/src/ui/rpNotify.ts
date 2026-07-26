/** Soft chime + optional desktop notification for new RP messages. */

let audioCtx: AudioContext | null = null;
let lastNotifiedId: string | null = null;
let permissionAsked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/** Soft two-tone chime (not harsh). */
export function playRpChime(): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    void ctx.resume();
    const now = ctx.currentTime;
    const tones = [
      { f: 660, t: 0, d: 0.12 },
      { f: 880, t: 0.1, d: 0.16 },
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.f;
      gain.gain.setValueAtTime(0.0001, now + tone.t);
      gain.gain.exponentialRampToValueAtTime(0.07, now + tone.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.t + tone.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.t);
      osc.stop(now + tone.t + tone.d + 0.02);
    }
  } catch {
    /* ignore autoplay / audio errors */
  }
}

async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionAsked) return false;
  permissionAsked = true;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export type RpNotifyMessage = {
  id: string;
  at: string;
  body?: string;
  authorName?: string | null;
  authorFactionId?: string | null;
};

/**
 * Notify about the newest message if it is new and not from self.
 * Returns true if a cue was fired.
 */
export function notifyNewRpMessage(
  msgs: RpNotifyMessage[],
  opts: {
    selfFactionId?: string | null;
    selfAuthorName?: string | null;
    /** Skip desktop notification when RP window is focused/open. */
    quietDesktop?: boolean;
  } = {},
): boolean {
  if (!msgs.length) return false;
  const newest = [...msgs].sort((a, b) => (a.at < b.at ? 1 : -1))[0]!;
  if (newest.id === lastNotifiedId) return false;

  // First load: remember without notifying
  if (lastNotifiedId === null) {
    lastNotifiedId = newest.id;
    return false;
  }

  const fromSelf =
    (opts.selfFactionId &&
      newest.authorFactionId &&
      newest.authorFactionId === opts.selfFactionId) ||
    (opts.selfAuthorName &&
      newest.authorName &&
      newest.authorName === opts.selfAuthorName);
  if (fromSelf) {
    lastNotifiedId = newest.id;
    return false;
  }

  lastNotifiedId = newest.id;
  playRpChime();

  if (!opts.quietDesktop) {
    void ensureNotifyPermission().then((ok) => {
      if (!ok) return;
      try {
        const title = newest.authorName
          ? `RP · ${newest.authorName}`
          : "RP · новое сообщение";
        const body = (newest.body || "").trim().slice(0, 140) || "Новое сообщение в RP";
        const n = new Notification(title, {
          body,
          silent: true,
          tag: "gmap-rp",
        });
        window.setTimeout(() => n.close(), 5000);
      } catch {
        /* ignore */
      }
    });
  }
  return true;
}

export function resetRpNotifyState(): void {
  lastNotifiedId = null;
}
