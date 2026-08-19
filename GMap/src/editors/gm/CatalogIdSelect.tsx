import { useMemo, useState } from "react";
import {
  filterCatalogOptions,
  type CatalogOption,
} from "./catalogIdFilter";

export type { CatalogOption };
export { filterCatalogOptions };

type SelectProps = {
  value: string;
  onChange: (id: string) => void;
  options: CatalogOption[];
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  id?: string;
};

/** Pick a catalog/world entity by display name — never type the raw id. */
export function CatalogIdSelect({
  value,
  onChange,
  options,
  emptyLabel = "— не выбрано —",
  allowEmpty = true,
  disabled,
  id,
}: SelectProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => filterCatalogOptions(options, q),
    [options, q],
  );
  const showSearch = options.length > 16;
  const current = options.find((o) => o.id === value);

  return (
    <div className="catalog-id-select">
      {showSearch && (
        <input
          type="search"
          className="gm-form-input catalog-id-select-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию…"
          disabled={disabled}
          aria-label="Поиск в списке"
        />
      )}
      <select
        id={id}
        className="gm-form-input studio-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        title={current ? current.name : emptyLabel}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {value && !filtered.some((o) => o.id === value) && current && (
          <option value={current.id}>{current.name}</option>
        )}
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type MultiProps = {
  values: string[];
  onChange: (ids: string[]) => void;
  options: CatalogOption[];
  addLabel?: string;
  disabled?: boolean;
};

export function CatalogIdMulti({
  values,
  onChange,
  options,
  addLabel = "— добавить —",
  disabled,
}: MultiProps) {
  const remaining = options.filter((o) => !values.includes(o.id));
  const byId = new Map(options.map((o) => [o.id, o.name]));

  return (
    <div className="catalog-id-multi">
      {values.length > 0 && (
        <ul className="catalog-id-chips">
          {values.map((id) => (
            <li key={id}>
              <span>{byId.get(id) || id}</span>
              <button
                type="button"
                className="btn tiny ghost"
                disabled={disabled}
                onClick={() => onChange(values.filter((x) => x !== id))}
                aria-label={`Убрать ${byId.get(id) || id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        className="gm-form-input studio-select"
        value=""
        disabled={disabled || remaining.length === 0}
        onChange={(e) => {
          const id = e.target.value;
          if (id) onChange([...values, id]);
        }}
      >
        <option value="">{remaining.length ? addLabel : "Все уже выбраны"}</option>
        {remaining.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
