/**
 * One-click player share: publish map + public tunnel.
 * Prefers production server (dist) so Vite HMR doesn't white-screen through tunnels.
 * Order: CloudPub (RF) → Cloudflare → ngrok → localtunnel.
 *
 * Orchestrator only — provider/watchdog implementations live in ./playerShare/*.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  DEV_PORT,
  PROD_PORT,
  state,
  pushLog,
  sleep,
  killChild,
  killTunnelAgents,
  childAlive,
  localHealthOk,
  fetchText,
  parseLocaIp,
  verifyTunnel,
  hintFor,
  deriveShareStatus,
  refreshDirectAccess,
} from "./playerShare/base.mjs";
import {
  configureCloudPubToken,
  hasCloudPubToken,
  findCloBin,
  cloudPubUnpublish,
  startCloudPub,
} from "./playerShare/cloudpub.mjs";
import { configureNgrokAuthtoken, hasNgrokToken, startNgrok } from "./playerShare/ngrok.mjs";
import { startLocaltunnel, startCloudflare } from "./playerShare/otherTunnels.mjs";
import {
  markShareHealthy,
  wireChildExit,
  startShareWatchdog,
  stopShareWatchdog,
} from "./playerShare/watchdog.mjs";

export { configureCloudPubToken, configureNgrokAuthtoken };

/** Prefer built app on 4173 — avoids blank Vite pages through tunnels. */
async function ensureShareTargetPort(devPort) {
  const distIndex = path.join(ROOT, "dist", "index.html");

  if (await localHealthOk(PROD_PORT)) {
    pushLog(`share target: existing prod :${PROD_PORT}`);
    state.targetPort = PROD_PORT;
    return PROD_PORT;
  }

  if (!fs.existsSync(distIndex)) {
    pushLog("dist missing — building…");
    const build = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "build"],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
        shell: process.platform === "win32",
        timeout: 180000,
      },
    );
    if (build.status !== 0 || !fs.existsSync(distIndex)) {
      pushLog("build failed — falling back to vite dev port");
      state.targetPort = devPort;
      return devPort;
    }
  }

  pushLog(`starting prod server :${PROD_PORT}`);
  if (state.prodChild) {
    killChild(state.prodChild);
    state.prodChild = null;
  }
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "server/serve.mjs")],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PROD_PORT),
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        GMAP_PLAYER_SHARE: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  state.prodChild = child;
  child.stdout?.on("data", (b) => pushLog(b.toString("utf8")));
  child.stderr?.on("data", (b) => pushLog(b.toString("utf8")));

  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (await localHealthOk(PROD_PORT)) {
      state.targetPort = PROD_PORT;
      return PROD_PORT;
    }
    await sleep(400);
  }
  pushLog("prod server slow — using vite port");
  state.targetPort = devPort;
  return devPort;
}

export function getPlayerShareStatus() {
  const alive = childAlive(state.child);
  const status = deriveShareStatus();
  const viewUrl = state.publicUrl ? `${state.publicUrl}/view` : null;
  const lastViewUrl = state.lastViewUrl || viewUrl;
  return {
    active: !!(state.publicUrl && alive && state.healthOk !== false),
    starting: state.starting,
    status,
    healthOk: state.healthOk,
    provider: state.provider,
    publicUrl: state.publicUrl,
    viewUrl: viewUrl || (status === "down" || status === "degraded" ? lastViewUrl : null),
    lastViewUrl,
    startedAt: state.startedAt,
    error: state.error,
    playerHint: state.playerHint,
    endpointIp: state.endpointIp,
    hasNgrokToken: hasNgrokToken(),
    hasCloudPubToken: hasCloudPubToken(),
    hasCloudPubCli: !!findCloBin(),
    targetPort: state.targetPort,
    lastHealthAt: state.lastHealthAt,
    lastHealthError: state.lastHealthError,
    downSince: state.downSince,
    reconnectAttempts: state.reconnectAttempts,
    urlRotated: !!state.urlRotated,
    previousViewUrl: state.previousViewUrl || null,
    wanIp: state.wanIp,
    wanIpAt: state.wanIpAt,
    directViewUrl: state.directViewUrl,
    directHint: state.directHint,
  };
}

export function stopPlayerShare() {
  stopShareWatchdog();
  const guid = state.cloudpubGuid;
  const wasCloudPub = state.provider === "cloudpub";
  if (state.child) {
    killChild(state.child);
    state.child = null;
  }
  // Unpublish only after killing our agent — never `clo ls` while publish runs.
  if (guid && wasCloudPub) {
    cloudPubUnpublish(guid);
  }
  killTunnelAgents();
  // keep prod server — useful for republish; kill only tunnels
  state.provider = null;
  state.publicUrl = null;
  state.lastViewUrl = null;
  state.startedAt = null;
  state.error = null;
  state.starting = false;
  state.playerHint = null;
  state.endpointIp = null;
  state.cloudpubGuid = null;
  state.healthOk = null;
  state.lastHealthAt = null;
  state.lastHealthError = null;
  state.downSince = null;
  state.reconnectAttempts = 0;
  state.reconnectInFlight = false;
  state.targetPort = null;
  state.wanIp = null;
  state.wanIpAt = null;
  state.directViewUrl = null;
  state.directHint = null;
  return { ok: true };
}

