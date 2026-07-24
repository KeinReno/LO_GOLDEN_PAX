/**
 * Daily tick scheduler (P2.3) — cron 00:01 MSK + boot catch-up.
 * P8.2: records miss alerts for master health UI.
 */
import { getTableMeta } from "./tableStore.mjs";
import { pushTickAlert } from "./opsHealth.mjs";

let started = false;
let timer = null;
let lastScheduledWait = null;

function msUntilNextCron(cronExpr, timeZone) {
  // Support "1 0 * * *" = minute hour — 00:01
  const parts = String(cronExpr || "1 0 * * *").trim().split(/\s+/);
  const minute = Number(parts[0] ?? 1);
  const hour = Number(parts[1] ?? 0);

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 48 * 60; i++) {
    const cand = new Date(now.getTime() + i * 60_000);
    const p = Object.fromEntries(
      fmt
        .formatToParts(cand)
        .filter((x) => x.type !== "literal")
        .map((x) => [x.type, x.value]),
    );
    if (
      Number(p.hour) === hour &&
      Number(p.minute) === minute &&
      Number(p.second) === 0
    ) {
      return Math.max(1000, cand.getTime() - now.getTime());
    }
    if (Number(p.hour) === hour && Number(p.minute) === minute) {
      return Math.max(1000, cand.getTime() - now.getTime());
    }
  }
  return 60_000;
}

function sameMoscowDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(isoA)) === fmt.format(new Date(isoB));
}

/**
 * @param {{ getCron: () => string, getTimezone: () => string, onTick: () => unknown }} opts
 */
export function startTickScheduler(opts) {
  if (started) return;
  started = true;

  const runCatchUp = () => {
    const meta = getTableMeta();
    const now = new Date().toISOString();
    // Never auto-tick on first ever boot — only if a prior daily tick was missed.
    if (!meta.lastTickAt) return;
    if (sameMoscowDay(meta.lastTickAt, now)) return;
    console.log(
      "[tick] boot catch-up (missed daily tick since",
      meta.lastTickAt,
      ")",
    );
    pushTickAlert(
      `Пропущен суточный тик (lastTickAt=${meta.lastTickAt}) — catch-up на boot`,
      "miss",
    );
    try {
      const result = opts.onTick();
      if (result && result.ok === false) {
        console.warn("[tick] catch-up failed:", result.error);
        pushTickAlert(`Catch-up failed: ${result.error}`, "catchup_fail");
      } else {
        pushTickAlert("Catch-up выполнен успешно", "catchup_ok");
      }
    } catch (e) {
      console.warn("[tick] catch-up error", e);
      pushTickAlert(String(e?.message || e), "catchup_fail");
    }
  };

  const scheduleNext = () => {
    const wait = msUntilNextCron(opts.getCron(), opts.getTimezone());
    lastScheduledWait = wait;
    timer = setTimeout(() => {
      console.log("[tick] cron fire");
      try {
        const result = opts.onTick();
        if (result && result.ok === false) {
          pushTickAlert(`Cron tick failed: ${result.error}`, "cron_fail");
        }
      } catch (e) {
        console.warn("[tick] error", e);
        pushTickAlert(String(e?.message || e), "cron_fail");
      }
      scheduleNext();
    }, wait);
    if (typeof timer.unref === "function") timer.unref();
  };

  setTimeout(runCatchUp, 2500);
  scheduleNext();
  console.log(
    `[tick] scheduler on (${opts.getCron()} ${opts.getTimezone()}) next~${Math.round((lastScheduledWait || 0) / 60000)}m`,
  );
}

export function getSchedulerStatus() {
  return {
    started,
    msUntilNext: lastScheduledWait,
  };
}

export function stopTickScheduler() {
  if (timer) clearTimeout(timer);
  started = false;
}
