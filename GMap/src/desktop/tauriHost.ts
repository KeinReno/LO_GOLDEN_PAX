/** Thin bridge to Tauri host commands (P8.6). No-op in browser.

 * Uses the global API injected by `withGlobalTauri` — avoid dynamic
 * `import("@tauri-apps/api/...")` (breaks Vite dep prebundle in WebView).
 */

export type HostStatus = {
  running: boolean;
  port: number;
  url: string;
  viewUrl: string;
  root: string;
  pid?: number | null;
  desktop: boolean;
  lastError?: string | null;
};

type TauriInvoke = <T>(
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<T>;

type TauriGlobals = {
  __TAURI_INTERNALS__?: { invoke?: TauriInvoke };
  __TAURI__?: { core?: { invoke?: TauriInvoke } };
};

function tauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as TauriGlobals;
  return (
    w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.core?.invoke ?? null
  );
}

export function isDesktopApp(): boolean {
  return tauriInvoke() !== null;
}

async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const inv = tauriInvoke();
  if (!inv) throw new Error("Не в Tauri desktop");
  return inv<T>(cmd, args);
}

export async function getHostStatus(): Promise<HostStatus | null> {
  if (!isDesktopApp()) return null;
  try {
    return await invoke<HostStatus>("host_status");
  } catch {
    return null;
  }
}

export async function startHost(): Promise<HostStatus | null> {
  if (!isDesktopApp()) return null;
  return invoke<HostStatus>("start_host");
}

export async function stopHost(): Promise<HostStatus | null> {
  if (!isDesktopApp()) return null;
  return invoke<HostStatus>("stop_host");
}

export async function openDataFolder(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  return invoke<string>("open_data_folder");
}
