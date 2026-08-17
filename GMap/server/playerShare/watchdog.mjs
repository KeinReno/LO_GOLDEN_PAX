/**
 * Share health watchdog + soft-reconnect on tunnel drop.
 * Extracted from ../playerShare.mjs.
 */
import {
  state,
  pushLog,
  killChild,
  childAlive,
  inspectPublicUrl,
  verifyTunnel,
  hintFor,
  refreshDirectAccess,
  PROD_PORT,
} from "./base.mjs";
import { reconnectCloudPub } from "./cloudpub.mjs";

const WATCHDOG_MS = 15_000;
const MAX_SOFT_RECONNECT = 2;
const WAN_REFRESH_EVERY_TICKS = 4; // ~60s with 15s watchdog
let watchdogTicks = 0;

export function stopShareWatchdog() {
  if (state.watchdogTimer) {
    clearInterval(state.watchdogTimer);
    state.watchdogTimer = null;
  }
}

export function markShareHealthy() {
  state.healthOk = true;
  state.lastHealthAt = new Date().toISOString();
  state.lastHealthError = null;
  state.downSince = null;
  state.reconnectAttempts = 0;
  if (state.error && /туннель упал|не отвечает|процесс туннеля/i.test(state.error)) {
    state.error = null;
  }
}

export function markShareDown(reason) {
  state.healthOk = false;
  state.lastHealthAt = new Date().toISOString();
  state.lastHealthError = reason || "туннель недоступен";
  if (!state.downSince) state.downSince = new Date().toISOString();
}

export function wireChildExit(child) {
  child.on("exit", () => {
    if (state.child !== child) return;
    state.child = null;
    markShareDown("процесс туннеля завершился");
    pushLog("tunnel child exit — soft reconnect");
    void softReconnectShare().then((ok) => {
      if (!ok) {
        state.error =
          "Туннель упал — нажми «Перезапустить» и выдай игрокам новую ссылку";
      }
    });
  });
}

/**
 * Soft reconnect: re-spawn publish WITHOUT clo ls / unpublish
 * so CloudPub usually keeps the same hostname.
 */
export async function softReconnectShare() {
  if (state.starting || state.reconnectInFlight) return false;
  if (state.reconnectAttempts >= MAX_SOFT_RECONNECT) return false;
  if (!state.provider || !state.targetPort) return false;

  state.reconnectInFlight = true;
  state.reconnectAttempts += 1;
  const attempt = state.reconnectAttempts;
  pushLog(`soft reconnect #${attempt} (${state.provider})`);

  try {
    if (state.child) {
      killChild(state.child);
      state.child = null;
    }

    let started;
    if (state.provider === "cloudpub") {
      started = await reconnectCloudPub(state.targetPort);
    } else {
      markShareDown("туннель упал — нажми Перезапустить");
      state.error =
        "Туннель упал — нажми «Перезапустить» и выдай игрокам новую ссылку";
      return false;
    }

    if (started.guid) state.cloudpubGuid = started.guid;
    const meta = await verifyTunnel(started.url);
    if (!meta.alive) {
      killChild(started.child);
      throw new Error(`${started.provider}: туннель не отвечает после reconnect`);
    }

    state.child = started.child;
    const prevView = state.lastViewUrl;
    state.publicUrl = started.url;
    state.lastViewUrl = `${started.url}/view`;
    if (prevView && prevView !== state.lastViewUrl) {
      state.urlRotated = true;
      state.previousViewUrl = prevView;
    }
    state.provider = started.provider;
    state.endpointIp = meta.ip || state.endpointIp;
    state.playerHint = hintFor(started.provider, state.endpointIp);
    markShareHealthy();
    wireChildExit(started.child);
    pushLog(`soft reconnect ok ${started.url}`);
    void refreshDirectAccess(state.targetPort || PROD_PORT);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    pushLog(`soft reconnect fail: ${msg}`);
    markShareDown(msg);
    if (state.reconnectAttempts >= MAX_SOFT_RECONNECT) {
      state.error =
        "Туннель упал — нажми «Перезапустить» и выдай игрокам новую ссылку";
    }
    return false;
  } finally {
    state.reconnectInFlight = false;
  }
}

async function tickShareWatchdog() {
  if (state.starting || state.reconnectInFlight) return;
  if (!state.publicUrl) return;

  watchdogTicks += 1;
  if (watchdogTicks === 1 || watchdogTicks % WAN_REFRESH_EVERY_TICKS === 0) {
    void refreshDirectAccess(state.targetPort || PROD_PORT);
  }

  if (!childAlive(state.child)) {
    markShareDown("процесс туннеля не запущен");
    await softReconnectShare();
    return;
  }

  const meta = await inspectPublicUrl(state.publicUrl);
  if (meta.alive) {
    markShareHealthy();
    if (meta.ip) {
      state.endpointIp = meta.ip;
      state.playerHint = hintFor(state.provider, meta.ip);
    }
    return;
  }

  markShareDown(
    meta.status === 503
      ? "CloudPub 503 — агент offline"
      : `health HTTP ${meta.status || 0}`,
  );
  await softReconnectShare();
}

export function startShareWatchdog() {
  stopShareWatchdog();
  watchdogTicks = 0;
  state.watchdogTimer = setInterval(() => {
    void tickShareWatchdog();
  }, WATCHDOG_MS);
  // First check shortly after publish (edge may lag a second).
  setTimeout(() => {
    void tickShareWatchdog();
  }, 2500);
}
