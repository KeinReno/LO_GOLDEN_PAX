import { create } from "zustand";
import { apiRequest, fetchTableCatalog, gmAuth, playerAuth } from "../api/client";
import { normalizeGmState, parseViewPayload } from "./normalizeState";
import type {
  CampaignStatePayload,
  MintPlayerTokenResult,
  TableCatalog,
  ViewPayload,
  ViewUnchangedPayload,
} from "./viewTypes";
import type { ShellRoom } from "./shellNav";
import type { TechDirection } from "./viewTypes";

export type HealthStatus = "idle" | "checking" | "ok" | "error";
export type SessionMode = "unauthenticated" | "player" | "gm";

const POLL_MS = 15000;

type LoadPlayerResult =
  | { view: ViewPayload; error: null; unchanged?: false }
  | { view: null; unchanged: true; tableRevision: number; error: null }
  | { view: null; error: string; unchanged?: false };

type WorldState = {
  sessionMode: SessionMode;
  campaignId: string;
  masterToken: string;
  /** Seated faction id — from /view viewer.factionId after login, not login form. */
  factionId: string;
  playerToken: string;

  view: ViewPayload | null;
  catalog: TableCatalog | null;
  loading: boolean;
  error: string | null;
  health: HealthStatus;

  selectedSystemId: string | null;
  selectedForceId: string | null;
  moveForceId: string | null;
  actionRing: { x: number; y: number; forceId: string } | null;
  shellRoom: ShellRoom;

  pollHandle: ReturnType<typeof setInterval> | null;

  loginPlayer: (campaignId: string, playerToken: string) => Promise<void>;
  loginGm: (campaignId: string, masterToken: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  checkHealth: () => Promise<void>;
  mintPlayerToken: (factionId: string, displayName?: string, token?: string) => Promise<MintPlayerTokenResult | null>;
  setSelectedSystemId: (id: string | null) => void;
  setSelectedForceId: (id: string | null) => void;
  setMoveForceId: (id: string | null) => void;
  setActionRing: (ring: { x: number; y: number; forceId: string } | null) => void;
  setShellRoom: (room: ShellRoom) => void;
  moveForce: (forceId: string, toSystemId: string) => Promise<boolean>;
  engageForces: (forceAId: string, forceBId: string) => Promise<boolean>;
  boardForce: (legionForceId: string, targetFleetForceId: string, systemId?: string) => Promise<boolean>;
  runTurn: () => Promise<boolean>;
  setTax: (slot: string, tierId: string) => Promise<boolean>;
  setPeg: (resourceId: string | null) => Promise<boolean>;
  researchTech: (techId: string) => Promise<boolean>;
  rerollTechOffer: (direction: TechDirection) => Promise<boolean>;
  fillTechSocket: (techId: string, resourceId: string) => Promise<boolean>;
  raiseUnit: (
    systemId: string,
    planetId: string,
    body: { defId: string; kind: "ship" | "unit"; count?: number; name?: string },
  ) => Promise<boolean>;
  disbandForce: (forceId: string) => Promise<boolean>;
  colonizePlanet: (systemId: string, planetId: string) => Promise<boolean>;
  buildOnPlanet: (systemId: string, planetId: string, buildingId: string) => Promise<boolean>;
  upgradePlanetGrade: (systemId: string, planetId: string, zone: "surface" | "orbital") => Promise<boolean>;
  seatNpc: (npcId: string, seatId: string) => Promise<boolean>;
  unseatNpc: (npcId: string) => Promise<boolean>;
  assignPosting: (npcId: string, kind: "governor" | "commander" | "admiral", targetId: string) => Promise<boolean>;
  recallPosting: (npcId: string) => Promise<boolean>;
};

function stopPoll(handle: ReturnType<typeof setInterval> | null) {
  if (handle) clearInterval(handle);
}

function sessionAuth(get: () => WorldState) {
  const { sessionMode, masterToken, playerToken } = get();
  return sessionMode === "gm" ? gmAuth(masterToken) : playerAuth(playerToken);
}

function actionFactionId(get: () => WorldState): string | null {
  const { factionId, view } = get();
  if (factionId) return factionId;
  if (view?.viewer.role === "player") return view.viewer.factionId;
  return null;
}

async function postThenRefresh(
  get: () => WorldState,
  set: (partial: Partial<WorldState>) => void,
  path: string,
  body?: unknown,
  validate?: (data: Record<string, unknown>) => boolean,
): Promise<boolean> {
  const { campaignId } = get();
  set({ loading: true, error: null });
  const res = await apiRequest<Record<string, unknown>>(
    `/campaign/${campaignId}${path}`,
    sessionAuth(get),
    { method: "POST", body },
  );
  if (!res.ok) {
    set({ error: res.apiError.error ?? "request_failed", loading: false });
    return false;
  }
  if (validate && !validate(res.data)) {
    set({ error: String(res.data.error ?? "action_failed"), loading: false });
    return false;
  }
  await get().refresh();
  set({ loading: false });
  return true;
}

async function loadPlayerView(
  campaignId: string,
  playerToken: string,
  sinceRevision?: number,
): Promise<LoadPlayerResult> {
  if (!playerToken.trim()) {
    return { view: null, error: "player_token_required" };
  }

  const qs =
    sinceRevision != null && Number.isFinite(sinceRevision)
      ? `?sinceRevision=${sinceRevision}`
      : "";
  const res = await apiRequest<ViewPayload | ViewUnchangedPayload>(
    `/campaign/${campaignId}/view${qs}`,
    playerAuth(playerToken.trim()),
  );

  if (!res.ok) {
    if (res.apiError.status === 403 && res.apiError.error === "not_seated") {
      return { view: null, error: "not_seated" };
    }
    return { view: null, error: res.apiError.error ?? `http_${res.apiError.status}` };
  }

  const data = res.data as unknown as Record<string, unknown>;
  if (data.unchanged === true) {
    return {
      view: null,
      unchanged: true,
      tableRevision: Number(data.tableRevision) || 0,
      error: null,
    };
  }

  return { view: parseViewPayload(data), error: null };
}

async function loadGmView(
  campaignId: string,
  masterToken: string,
): Promise<{ view: ViewPayload | null; error: string | null }> {
  const res = await apiRequest<CampaignStatePayload>(
    `/campaign/${campaignId}/state`,
    gmAuth(masterToken),
  );
  if (!res.ok) {
    return { view: null, error: res.apiError.error ?? `http_${res.apiError.status}` };
  }
  return { view: normalizeGmState(res.data), error: null };
}

export const useWorldStore = create<WorldState>((set, get) => ({
  sessionMode: "unauthenticated",
  campaignId: "",
  masterToken: "",
  factionId: "",
  playerToken: "",
  view: null,
  catalog: null,
  loading: false,
  error: null,
  health: "idle",
  selectedSystemId: null,
  selectedForceId: null,
  moveForceId: null,
  actionRing: null,
  shellRoom: "map",
  pollHandle: null,

  setSelectedSystemId: (id) =>
    set({ selectedSystemId: id, ...(id ? { shellRoom: "map" as ShellRoom } : {}) }),
  setSelectedForceId: (id) => set({ selectedForceId: id }),
  setMoveForceId: (id) => set({ moveForceId: id }),
  setActionRing: (ring) => set({ actionRing: ring }),
  setShellRoom: (room) => set({ shellRoom: room }),

  checkHealth: async () => {
    set({ health: "checking" });
    try {
      const res = await fetch("/api/health");
      set({ health: res.ok ? "ok" : "error" });
    } catch {
      set({ health: "error" });
    }
  },

  logout: () => {
    const { pollHandle } = get();
    stopPoll(pollHandle);
    set({
      sessionMode: "unauthenticated",
      view: null,
      catalog: null,
      error: null,
      pollHandle: null,
      selectedSystemId: null,
      selectedForceId: null,
      moveForceId: null,
      actionRing: null,
      shellRoom: "map",
      factionId: "",
      playerToken: "",
    });
  },

  refresh: async () => {
    const { sessionMode, campaignId, playerToken, masterToken, view } = get();
    if (sessionMode === "unauthenticated" || !campaignId) return;

    set({ loading: true });

    if (sessionMode === "player") {
      const since = view?.tableRevision;
      const result = await loadPlayerView(campaignId, playerToken, since);
      if ("unchanged" in result && result.unchanged) {
        set({ loading: false, error: null });
        return;
      }
      if (result.view) {
        const factionId =
          result.view.viewer.role === "player" ? result.view.viewer.factionId : "";
        set({
          view: result.view,
          factionId,
          error: null,
          loading: false,
        });
      } else {
        set({ error: result.error, loading: false });
      }
      return;
    }

    const result = await loadGmView(campaignId, masterToken);
    if (result.view) {
      set({ view: result.view, error: null, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },

  loginPlayer: async (campaignId, playerToken) => {
    const { pollHandle } = get();
    stopPoll(pollHandle);
    set({
      sessionMode: "player",
      campaignId,
      playerToken: playerToken.trim(),
      factionId: "",
      loading: true,
      error: null,
      view: null,
      catalog: null,
    });

    const [result, catalogRes] = await Promise.all([
      loadPlayerView(campaignId, playerToken),
      fetchTableCatalog(playerAuth(playerToken.trim())),
    ]);
    if (!result.view) {
      set({
        loading: false,
        error: result.error ?? "login_failed",
        sessionMode: "unauthenticated",
      });
      return;
    }

    const handle = setInterval(() => get().refresh(), POLL_MS);
    set({
      view: result.view,
      catalog: catalogRes.ok ? catalogRes.data : null,
      factionId: result.view.viewer.role === "player" ? result.view.viewer.factionId : "",
      loading: false,
      error: catalogRes.ok ? null : (catalogRes.apiError.error ?? "catalog_unavailable"),
      pollHandle: handle,
    });
  },

  loginGm: async (campaignId, masterToken) => {
    const { pollHandle } = get();
    stopPoll(pollHandle);
    set({
      sessionMode: "gm",
      campaignId,
      masterToken,
      loading: true,
      error: null,
      view: null,
      catalog: null,
    });

    const [result, catalogRes] = await Promise.all([
      loadGmView(campaignId, masterToken),
      fetchTableCatalog(gmAuth(masterToken)),
    ]);
    if (!result.view) {
      set({
        loading: false,
        error: result.error ?? "login_failed",
        sessionMode: "unauthenticated",
      });
      return;
    }

    const handle = setInterval(() => get().refresh(), POLL_MS);
    set({
      view: result.view,
      catalog: catalogRes.ok ? catalogRes.data : null,
      loading: false,
      error: catalogRes.ok ? null : (catalogRes.apiError.error ?? "catalog_unavailable"),
      pollHandle: handle,
    });
  },

  mintPlayerToken: async (factionId, displayName, token) => {
    const { campaignId, masterToken } = get();
    const body: { displayName?: string; token?: string } = {};
    if (displayName) body.displayName = displayName;
    if (token) body.token = token;
    const res = await apiRequest<MintPlayerTokenResult>(
      `/campaign/${campaignId}/factions/${factionId}/player-token`,
      gmAuth(masterToken),
      { method: "POST", body },
    );
    if (!res.ok) {
      set({ error: res.apiError.error ?? "mint_failed" });
      return null;
    }
    return res.data;
  },

  moveForce: async (forceId, toSystemId) => {
    const { campaignId } = get();
    const res = await apiRequest<{ ok: boolean; error?: string }>(
      `/campaign/${campaignId}/forces/${forceId}/move`,
      sessionAuth(get),
      { method: "POST", body: { toSystemId } },
    );
    if (!res.ok || !res.data.ok) {
      set({ error: res.ok ? res.data.error ?? "move_failed" : res.apiError.error ?? "move_failed" });
      return false;
    }
    await get().refresh();
    return true;
  },

  engageForces: async (forceAId, forceBId) => {
    const { campaignId } = get();
    const res = await apiRequest<{ ok: boolean; error?: string }>(
      `/campaign/${campaignId}/forces/${forceAId}/engage`,
      sessionAuth(get),
      { method: "POST", body: { forceBId } },
    );
    if (!res.ok || !res.data.ok) {
      set({
        error: res.ok ? res.data.error ?? "engage_failed" : res.apiError.error ?? "engage_failed",
      });
      return false;
    }
    await get().refresh();
    return true;
  },

  boardForce: async (legionForceId, targetFleetForceId, systemId) => {
    const { campaignId } = get();
    const body: { targetFleetForceId: string; systemId?: string } = { targetFleetForceId };
    if (systemId) body.systemId = systemId;
    const res = await apiRequest<{ ok: boolean; error?: string }>(
      `/campaign/${campaignId}/forces/${legionForceId}/board`,
      sessionAuth(get),
      { method: "POST", body },
    );
    if (!res.ok || !res.data.ok) {
      set({ error: res.ok ? res.data.error ?? "board_failed" : res.apiError.error ?? "board_failed" });
      return false;
    }
    await get().refresh();
    return true;
  },

  runTurn: async () => {
    const { campaignId, masterToken } = get();
    const res = await apiRequest<{ turn: number }>(
      `/campaign/${campaignId}/turn`,
      gmAuth(masterToken),
      { method: "POST", body: { factionInputs: {} } },
    );
    if (!res.ok) {
      set({ error: res.apiError.error ?? "turn_failed" });
      return false;
    }
    await get().refresh();
    return true;
  },

  setTax: async (slot, tierId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/taxes`, { slot, tierId });
  },

  setPeg: async (resourceId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/peg`, { resourceId });
  },

  researchTech: async (techId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(
      get,
      set,
      `/factions/${fid}/research`,
      { techId },
      (d) => d.ok !== false,
    );
  },

  rerollTechOffer: async (direction) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(
      get,
      set,
      `/factions/${fid}/tech/offers/${direction}/reroll`,
      {},
      (d) => d.ok !== false,
    );
  },

  fillTechSocket: async (techId, resourceId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(
      get,
      set,
      `/factions/${fid}/tech/${techId}/fill-socket`,
      { resourceId },
      (d) => d.ok !== false,
    );
  },

  raiseUnit: async (systemId, planetId, body) => {
    return postThenRefresh(
      get,
      set,
      `/systems/${systemId}/planets/${planetId}/forces`,
      body,
      (d) => d.ok !== false,
    );
  },

  disbandForce: async (forceId) => {
    return postThenRefresh(
      get,
      set,
      `/forces/${forceId}/disband`,
      {},
      (d) => d.ok !== false,
    );
  },

  colonizePlanet: async (systemId, planetId) => {
    return postThenRefresh(
      get,
      set,
      `/systems/${systemId}/planets/${planetId}/colonize`,
      { mode: "auto", colonyType: "outpost" },
      (d) => d.ok !== false,
    );
  },

  buildOnPlanet: async (systemId, planetId, buildingId) => {
    return postThenRefresh(
      get,
      set,
      `/systems/${systemId}/planets/${planetId}/build`,
      { buildingId },
      (d) => d.ok !== false,
    );
  },

  upgradePlanetGrade: async (systemId, planetId, zone) => {
    return postThenRefresh(
      get,
      set,
      `/systems/${systemId}/planets/${planetId}/upgrade-grade`,
      { zone },
      (d) => d.ok !== false,
    );
  },

  seatNpc: async (npcId, seatId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/npcs/${npcId}/seat`, { seatId });
  },

  unseatNpc: async (npcId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/npcs/${npcId}/unseat`, {});
  },

  assignPosting: async (npcId, kind, targetId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/npcs/${npcId}/posting`, { kind, targetId });
  },

  recallPosting: async (npcId) => {
    const fid = actionFactionId(get);
    if (!fid) {
      set({ error: "not_seated" });
      return false;
    }
    return postThenRefresh(get, set, `/factions/${fid}/npcs/${npcId}/posting/recall`, {});
  },
}));
