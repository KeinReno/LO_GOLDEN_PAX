import { useEffect, useRef, useState, useCallback } from "react";
import { useWorldStore } from "../state/worldStore";
import {
  downloadBlob,
  exportWorldStateJson,
} from "../io/campaignIo";
import {
  getDraftMeta,
  getLastSavedAt,
  isDirty,
  loadDraft,
  markSaved,
  saveDraft,
  type DraftMeta,
} from "../io/draftPersist";
import { DEFAULT_MASTER_TOKEN } from "../state/defaults";
import { fetchContent } from "../state/contentCatalog";

function slug(name: string): string {
  return name.replace(/[^\wа-яё\-]+/gi, "_").slice(0, 40) || "campaign";
}

export function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Shared save / share / draft helpers for TopBar + Toolbar. */
export function useCampaignSession() {
  const world = useWorldStore((s) => s.world);
  const loadWorld = useWorldStore((s) => s.loadWorld);

  const [masterToken, setMasterToken] = useState(DEFAULT_MASTER_TOKEN);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [draftMeta, setDraftMeta] = useState<DraftMeta | null>(() =>
    getDraftMeta(),
  );
  const [dirtyTick, setDirtyTick] = useState(0);
  const bootDone = useRef(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareViewUrl, setShareViewUrl] = useState<string | null>(null);
  const [shareLastViewUrl, setShareLastViewUrl] = useState<string | null>(null);
  const [shareProvider, setShareProvider] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [shareEndpointIp, setShareEndpointIp] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    "idle" | "starting" | "online" | "degraded" | "down"
  >("idle");
  const [shareHealthOk, setShareHealthOk] = useState<boolean | null>(null);
  const [shareLastHealthAt, setShareLastHealthAt] = useState<string | null>(
    null,
  );
  const [shareLastHealthError, setShareLastHealthError] = useState<
    string | null
  >(null);
  const [shareDownSince, setShareDownSince] = useState<string | null>(null);
  const [shareLinkChanged, setShareLinkChanged] = useState(false);
  const [shareAutoRefresh, setShareAutoRefresh] = useState(() => {
    try {
      return localStorage.getItem("gmap-share-auto-refresh") !== "0";
    } catch {
      return true;
    }
  });
  const [shareWanIp, setShareWanIp] = useState<string | null>(null);
  const [shareDirectViewUrl, setShareDirectViewUrl] = useState<string | null>(
    null,
  );
  const [shareDirectHint, setShareDirectHint] = useState<string | null>(null);
  const [shareDirectCopied, setShareDirectCopied] = useState(false);
  const [hasCloudPubToken, setHasCloudPubToken] = useState(true);
  const [hasCloudPubCli, setHasCloudPubCli] = useState(true);
  const [cloudpubTokenInput, setCloudpubTokenInput] = useState("");
  const shareAbortRef = useRef<AbortController | null>(null);
  const prevShareStatusRef = useRef<string>("idle");
  const shareViewUrlRef = useRef<string | null>(null);
  const lastAutoRestartRef = useRef(0);

  type ShareApi = {
    active?: boolean;
    status?: "idle" | "starting" | "online" | "degraded" | "down";
    healthOk?: boolean | null;
    viewUrl?: string | null;
    lastViewUrl?: string | null;
    provider?: string | null;
    playerHint?: string | null;
    endpointIp?: string | null;
    hasCloudPubToken?: boolean;
    hasCloudPubCli?: boolean;
    error?: string | null;
    lastHealthAt?: string | null;
    lastHealthError?: string | null;
    downSince?: string | null;
    wanIp?: string | null;
    directViewUrl?: string | null;
    directHint?: string | null;
    urlRotated?: boolean;
    previousViewUrl?: string | null;
  };

  const applyShareStatus = useCallback((data: ShareApi) => {
    if (typeof data.hasCloudPubToken === "boolean") {
      setHasCloudPubToken(data.hasCloudPubToken);
    }
    if (typeof data.hasCloudPubCli === "boolean") {
      setHasCloudPubCli(data.hasCloudPubCli);
    }
    const status = data.status ?? (data.active ? "online" : "idle");
    setShareStatus(status);
    setShareHealthOk(
      typeof data.healthOk === "boolean" ? data.healthOk : null,
    );
    setShareLastHealthAt(data.lastHealthAt ?? null);
    setShareLastHealthError(data.lastHealthError ?? null);
    setShareDownSince(data.downSince ?? null);
    setShareProvider(data.provider ?? null);
    setShareHint(data.playerHint ?? null);
    setShareEndpointIp(data.endpointIp ?? null);
    setShareWanIp(data.wanIp ?? null);
    setShareDirectViewUrl(data.directViewUrl ?? null);
    setShareDirectHint(data.directHint ?? null);
    if (data.error) setShareError(data.error);
    else if (status === "online") setShareError(null);

    const nextUrl =
      status === "idle" && !data.active
        ? null
        : (data.viewUrl ?? data.lastViewUrl ?? null);
    setShareLastViewUrl(data.lastViewUrl ?? data.viewUrl ?? null);
    if (
      (nextUrl &&
        shareViewUrlRef.current &&
        nextUrl !== shareViewUrlRef.current &&
        status === "online") ||
      data.urlRotated
    ) {
      setShareLinkChanged(true);
      setShareCopied(false);
      if (data.urlRotated || (nextUrl && nextUrl !== shareViewUrlRef.current)) {
        setSyncMsg(
          `Ссылка для игроков обновилась — скопируй и раздай снова${
            nextUrl ? `: ${nextUrl}` : ""
          }`,
        );
      }
    }
    shareViewUrlRef.current = nextUrl;
    setShareViewUrl(nextUrl);
  }, []);

  const dirty = isDirty(world);
  void dirtyTick;

  useEffect(() => {
    if (world.systems.length === 0) return;
    const t = window.setTimeout(() => {
      const meta = saveDraft(world);
      markSaved(meta.savedAt);
      setDraftMeta(meta);
      setDirtyTick((n) => n + 1);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [world]);

  useEffect(() => {
    if (bootDone.current) return;
    bootDone.current = true;
    let cancelled = false;
    void (async () => {
      // Prefer live server board (P0 SoT); fall back to local draft.
      try {
        const res = await fetch("/api/table", {
          headers: { "X-Master-Token": masterToken },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            mode?: string;
            world?: typeof world;
            version?: { tableRevision?: number };
          };
          if (!cancelled && data.world && (data.world.systems?.length ?? 0) > 0) {
            loadWorld(data.world);
            markSaved(data.world.meta?.updatedAt ?? new Date().toISOString());
            setDraftMeta(getDraftMeta());
            setSyncMsg(null);
            return;
          }
        }
      } catch {
        /* offline / no API */
      }
      if (cancelled) return;
      const draft = loadDraft();
      const meta = getDraftMeta();
      if (!draft || !meta || meta.systems < 1) return;
      loadWorld(draft);
      markSaved(meta.savedAt);
      setDraftMeta(meta);
      setSyncMsg(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadWorld, masterToken]);

  useEffect(() => {
    (
      window as unknown as { __GMAP_MASTER_TOKEN?: string }
    ).__GMAP_MASTER_TOKEN = masterToken;
    (
      window as unknown as { __GMAP_SYNC_MSG?: (msg: string) => void }
    ).__GMAP_SYNC_MSG = setSyncMsg;
  }, [masterToken, setSyncMsg]);

  useEffect(() => {
    let cancelled = false;
    const loadFog = (fac: string | null) => {
      if (!fac) return;
      void (async () => {
        try {
          const res = await fetch("/api/fog", {
            headers: { "X-Master-Token": masterToken },
          });
          if (!res.ok || cancelled) return;
          const fog = (await res.json()) as { masks?: Record<string, string[]> };
          useWorldStore
            .getState()
            .setFogMaskPreview(fog.masks?.[fac] ?? []);
        } catch {
          /* ignore */
        }
      })();
    };
    loadFog(useWorldStore.getState().activeFactionId);
    let prevFac = useWorldStore.getState().activeFactionId;
    const unsub = useWorldStore.subscribe((s) => {
      if (s.activeFactionId !== prevFac) {
        prevFac = s.activeFactionId;
        loadFog(s.activeFactionId);
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [masterToken, world.meta.tableRevision]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/players/share", {
          headers: { "X-Master-Token": masterToken },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ShareApi;
        if (!cancelled) applyShareStatus(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyShareStatus, masterToken]);

  // Poll tunnel health while share session is known (online / reconnecting / down).
  useEffect(() => {
    const watching =
      shareBusy ||
      shareStatus === "online" ||
      shareStatus === "degraded" ||
      shareStatus === "down" ||
      shareStatus === "starting" ||
      !!shareViewUrl ||
      !!shareLastViewUrl;
    if (!watching) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/players/share", {
          headers: { "X-Master-Token": masterToken },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ShareApi;
        if (!cancelled) applyShareStatus(data);
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    applyShareStatus,
    shareBusy,
    shareStatus,
    shareViewUrl,
    shareLastViewUrl,
    masterToken,
  ]);

  // Toast on tunnel drop; do not steal the map with the share popover.
  useEffect(() => {
    const prev = prevShareStatusRef.current;
    prevShareStatusRef.current = shareStatus;
    if (shareStatus === "online" && (prev === "down" || prev === "degraded")) {
      setSyncMsg(null);
      return;
    }
    if (
      (shareStatus === "down" || shareStatus === "degraded") &&
      prev !== shareStatus &&
      prev !== "idle"
    ) {
      setSyncMsg(
        shareStatus === "degraded"
          ? "Туннель переподключается…"
          : "Туннель упал — перезапусти и выдай новую ссылку",
      );
    }
  }, [shareStatus]);

  const rememberSave = useCallback(() => {
    markSaved(world.meta.updatedAt);
    setDraftMeta(saveDraft(world));
    setDirtyTick((n) => n + 1);
  }, [world]);

  const openForPlayers = async (opts?: { reveal?: boolean }) => {
    if (shareBusy) return;
    shareAbortRef.current?.abort();
    const ac = new AbortController();
    shareAbortRef.current = ac;
    setShareBusy(true);
    setShareError(null);
    setShareCopied(false);
    setShareLinkChanged(false);
    if (opts?.reveal !== false) setShareOpen(true);
    setShareStatus("starting");
    const killTimer = window.setTimeout(() => ac.abort(), 100_000);
    try {
      const tokenToSend = cloudpubTokenInput.trim();
      const res = await fetch("/api/players/share", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          world,
          force: true,
          prefer: "cloudpub",
          ...(tokenToSend ? { cloudpubToken: tokenToSend } : {}),
        }),
      });
      const data = (await res.json()) as ShareApi & {
        ok?: boolean;
        error?: string;
      };
      applyShareStatus(data);
      if (!res.ok || !(data.viewUrl || data.lastViewUrl)) {
        throw new Error(data.error || "Не удалось открыть доступ");
      }
      if (tokenToSend) {
        setCloudpubTokenInput("");
        setHasCloudPubToken(true);
      }
      setShareLinkChanged(true);
      setSyncMsg(
        `Открыто (${data.provider ?? "туннель"}). Скопируй ссылку игрокам.`,
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setShareError("Прервано или слишком долго — нажми ещё раз");
        setShareStatus("down");
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setShareError(msg);
        setSyncMsg(msg);
        setShareStatus("down");
      }
    } finally {
      window.clearTimeout(killTimer);
      if (shareAbortRef.current === ac) shareAbortRef.current = null;
      setShareBusy(false);
    }
  };

  const restartShare = async () => {
    setShareLinkChanged(false);
    await openForPlayers({ reveal: false });
  };

  /** Soft→hard auto refresh when tunnel stays down (503 / agent offline). */
  useEffect(() => {
    if (!shareAutoRefresh) return;
    if (shareStatus !== "down" || shareBusy) return;
    const t = window.setTimeout(() => {
      const now = Date.now();
      if (now - lastAutoRestartRef.current < 45_000) return;
      lastAutoRestartRef.current = now;
      setSyncMsg("Автообновление ссылки для игроков…");
      void restartShare();
    }, 10_000);
    return () => window.clearTimeout(t);
  }, [shareStatus, shareBusy, shareAutoRefresh]);

  const setShareAutoRefreshPersist = (on: boolean) => {
    setShareAutoRefresh(on);
    try {
      localStorage.setItem("gmap-share-auto-refresh", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const copyShareLink = async () => {
    const url = shareViewUrl || shareLastViewUrl;
    if (!url) return;
    const parts = [url];
    if (shareDirectViewUrl && shareDirectViewUrl !== url) {
      parts.push(`Запасной прямой доступ:\n${shareDirectViewUrl}`);
    }
    if (shareEndpointIp) {
      parts.push(
        `На жёлтой странице loca.lt в поле IP введи: ${shareEndpointIp}\nПотом Continue — откроется карта.`,
      );
    }
    const text = parts.join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setShareLinkChanged(false);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareError("Не удалось скопировать — выдели ссылку вручную");
    }
  };

  const copyDirectLink = async () => {
    if (!shareDirectViewUrl) return;
    try {
      await navigator.clipboard.writeText(shareDirectViewUrl);
      setShareDirectCopied(true);
      window.setTimeout(() => setShareDirectCopied(false), 2000);
    } catch {
      setShareError("Не удалось скопировать прямой IP");
    }
  };

  const stopShare = async () => {
    try {
      await fetch("/api/players/share/stop", {
        method: "POST",
        headers: { "X-Master-Token": masterToken },
      });
    } catch {
      /* ignore */
    }
    setShareViewUrl(null);
    setShareLastViewUrl(null);
    setShareProvider(null);
    setShareHint(null);
    setShareEndpointIp(null);
    setShareWanIp(null);
    setShareDirectViewUrl(null);
    setShareDirectHint(null);
    setShareStatus("idle");
    setShareHealthOk(null);
    setShareLastHealthAt(null);
    setShareLastHealthError(null);
    setShareDownSince(null);
    setShareLinkChanged(false);
    setShareError(null);
    setSyncMsg("Доступ для игроков закрыт");
  };

  const onDownloadMap = () => {
    downloadBlob(exportWorldStateJson(world), `${slug(world.meta.name)}.json`);
    rememberSave();
    setSyncMsg("Скачан JSON карты");
  };

  const onSaveToServer = async () => {
    setSyncMsg("Сохранение кампании…");
    try {
      const res = await fetch("/api/save-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify(world),
      });
      const data = (await res.json()) as {
        error?: string;
        systems?: number;
        paths?: string[];
        published?: boolean;
        updatedAt?: string;
        tableRevision?: number;
        turn?: number;
      };
      if (!res.ok) throw new Error(data.error || res.statusText);
      rememberSave();
      if (typeof data.tableRevision === "number" && world.meta) {
        loadWorld({
          ...world,
          meta: {
            ...world.meta,
            tableRevision: data.tableRevision,
            updatedAt: data.updatedAt ?? world.meta.updatedAt,
            turn: data.turn ?? world.meta.turn,
          },
        });
      }
      setSyncMsg(
        data.published
          ? `Live · ${data.systems} систем · ход ${data.turn} · rev ${data.tableRevision}`
          : `Сохранено: ${data.systems} систем`,
      );
    } catch (e) {
      setSyncMsg(
        e instanceof Error
          ? `${e.message} (нужен npm run dev; иначе скачай JSON)`
          : String(e),
      );
    }
  };

  /** Save world + reload content packs + bump rev so GM and players see the build. */
  const onApplyBuild = async () => {
    setSyncMsg("Применяю билд к столу…");
    try {
      const saveRes = await fetch("/api/save-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify(useWorldStore.getState().world),
      });
      const saveData = (await saveRes.json()) as {
        error?: string;
        updatedAt?: string;
        tableRevision?: number;
        turn?: number;
      };
      if (!saveRes.ok) throw new Error(saveData.error || saveRes.statusText);
      rememberSave();
      const afterSave = useWorldStore.getState().world;
      if (typeof saveData.tableRevision === "number" && afterSave.meta) {
        loadWorld({
          ...afterSave,
          meta: {
            ...afterSave.meta,
            tableRevision: saveData.tableRevision,
            updatedAt: saveData.updatedAt ?? afterSave.meta.updatedAt,
            turn: saveData.turn ?? afterSave.meta.turn,
          },
        });
      }

      const res = await fetch("/api/gm/apply-build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ reloadContent: true }),
      });
      const data = (await res.json()) as {
        error?: string;
        tableRevision?: number;
        updatedAt?: string;
        contentPacks?: number;
      };
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchContent(true);
      const cur = useWorldStore.getState().world;
      if (typeof data.tableRevision === "number" && cur.meta) {
        loadWorld({
          ...cur,
          meta: {
            ...cur.meta,
            tableRevision: data.tableRevision,
            updatedAt: data.updatedAt ?? cur.meta.updatedAt,
          },
        });
      }
      setSyncMsg(
        `Билд применён · rev ${data.tableRevision} · packs ${data.contentPacks ?? "ok"}. Игроки подтянут на /view.`,
      );
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onAdvanceTurn = async () => {
    setSyncMsg("Закрытие хода…");
    try {
      const res = await fetch("/api/turn/tick", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        turn?: number;
        tableRevision?: number;
        world?: typeof world;
        journal?: { events?: unknown[] };
      };
      if (!res.ok || !data.ok) throw new Error(data.error || res.statusText);
      if (data.world) {
        loadWorld(data.world);
        markSaved(data.world.meta?.updatedAt ?? new Date().toISOString());
      } else {
        const t = await fetch("/api/table", {
          headers: { "X-Master-Token": masterToken },
        });
        if (t.ok) {
          const payload = (await t.json()) as { world?: typeof world };
          if (payload.world) loadWorld(payload.world);
        }
      }
      const n = data.journal?.events?.length ?? 0;
      setSyncMsg(
        `Ход → ${data.turn} · rev ${data.tableRevision} · событий ${n}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncMsg(msg);
      throw e;
    }
  };

  const lastSaved = getLastSavedAt();

  return {
    world,
    dirty,
    draftMeta,
    setDraftMeta,
    lastSaved,
    syncMsg,
    setSyncMsg,
    masterToken,
    setMasterToken,
    rememberSave,
    onSaveToServer,
    onApplyBuild,
    onAdvanceTurn,
    onDownloadMap,
    shareBusy,
    shareViewUrl,
    shareLastViewUrl,
    shareProvider,
    shareHint,
    shareEndpointIp,
    shareError,
    shareCopied,
    shareOpen,
    setShareOpen,
    shareStatus,
    shareHealthOk,
    shareLastHealthAt,
    shareLastHealthError,
    shareDownSince,
    shareLinkChanged,
    shareAutoRefresh,
    setShareAutoRefresh: setShareAutoRefreshPersist,
    shareWanIp,
    shareDirectViewUrl,
    shareDirectHint,
    shareDirectCopied,
    shareAbortRef,
    openForPlayers,
    restartShare,
    copyShareLink,
    copyDirectLink,
    stopShare,
    setShareBusy,
    hasCloudPubToken,
    hasCloudPubCli,
    cloudpubTokenInput,
    setCloudpubTokenInput,
  };
}
