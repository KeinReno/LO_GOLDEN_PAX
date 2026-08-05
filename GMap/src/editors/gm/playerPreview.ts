/**
 * Build /view URL for GM local/LAN player preview (auto-login via query).
 */
export function buildPlayerViewPath(factionId: string, password: string): string {
  const q = new URLSearchParams({
    f: factionId,
    p: password,
    auto: "1",
  });
  return `/view?${q.toString()}`;
}

export function buildPlayerViewUrl(
  factionId: string,
  password: string,
  origin?: string,
): string {
  const base = (origin || window.location.origin).replace(/\/$/, "");
  return `${base}${buildPlayerViewPath(factionId, password)}`;
}

function isPrivateIpv4(host: string): boolean {
  if (host === "localhost" || host === "127.0.0.1") return false;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isLinkLocalIpv4(host: string): boolean {
  return /^169\.254\./.test(host);
}

/** Rank LAN candidates: home Wi‑Fi first, then 10., then 172.x (often WSL/Docker). */
function pickBestLanIp(ips: string[]): string | null {
  const clean = ips.filter((ip) => isPrivateIpv4(ip) && !isLinkLocalIpv4(ip));
  if (!clean.length) return null;
  const score = (ip: string) => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    return 2;
  };
  return [...clean].sort((a, b) => score(a) - score(b))[0] ?? null;
}

/** Prefer LAN/direct host for phones on the same Wi‑Fi. */
export function resolveLanOrigin(
  directViewUrl: string | null | undefined,
  endpointIp?: string | null,
  lanIps?: string[] | null,
): string | null {
  try {
    const here = new URL(window.location.href);
    if (isPrivateIpv4(here.hostname)) return here.origin;
  } catch {
    /* ignore */
  }

  const port = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  const proto = window.location.protocol || "http:";

  const best = pickBestLanIp(lanIps ?? []);
  if (best) return `${proto}//${best}:${port}`;

  if (endpointIp && isPrivateIpv4(endpointIp) && !isLinkLocalIpv4(endpointIp)) {
    return `${proto}//${endpointIp}:${port}`;
  }

  if (directViewUrl) {
    try {
      const u = new URL(directViewUrl);
      if (isPrivateIpv4(u.hostname) && !isLinkLocalIpv4(u.hostname)) {
        return `${proto}//${u.hostname}:${port}`;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

/** Fetch host LAN IPs from API (same Wi‑Fi phone preview). */
export async function fetchLanIps(): Promise<string[]> {
  try {
    const res = await fetch("/api/lan");
    if (!res.ok) return [];
    const data = (await res.json()) as { ips?: string[] };
    return Array.isArray(data.ips) ? data.ips.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function openPlayerPreview(opts: {
  factionId: string;
  password: string;
  /** local = current origin; lan = direct/LAN origin if known */
  mode: "local" | "lan";
  lanOrigin?: string | null;
}): void {
  const origin =
    opts.mode === "lan" && opts.lanOrigin
      ? opts.lanOrigin
      : window.location.origin;
  const url = buildPlayerViewUrl(opts.factionId, opts.password, origin);
  window.open(url, "_blank", "noopener,noreferrer");
}
