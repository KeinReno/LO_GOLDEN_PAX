import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchContent } from "../../state/contentCatalog";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { GmEntryFormPanel, supportsEntryForm } from "./GmEntryFormPanel";

export type AtelierCatalogId =
  | "technologies"
  | "tech_recipes"
  | "tech_combos"
  | "economy_balance"
  | "council_seats"
  | "court_tasks"
  | "npc_traits"
  | "yearly_quests"
  | "story_quests"
  | "buildings"
  | "rules";

type CatalogMeta = {
  id: string;
  label: string;
  file: string;
  mode: "flat" | "nested" | "document";
  bags: string[];
  count: number;
};

type EntryRow = {
  key: string;
  bag: string | null;
  label: string;
  preview: string;
};

type Props = {
  catalog: AtelierCatalogId;
  /** economy_balance keeps GmBalancePanel above the raw editor */
  showDocumentEditor?: boolean;
  defaultView?: "form" | "json";
};

function gmHeaders(token: string): HeadersInit {
  return { "X-Master-Token": token };
}

function prettyJson(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function entryTitle(data: Record<string, unknown> | null, key: string): string {
  if (!data) return key;
  return String(data.name ?? data.label ?? data.id ?? key);
}

/** GM Atelier — browse, search, edit catalog entries and documents. */
export function GmCatalogEditor({
  catalog,
  showDocumentEditor = true,
  defaultView = "form",
}: Props) {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [meta, setMeta] = useState<CatalogMeta | null>(null);
  const [bag, setBag] = useState<string>("");
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<{ key: string; bag: string | null } | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [savedDraft, setSavedDraft] = useState("");
  const [view, setView] = useState<"form" | "json">(defaultView);
  const patchForm = (data: Record<string, unknown>) => {
    setDraft(prettyJson(data));
  };

  useEffect(() => {
    setView(defaultView);
  }, [catalog, defaultView]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newKey, setNewKey] = useState("");
  const [showNew, setShowNew] = useState(false);

  const isDocument = meta?.mode === "document";
  const dirty = draft !== savedDraft;

  const draftParsed = useMemo(() => parseJson(draft), [draft]);
  const draftObj =
    draftParsed.ok && draftParsed.value && typeof draftParsed.value === "object"
      ? (draftParsed.value as Record<string, unknown>)
      : null;

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...gmHeaders(masterToken),
          ...(init?.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    },
    [masterToken],
  );

  const loadMeta = useCallback(async () => {
    const data = await api(`/api/gm/content/meta?catalog=${catalog}`);
    setMeta(data as CatalogMeta);
    if (data.mode === "nested" && data.bags?.length) {
      setBag((prev) => (prev && data.bags.includes(prev) ? prev : data.bags[0]));
    } else {
      setBag("");
    }
  }, [api, catalog]);

  const loadEntries = useCallback(async () => {
    if (isDocument) return;
    const params = new URLSearchParams({ catalog, limit: "120" });
    if (bag) params.set("bag", bag);
    if (q.trim()) params.set("q", q.trim());
    const data = await api(`/api/gm/content/entries?${params}`);
    setEntries(data.entries ?? []);
    setTotal(data.total ?? 0);
  }, [api, bag, catalog, isDocument, q]);

  const loadDocument = useCallback(async () => {
    const data = await api(`/api/gm/content/document?catalog=${catalog}`);
    const text = prettyJson(data.data);
    setDraft(text);
    setSavedDraft(text);
    setSelected(null);
  }, [api, catalog]);

  const loadEntry = useCallback(
    async (key: string, entryBag: string | null) => {
      const params = new URLSearchParams({ catalog, key });
      if (entryBag) params.set("bag", entryBag);
      const data = await api(`/api/gm/content/entry?${params}`);
      const text = prettyJson(data.data);
      setDraft(text);
      setSavedDraft(text);
      setSelected({ key, bag: entryBag });
      setErr("");
    },
    [api, catalog],
  );

  const refreshAll = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      await loadMeta();
      if (meta?.mode === "document" || catalog === "rules" || catalog === "economy_balance") {
        if (showDocumentEditor || catalog === "rules") await loadDocument();
      } else {
        await loadEntries();
        if (selected) await loadEntry(selected.key, selected.bag);
      }
      await fetchContent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    catalog,
    loadDocument,
    loadEntries,
    loadEntry,
    loadMeta,
    meta?.mode,
    selected,
    showDocumentEditor,
  ]);

  useEffect(() => {
    void (async () => {
      setBusy(true);
      setErr("");
      setSelected(null);
      setDraft("");
      setSavedDraft("");
      try {
        const data = await api(`/api/gm/content/meta?catalog=${catalog}`);
        const m = data as CatalogMeta;
        setMeta(m);
        const initialBag =
          m.mode === "nested" && m.bags?.length ? m.bags[0] : "";
        setBag(initialBag);
        if (m.mode === "document") {
          if (showDocumentEditor || catalog === "rules") {
            const doc = await api(`/api/gm/content/document?catalog=${catalog}`);
            const text = prettyJson(doc.data);
            setDraft(text);
            setSavedDraft(text);
          }
        } else {
          const params = new URLSearchParams({ catalog, limit: "120" });
          if (initialBag) params.set("bag", initialBag);
          const list = await api(`/api/gm/content/entries?${params}`);
          setEntries(list.entries ?? []);
          setTotal(list.total ?? 0);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }, [api, catalog, showDocumentEditor]);

  useEffect(() => {
    if (!meta || meta.mode === "document") return;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await loadEntries();
        } catch (e) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      })();
    }, 220);
    return () => window.clearTimeout(t);
  }, [loadEntries, meta, q, bag]);

  const save = async () => {
    const parsed = parseJson(draft);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (isDocument) {
        await api("/api/gm/content/document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalog, data: parsed.value }),
        });
        setSavedDraft(draft);
        setSyncMsg(`${catalog}: документ сохранён`);
      } else if (selected) {
        await api("/api/gm/content/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            catalog,
            key: selected.key,
            bag: selected.bag,
            data: parsed.value,
          }),
        });
        setSavedDraft(draft);
        setSyncMsg(`${selected.key}: сохранено`);
        await loadEntries();
      }
      await fetchContent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const createEntry = async () => {
    const key = newKey.trim();
    if (!key) {
      setErr("Укажите id новой записи");
      return;
    }
    const parsed = parseJson(draft);
    if (!parsed.ok) {
      setErr(parsed.error);
      return;
    }
    setBusy(true);
    try {
      await api("/api/gm/content/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog,
          key,
          bag: bag || null,
          data: parsed.value,
          create: true,
        }),
      });
      setShowNew(false);
      setNewKey("");
      setSyncMsg(`${key}: создано`);
      await loadEntries();
      await loadEntry(key, bag || null);
      await fetchContent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Удалить ${selected.key}?`)) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        catalog,
        key: selected.key,
      });
      if (selected.bag) params.set("bag", selected.bag);
      await api(`/api/gm/content/entry?${params}`, { method: "DELETE" });
      setSelected(null);
      setDraft("");
      setSavedDraft("");
      setSyncMsg(`${selected.key}: удалено`);
      await loadEntries();
      await fetchContent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = () => {
    if (!selected) return;
    const parsed = parseJson(draft);
    if (!parsed.ok) return;
    const suffix = "_copy";
    setNewKey(`${selected.key}${suffix}`);
    setShowNew(true);
    setDraft(prettyJson(parsed.value));
  };

  const reloadContent = async () => {
    setBusy(true);
    try {
      await api("/api/gm/content/reload", { method: "POST" });
      await fetchContent(true);
      setSyncMsg("Контент перезагружен");
      await refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-catalog-editor">
      <div className="gm-catalog-toolbar">
        {!isDocument && (
          <input
            type="search"
            className="gm-catalog-search"
            placeholder="Поиск по id / названию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Поиск записей"
          />
        )}
        <div className="gmsys-row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void refreshAll()}
          >
            Обновить
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void reloadContent()}
          >
            Reload content
          </button>
          {!isDocument && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setShowNew(true);
                setNewKey("");
                setDraft(
                  prettyJson({
                    id: "",
                    name: "Новая запись",
                  }),
                );
                setSelected(null);
                setView("form");
              }}
            >
              + Новая
            </button>
          )}
          {!isDocument && supportsEntryForm(catalog) && (
            <div className="gm-view-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "form"}
                className={`btn ghost ${view === "form" ? "active" : ""}`}
                onClick={() => setView("form")}
              >
                Форма
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "json"}
                className={`btn ghost ${view === "json" ? "active" : ""}`}
                onClick={() => setView("json")}
              >
                JSON
              </button>
            </div>
          )}
        </div>
        {meta && (
          <span className="hint">
            {meta.file} · {meta.count} записей
          </span>
        )}
      </div>

      {err && <p className="gmsys-error">{err}</p>}

      {meta?.mode === "nested" && meta.bags.length > 1 && (
        <div className="gm-catalog-bags" role="tablist" aria-label="Разделы каталога">
          {meta.bags.map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={bag === b}
              className={`btn ghost gm-catalog-bag ${bag === b ? "active" : ""}`}
              onClick={() => {
                setBag(b);
                setSelected(null);
                setDraft("");
                setSavedDraft("");
              }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      <div
        className={`gm-catalog-body ${isDocument ? "gm-catalog-body--doc" : ""}`}
      >
        {!isDocument && (
          <aside className="gm-catalog-list" aria-label="Записи каталога">
            {entries.length === 0 && !busy && (
              <p className="gmsys-empty">Нет записей</p>
            )}
            {entries.map((row) => {
              const active =
                selected?.key === row.key &&
                (selected.bag ?? null) === (row.bag ?? null);
              return (
                <button
                  key={`${row.bag ?? ""}:${row.key}`}
                  type="button"
                  className={`gm-catalog-row ${active ? "active" : ""}`}
                  onClick={() => void loadEntry(row.key, row.bag)}
                >
                  <span className="gm-catalog-row-label">{row.label}</span>
                  <code className="gm-catalog-row-id">{row.key}</code>
                  {row.preview && (
                    <span className="gm-catalog-row-preview">{row.preview}</span>
                  )}
                </button>
              );
            })}
            {total > entries.length && (
              <p className="hint">Показано {entries.length} из {total}</p>
            )}
          </aside>
        )}

        <div className="gm-catalog-detail">
          {showNew && (
            <div className="gm-catalog-new">
              <label className="hint">
                Id новой записи
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="tech.example"
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void createEntry()}
              >
                Создать
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setShowNew(false);
                  setNewKey("");
                }}
              >
                Отмена
              </button>
            </div>
          )}

          {(selected || isDocument || showNew) && (
            <>
              <header className="gm-catalog-detail-head">
                <div>
                  <h5>
                    {isDocument
                      ? meta?.label ?? catalog
                      : selected
                        ? entryTitle(draftObj, selected.key)
                        : "Новая запись"}
                  </h5>
                  {selected && (
                    <code className="gm-catalog-detail-id">{selected.key}</code>
                  )}
                </div>
                <div className="gmsys-row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || !dirty}
                    onClick={() => setDraft(savedDraft)}
                  >
                    Отменить
                  </button>
                  {selected && !showNew && (
                    <>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={duplicate}
                      >
                        Дублировать
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        Удалить
                      </button>
                    </>
                  )}
                </div>
              </header>

              {view === "form" &&
                !isDocument &&
                draftObj &&
                supportsEntryForm(catalog) && (
                  <GmEntryFormPanel
                    catalog={catalog}
                    data={draftObj}
                    onChange={patchForm}
                  />
                )}

              {(view === "json" || isDocument || !supportsEntryForm(catalog)) && (
                <textarea
                  className="gm-catalog-json"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  aria-label="JSON запись"
                />
              )}
              {dirty && <p className="hint gm-catalog-dirty">Есть несохранённые правки</p>}
            </>
          )}

          {!selected && !isDocument && !showNew && !busy && (
            <p className="gmsys-empty">Выберите запись слева или создайте новую</p>
          )}
        </div>
      </div>
    </div>
  );
}
