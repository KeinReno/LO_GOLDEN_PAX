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
  const [shareProvider, setShareProvider] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [shareEndpointIp, setShareEndpointIp] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [hasCloudPubToken, setHasCloudPubToken] = useState(true);
  const [hasCloudPubCli, setHasCloudPubCli] = useState(true);
  const [cloudpubTokenInput, setCloudpubTokenInput] = useState("");
  const shareAbortRef = useRef<AbortController | null>(null);

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
            setSyncMsg(
              `Live-стол · ход ${data.world.meta?.turn ?? "?"} · rev ${data.version?.tableRevision ?? data.world.meta?.tableRevision ?? "?"}`,
            );
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
      setSyncMsg(
        `Черновик (local) · ${meta.systems} систем · ${fmtTime(meta.savedAt)}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [loadWorld, masterToken]);

  useEffect(() => {
    (
      window as unknown as { __GMAP_MASTER_TOKEN?: string }
    ).__GMAP_MASTER_TOKEN = masterToken;
  }, [masterToken]);

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
        const res = await fetch("/api/players/share");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          active?: boolean;
          viewUrl?: string | null;
          provider?: string | null;
          playerHint?: string | null;
          endpointIp?: string | null;
          hasCloudPubToken?: boolean;
          hasCloudPubCli?: boolean;
        };
        if (typeof data.hasCloudPubToken === "boolean") {
          setHasCloudPubToken(data.hasCloudPubToken);
        }
        if (typeof data.hasCloudPubCli === "boolean") {
          setHasCloudPubCli(data.hasCloudPubCli);
        }
        if (data.active && data.viewUrl) {
          setShareViewUrl(data.viewUrl);
          setShareProvider(data.provider ?? null);
          setShareHint(data.playerHint ?? null);
          setShareEndpointIp(data.endpointIp ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rememberSave = useCallback(() => {
    markSaved(world.meta.updatedAt);
    setDraftMeta(saveDraft(world));
    setDirtyTick((n) => n + 1);
  }, [world]);

  const openForPlayers = async () => {
    if (shareBusy) return;
    shareAbortRef.current?.abort();
    const ac = new AbortController();
    shareAbortRef.current = ac;
    setShareBusy(true);
    setShareError(null);
    setShareCopied(false);
    setShareOpen(true);
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
      const data = (await res.json()) as {
        ok?: boolean;
        viewUrl?: string | null;
        provider?: string | null;
        playerHint?: string | null;
        endpointIp?: string | null;
        hasCloudPubToken?: boolean;
        hasCloudPubCli?: boolean;
        error?: string;
      };
      if (typeof data.hasCloudPubToken === "boolean") {
        setHasCloudPubToken(data.hasCloudPubToken);
      }
      if (typeof data.hasCloudPubCli === "boolean") {
        setHasCloudPubCli(data.hasCloudPubCli);
      }
      if (!res.ok || !data.viewUrl) {
        throw new Error(data.error || "Не удалось открыть доступ");
      }
      setShareViewUrl(data.viewUrl);
      setShareProvider(data.provider ?? null);
      setShareHint(data.playerHint ?? null);
      setShareEndpointIp(data.endpointIp ?? null);
      if (tokenToSend) {
        setCloudpubTokenInput("");
        setHasCloudPubToken(true);
      }
      setSyncMsg(
        `Открыто (${data.provider ?? "туннель"}). Скопируй ссылку игрокам.`,
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setShareError("Прервано или слишком долго — нажми ещё раз");
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setShareError(msg);
        setSyncMsg(msg);
      }
    } finally {
      window.clearTimeout(killTimer);
      if (shareAbortRef.current === ac) shareAbortRef.current = null;
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareViewUrl) return;
    const text = shareEndpointIp
      ? `${shareViewUrl}\n\nНа жёлтой странице loca.lt в поле IP введи: ${shareEndpointIp}\nПотом Continue — откроется карта.`
      : shareViewUrl;
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareError("Не удалось скопировать — выдели ссылку вручную");
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
    setShareProvider(null);
    setShareHint(null);
    setShareEndpointIp(null);
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
      setSyncMsg(e instanceof Error ? e.message : String(e));
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
    onAdvanceTurn,
    onDownloadMap,
    shareBusy,
    shareViewUrl,
    shareProvider,
    shareHint,
    shareEndpointIp,
    shareError,
    shareCopied,
    shareOpen,
    setShareOpen,
    shareAbortRef,
    openForPlayers,
    copyShareLink,
    stopShare,
    setShareBusy,
    hasCloudPubToken,
    hasCloudPubCli,
    cloudpubTokenInput,
    setCloudpubTokenInput,
  };
}