/**
 * @param {{ prefer?: string, localPort?: number, force?: boolean, ngrokAuthtoken?: string, cloudpubToken?: string }} opts
 */
export async function startPlayerShare(opts = {}) {
  if (opts.ngrokAuthtoken) {
    configureNgrokAuthtoken(opts.ngrokAuthtoken);
  }
  if (opts.cloudpubToken) {
    configureCloudPubToken(opts.cloudpubToken);
  }

  if (!opts.force) {
    const status = getPlayerShareStatus();
    if (status.active && status.publicUrl) {
      const meta = await verifyTunnel(status.publicUrl);
      if (meta.alive) {
        if (meta.ip) {
          state.endpointIp = meta.ip;
          state.playerHint = hintFor(status.provider, meta.ip);
        }
        await refreshDirectAccess(state.targetPort || PROD_PORT);
        return getPlayerShareStatus();
      }
      stopPlayerShare();
    }
  } else {
    stopPlayerShare();
  }

  if (state.starting) {
    const t0 = Date.now();
    while (state.starting && Date.now() - t0 < 120000) {
      await sleep(400);
    }
    return getPlayerShareStatus();
  }

  state.starting = true;
  state.error = null;
  state.playerHint = null;
  state.endpointIp = null;
  state.cloudpubGuid = null;
  state.healthOk = null;
  state.lastHealthError = null;
  state.downSince = null;
  state.reconnectAttempts = 0;
  state.reconnectInFlight = false;
  stopShareWatchdog();

  const devPort = opts.localPort || DEV_PORT;
  const prefer = (
    opts.prefer ||
    process.env.GMAP_SHARE_PROVIDER ||
    "auto"
  ).toLowerCase();

  let targetPort;
  try {
    targetPort = await ensureShareTargetPort(devPort);
  } catch (e) {
    state.starting = false;
    throw e;
  }

  const order =
    prefer === "localtunnel" || prefer === "lt"
      ? [startLocaltunnel, startCloudPub, startCloudflare, startNgrok]
      : prefer === "cloudflare"
        ? [startCloudflare, startCloudPub, startNgrok, startLocaltunnel]
        : prefer === "ngrok"
          ? [startNgrok, startCloudPub, startCloudflare, startLocaltunnel]
          : prefer === "cloudpub" || prefer === "clo"
            ? // Explicit CloudPub — do not silently fall back to trycloudflare (МТС).
              [startCloudPub]
            : // Default for RF: CloudPub first when CLI+token exist
              hasCloudPubToken() && findCloBin()
              ? [startCloudPub, startCloudflare, startNgrok, startLocaltunnel]
              : hasNgrokToken()
                ? [startNgrok, startCloudPub, startCloudflare, startLocaltunnel]
                : [startCloudPub, startCloudflare, startNgrok, startLocaltunnel];

  const errors = [];
  try {
    killTunnelAgents();
    await sleep(300);

    for (const starter of order) {
      let child = null;
      try {
        pushLog(`try ${starter.name} on :${targetPort}`);
        const started = await starter(targetPort);
        child = started.child;
        const { url, provider } = started;
        if (started.guid) state.cloudpubGuid = started.guid;

        const meta = await verifyTunnel(url);
        if (!meta.alive) {
          killChild(child);
          if (provider === "cloudpub" && state.cloudpubGuid) {
            cloudPubUnpublish(state.cloudpubGuid);
            state.cloudpubGuid = null;
          }
          throw new Error(`${provider}: туннель не отвечает`);
        }

        let endpointIp = meta.ip;
        if (provider === "localtunnel" && !endpointIp) {
          const gate = await fetchText(url);
          endpointIp = parseLocaIp(gate.body);
        }

        state.child = child;
        const prevView = state.lastViewUrl;
        state.publicUrl = url;
        state.lastViewUrl = `${url}/view`;
        if (prevView && prevView !== state.lastViewUrl) {
          state.urlRotated = true;
          state.previousViewUrl = prevView;
        }
        state.provider = provider;
        state.startedAt = new Date().toISOString();
        state.error = null;
        state.endpointIp = endpointIp;
        state.playerHint = hintFor(provider, endpointIp);
        state.targetPort = targetPort;
        state.starting = false;
        markShareHealthy();
        wireChildExit(child);
        startShareWatchdog();
        await refreshDirectAccess(targetPort);
        return getPlayerShareStatus();
      } catch (e) {
        if (child) killChild(child);
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        pushLog(msg);
      }
    }

    const err =
      errors.join(" | ") ||
      "Не удалось открыть доступ. Установи CloudPub CLI (tools/cloudpub/clo.exe) и API-ключ с cloudpub.ru.";
    state.error = err;
    state.starting = false;
    throw new Error(err);
  } catch (e) {
    state.starting = false;
    throw e;
  }
}
