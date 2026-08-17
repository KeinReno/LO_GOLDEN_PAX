/**
 * localtunnel + cloudflared tunnel providers.
 * Extracted from ../playerShare.mjs.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, normalizePublicUrl, sleep, waitUrlFromChild } from "./base.mjs";

export async function startLocaltunnel(localPort) {
  let lt;
  try {
    lt = (await import("localtunnel")).default;
  } catch {
    throw new Error("localtunnel не установлен");
  }

  const tunnel = await Promise.race([
    lt({ port: localPort, local_host: "127.0.0.1" }),
    sleep(25000).then(() => {
      throw new Error("localtunnel: таймаут");
    }),
  ]);

  const url = normalizePublicUrl(tunnel.url);
  if (!url) {
    try {
      tunnel.close();
    } catch {
      /* ignore */
    }
    throw new Error("localtunnel не вернул URL");
  }

  const child = {
    _tunnel: tunnel,
    pid: -1,
    exitCode: null,
    killed: false,
    on(event, cb) {
      if (event === "exit") {
        tunnel.once("close", () => {
          this.exitCode = 0;
          cb(0);
        });
      }
    },
  };
  return { child, url, provider: "localtunnel" };
}

export async function startCloudflare(localPort) {
  const which = spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["cloudflared"],
    { encoding: "utf8", windowsHide: true },
  );
  let bin =
    which.status === 0 ? which.stdout.trim().split(/\r?\n/)[0].trim() : null;
  if (!bin) {
    const c = path.join(
      process.env.LOCALAPPDATA || "",
      "Microsoft/WinGet/Links/cloudflared.exe",
    );
    if (fs.existsSync(c)) bin = c;
  }
  if (!bin) throw new Error("cloudflared не найден");

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/IM", "cloudflared.exe", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  await sleep(400);

  const child = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${localPort}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const url = await waitUrlFromChild(child, 45000);
  return { child, url, provider: "cloudflare" };
}
