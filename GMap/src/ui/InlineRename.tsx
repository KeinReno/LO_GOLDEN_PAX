import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";

type Props = {
  value: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  /** Show only the pencil (label lives elsewhere, e.g. crumb nav). */
  affordanceOnly?: boolean;
  onCommit: (next: string) => void;
};

/** Click pencil / double-click label → inline rename. */
export function InlineRename({
  value,
  disabled,
  className,
  title,
  affordanceOnly,
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const finish = (save: boolean) => {
    setEditing(false);
    if (!save) {
      setDraft(value);
      return;
    }
    const next = draft.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  };

  if (disabled) {
    return <span className={className}>{value}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-rename-input ${className ?? ""}`}
        value={draft}
        maxLength={48}
        aria-label={title ?? "Переименовать"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            finish(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`inline-rename${affordanceOnly ? " is-affordance" : ""} ${className ?? ""}`}
    >
      {!affordanceOnly && (
        <button
          type="button"
          className="inline-rename__label"
          title={title ?? "Двойной клик или ✎ — переименовать"}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {value}
        </button>
      )}
      <button
        type="button"
        className="inline-rename__edit"
        title={title ?? "Переименовать"}
        aria-label={title ?? "Переименовать"}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil size={12} />
      </button>
    </span>
  );
}
