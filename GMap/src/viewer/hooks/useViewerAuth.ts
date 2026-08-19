import { useCallback, useEffect, useRef, useState } from "react";
import { clearPlayerToken } from "../../state/playerAuth";
import type { ViewerPayload } from "../../state/types";
import type { MapStyleId } from "../../renderers/styles/mapTheme";
import { readStoredViewerMapStyle } from "../../ui/mapStylePrefs";
import {
  defaultPerfForDevice,
  readStoredPerf,
  type FactionOption,
  type PerfMode,
} from "../viewerSessionPrefs";
import { getPlayerJson, postPlayerJson } from "../../state/playerActionClient";
import {
  formatFactionsLoadError,
  parseAutoLoginQuery,
} from "./viewerAuthParse";

export {
  formatFactionsLoadError,
  parseAutoLoginQuery,
  stripLoginQuery,
} from "./viewerAuthParse";

export async function fetchViewerLogin(
  factionId: string | undefined,
  password: string,
): Promise<ViewerPayload & { updatedAt?: string | null; playerToken?: string }> {
  const body: Record<string, string> = { password };
  if (factionId) body.factionId = factionId;
  const { ok, status, data } = await postPlayerJson("/api/login", body);
  if (!ok) {
    throw new Error(data.error || `HTTP ${status}`);
  }
  return data as ViewerPayload & {
    updatedAt?: string | null;
    playerToken?: string;
  };
}

export function useViewerAuth() {
  const [factions, setFactions] = useState<FactionOption[]>([]);
  const [factionId, setFactionId] = useState("");
  const [password, setPassword] = useState("");
  const [loginPerf, setLoginPerf] = useState<PerfMode>(
    () => readStoredPerf() ?? defaultPerfForDevice(),
  );
  const [loginMapStyle, setLoginMapStyle] = useState<MapStyleId>(
    () => readStoredViewerMapStyle(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const credsRef = useRef({ factionId: "", password: "" });
  const sessionGenRef = useRef(0);

  const loadFactions = useCallback(async () => {
    setError(null);
    try {
      const { ok, status, data } = await getPlayerJson("/api/factions");
      if (!ok) {
        throw new Error(data.error || `HTTP ${status}`);
      }
      const list = (
        Array.isArray(data) ? data : []
      ) as unknown as FactionOption[];
      setFactions(list);
      if (list[0]) setFactionId(list[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(formatFactionsLoadError(msg));
    }
  }, []);

  useEffect(() => {
    void loadFactions();
  }, [loadFactions]);

  const bumpSession = useCallback(() => {
    sessionGenRef.current += 1;
  }, []);

  const logoutLocal = useCallback(() => {
    bumpSession();
    credsRef.current = { factionId: "", password: "" };
    clearPlayerToken();
    setPassword("");
  }, [bumpSession]);

  return {
    factions,
    factionId,
    password,
    loginPerf,
    loginMapStyle,
    error,
    isLoggingIn,
    setIsLoggingIn,
    setFactionId,
    setPassword,
    setLoginPerf,
    setLoginMapStyle,
    setError,
    credsRef,
    sessionGenRef,
    loadFactions,
    logoutLocal,
    bumpSession,
  };
}

export function useViewerAutoLogin(opts: {
  payload: unknown;
  setFactionId: (id: string) => void;
  setPassword: (pw: string) => void;
  login: (override: { factionId: string; password: string }) => void;
}) {
  const autoLoginDoneRef = useRef(false);
  const loginRef = useRef(opts.login);
  loginRef.current = opts.login;
  useEffect(() => {
    if (opts.payload || autoLoginDoneRef.current) return;
    try {
      const parsed = parseAutoLoginQuery(window.location.search);
      if (!parsed) return;
      if (!parsed.auto) {
        opts.setFactionId(parsed.factionId);
        opts.setPassword(parsed.password);
        return;
      }
      autoLoginDoneRef.current = true;
      loginRef.current({
        factionId: parsed.factionId,
        password: parsed.password,
      });
    } catch {
      /* ignore */
    }
  }, [opts.payload, opts.setFactionId, opts.setPassword]);
}
