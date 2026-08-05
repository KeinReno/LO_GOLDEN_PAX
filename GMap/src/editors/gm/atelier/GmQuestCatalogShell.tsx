import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fetchContent } from "../../../state/contentCatalog";
import { useCampaignSessionCtx } from "../../CampaignSessionContext";

export type CatalogEntryRow = {
  key: string;
  bag: string | null;
  label: string;
  preview: string;
};

type Props<T> = {
  catalog: string;
  bag?: string;
  emptyDef: (id: string) => T;
  idPrefix: string;
  renderForm: (props: {
    draft: T;
    setDraft: (v: T) => void;
    dirty: boolean;
  }) => ReactNode;
  /** Serialize for API save */
  toPayload: (draft: T) => unknown;
  /** Parse loaded entry */
  fromPayload: (data: unknown) => T;
};

function prettyJson(v: unknown): string {
  return JSON.stringify(v, null, 2);
}

/** Shared list + form/json shell for quest catalogs in Atelier. */
export function GmQuestCatalogShell<T extends { id: string; name: string }>({
  catalog,
  bag = "quests",
  emptyDef,
  idPrefix,
  renderForm,
  toPayload,
  fromPayload,
}: Props<T>) {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<CatalogEntryRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [savedJson, setSavedJson] = useState("");
  const [view, setView] = useState<"form" | "json">("form");
  const [jsonText, setJsonText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");

  const headers = useCallback(
    (): HeadersInit => ({
      "X-Master-Token": masterToken,
      "Content-Type": "application/json",
    }),
    [masterToken],
  );

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ catalog, limit: "200" });
    if (bag) params.set("bag", bag);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/gm/content/entries?${params}`, {
      headers: { "X-Master-Token": masterToken },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    setEntries(data.entries ?? []);
  }, [bag, catalog, masterToken, q]);

  const loadEntry = useCallback(
    async (key: string) => {
      const params = new URLSearchParams({ catalog, key });
      if (bag) params.set("bag", bag);
      const res = await fetch(`/api/gm/content/entry?${params}`, {
        headers: { "X-Master-Token": masterToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const parsed = fromPayload(data.data);
      setDraft(parsed);
      setSavedJson(prettyJson(data.data));
      setJsonText(prettyJson(data.data));
      setSelectedKey(key);
      setCreating(false);
      setErr("");
    },
    [bag, catalog, fromPayload, masterToken],
  );

  useEffect(() => {
    void loadList().catch((e) =>
      setErr(e instanceof Error ? e.message : String(e)),
    );
  }, [loadList]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadList().catch(() => {});
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, loadList]);

  const dirty =
    view === "json"
      ? jsonText !== savedJson
      : draft != null && prettyJson(toPayload(draft)) !== savedJson;

  const save = async () => {
    if (!selectedKey && !creating) return;
    const key = creating ? newId.trim() : selectedKey;
    if (!key) {
      setErr("Укажите id");
      return;
    }
    let payload: unknown;
    if (view === "json") {
      try {
        payload = JSON.parse(jsonText);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "JSON ошибка");
        return;
      }
    } else if (draft) {
      payload = toPayload({ ...draft, id: key });
    } else return;

    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/gm/content/entry", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          catalog,
          key,
          bag: bag || null,
          data: payload,
          create: creating,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchContent(true);
      setSyncMsg(`${key}: сохранено`);
      setCreating(false);
      await loadList();
      await loadEntry(key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedKey || !window.confirm(`Удалить ${selectedKey}?`)) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ catalog, key: selectedKey });
      if (bag) params.set("bag", bag);
      const res = await fetch(`/api/gm/content/entry?${params}`, {
        method: "DELETE",
        headers: { "X-Master-Token": masterToken },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setSelectedKey(null);
      setDraft(null);
      setSyncMsg(`${selectedKey}: удалено`);
      await loadList();
      await fetchContent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    const id = `${idPrefix}.new_quest`;
    setNewId(id);
    const def = emptyDef(id);
    setDraft(def);
    setJsonText(prettyJson(def));
    setSavedJson("");
    setSelectedKey(null);
    setCreating(true);
    setView("form");
  };

  const duplicate = () => {
    if (!draft || !selectedKey) return;
    const id = `${selectedKey}_copy`;
    setNewId(id);
    setDraft({ ...draft, id, name: `${draft.name} (копия)` });
    setCreating(true);
    setSelectedKey(null);
  };

  return (
    <div className="gm-quest-catalog">
      <div className="gm-catalog-toolbar">
        <input
          type="search"
          className="gm-catalog-search"
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="btn primary" disabled={busy} onClick={startCreate}>
          + Новый квест
        </button>
        <div className="gm-view-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "form"}
            className={`btn ghost ${view === "form" ? "active" : ""}`}
            onClick={() => {
              if (view === "json" && draft) {
                try {
                  setDraft(fromPayload(JSON.parse(jsonText)));
                } catch {
                  /* keep form draft */
                }
              }
              setView("form");
            }}
          >
            Форма
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "json"}
            className={`btn ghost ${view === "json" ? "active" : ""}`}
            onClick={() => {
              if (draft) setJsonText(prettyJson(toPayload(draft)));
              setView("json");
            }}
          >
            JSON
          </button>
        </div>
      </div>

      {err && <p className="gmsys-error">{err}</p>}

      <div className="gm-catalog-body">
        <aside className="gm-catalog-list">
          {entries.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`gm-catalog-row ${selectedKey === row.key ? "active" : ""}`}
              onClick={() => void loadEntry(row.key)}
            >
              <span className="gm-catalog-row-label">{row.label}</span>
              <code className="gm-catalog-row-id">{row.key}</code>
              {row.preview && (
                <span className="gm-catalog-row-preview">{row.preview}</span>
              )}
            </button>
          ))}
        </aside>

        <div className="gm-catalog-detail">
          {(draft || creating) && (
            <>
              <header className="gm-catalog-detail-head">
                <div>
                  {creating && (
                    <label className="gm-form-field">
                      <span>Id каталога</span>
                      <input
                        type="text"
                        className="gm-form-input"
                        value={newId}
                        onChange={(e) => setNewId(e.target.value)}
                        spellCheck={false}
                      />
                    </label>
                  )}
                  {!creating && selectedKey && (
                    <code className="gm-catalog-detail-id">{selectedKey}</code>
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
                  {!creating && selectedKey && (
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

              {view === "form" && draft && renderForm({ draft, setDraft, dirty })}
              {view === "json" && (
                <textarea
                  className="gm-catalog-json"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                />
              )}
              {dirty && <p className="hint gm-catalog-dirty">Есть несохранённые правки</p>}
            </>
          )}
          {!draft && !creating && (
            <p className="gmsys-empty">Выберите квест или создайте новый</p>
          )}
        </div>
      </div>
    </div>
  );
}
