/** Thin bridge to Tauri host commands (P8.6). No-op in browser. */

export type HostStatus = {
  running: boolean;
  port: number;
  url: string;
  viewUrl: string;
  root: string;
  pid?: number | null;
  desktop: boolean;
};

function hasTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv<T>(cmd, args);
}

export function isDesktopApp(): boolean {
  return hasTauri();
}

export async function getHostStatus(): Promise<HostStatus | null> {
  if (!hasTauri()) return null;
  try {
    return await invoke<HostStatus>("host_status");
  } catch {
    return null;
  }
}

export async function startHost(): Promise<HostStatus | null> {
  if (!hasTauri()) return null;
  return invoke<HostStatus>("start_host");
}

export async function stopHost(): Promise<HostStatus | null> {
  if (!hasTauri()) return null;
  return invoke<HostStatus>("stop_host");
}

export async function openDataFolder(): Promise<string | null> {
  if (!hasTauri()) return null;
  return invoke<string>("open_data_folder");
}
