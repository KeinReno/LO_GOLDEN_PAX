import { useCallback, useEffect, useRef, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";

const STORAGE_KEY = "gmap-gm-beat-sheet";

type BeatItem = {
  id: string;
  label: string;
  done: boolean;
};

const DEFAULT_ITEMS: Omit<BeatItem, "done">[] = [
  { id: "apply", label: "Применить билд / опубликовать стол" },
  { id: "vision", label: "Проверить линзу игрока (туман)" },
  { id: "preview", label: "Открыть /view от лица державы" },
  { id: "inbox", label: "Разобрать очередь приказов" },
  { id: "tick", label: "Закрыть ход / тик" },
  { id: "share", label: "Ссылка для игроков актуальна" },
];

function loadItems(): BeatItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ITEMS.map((d) => ({ ...d, done: false }));
    }
    const parsed = JSON.parse(raw) as BeatItem[];
    const byId = new Map(parsed.map((x) => [x.id, x]));
    return DEFAULT_ITEMS.map((d) => ({
      ...d,
      done: byId.get(d.id)?.done ?? false,
    }));
  } catch {
    return DEFAULT_ITEMS.map((d) => ({ ...d, done: false }));
  }
}

function saveItems(items: BeatItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/**
 * Session beat sheet — checklist for live GM flow.
 */
export function GmBeatSheet({
  onRequestTick,
  onOpenInbox,
  variant = "block",
}: {
  onRequestTick?: () => void;
  onOpenInbox?: () => void;
  variant?: "block" | "notch";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BeatItem[]>(() => loadItems());
  const rootRef = useRef<HTMLDivElement>(null);
  const turn = useWorldStore((s) => s.world.meta.turn);
  const {
    dirty,
    shareViewUrl,
    shareStatus,
    onApplyBuild,
    setShareOpen,
    setSyncMsg,
  } = useCampaignSessionCtx();

  useEffect(() => {
    saveItems(items);
  }, [items]);

  useEffect(() => {
    if (variant !== "notch" || !open) return;
    const onDoc = (e: MouseEvent) => {
      const node = rootRef.current;
      if (node && !node.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, variant]);

  const toggle = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)),
    );
  }, []);

  const reset = () => {
    setItems(DEFAULT_ITEMS.map((d) => ({ ...d, done: false })));
  };

  const runAction = async (id: string) => {
    switch (id) {
      case "apply":
        await onApplyBuild();
        toggle("apply");
        break;
      case "vision":
        useWorldStore.getState().setGmOmniscientView(true);
        useWorldStore.getState().setShowFogPreview(true);
        setSyncMsg("Линза игрока включена");
        toggle("vision");
        break;
      case "preview":
        setSyncMsg("Localhost → выберите державу в блоке превью");
        toggle("preview");
        break;
      case "inbox":
        onOpenInbox?.();
        toggle("inbox");
        break;
      case "tick":
        onRequestTick?.();
        toggle("tick");
        break;
      case "share":
        if (shareViewUrl) setShareOpen(true);
        else setSyncMsg("Открой «Для игроков» и подними туннель");
        if (shareStatus === "online") toggle("share");
        break;
      default:
        break;
    }
  };

  const doneCount = items.filter((x) => x.done).length;
  const notch = variant === "notch";

  return (
    <div
      ref={rootRef}
      className={`gm-beat-sheet${notch ? " gm-beat-sheet--notch" : ""}`}
    >
      <button
        type="button"
        className={
          notch
            ? `gm-session-notch__chip gm-session-notch__chip--btn${
                doneCount < items.length ? " warn" : ""
              }`
            : "btn ghost block gm-beat-sheet__toggle"
        }
        aria-expanded={open}
        title="Чеклист хода: билд, линза, очередь, тик"
        onClick={() => setOpen((v) => !v)}
      >
        {notch
          ? `сценарий ${doneCount}/${items.length}`
          : `Сценарий хода ${doneCount}/${items.length}${dirty ? " · черновик" : ""}`}
      </button>
      {open && (
        <div className="gm-beat-sheet__body">
          <p className="hint">
            Ход {turn}. Отмечайте по ходу сессии — сброс в начале вечера.
          </p>
          <ul className="gm-beat-sheet__list">
            {items.map((item) => (
              <li key={item.id} className="gm-beat-sheet__row">
                <label className="check gm-beat-sheet__check">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggle(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
                <button
                  type="button"
                  className="btn ghost gm-beat-sheet__go"
                  title="Выполнить действие"
                  onClick={() => void runAction(item.id)}
                >
                  →
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn ghost block" onClick={reset}>
            Сбросить чеклист
          </button>
        </div>
      )}
    </div>
  );
}
