/**
 * Stylish amount sheet — presets + stepper (no grey native dropdown).
 */
export function AmountSheet({
  label,
  stock,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  label: string;
  stock?: number;
  value: number;
  onChange: (n: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const max = stock != null && stock > 0 ? stock : 99999;
  const presets = [10, 50, 100, 250, 500].filter((p) => p <= max);
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.floor(n)));

  return (
    <div className="gc-amt-sheet" role="dialog" aria-label={`Количество · ${label}`}>
      <header className="gc-amt-sheet__head">
        <strong>{label}</strong>
        {stock != null ? (
          <span className="hint">в казне {stock}</span>
        ) : (
          <span className="hint">запрос</span>
        )}
      </header>
      <div className="gc-amt-sheet__value" aria-live="polite">
        <button
          type="button"
          className="gc-amt-step"
          disabled={value <= 1}
          onClick={() => onChange(clamp(value - 10))}
        >
          −
        </button>
        <span className="gc-amt-sheet__num">{value}</span>
        <button
          type="button"
          className="gc-amt-step"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + 10))}
        >
          +
        </button>
      </div>
      <div className="gc-amt-presets" role="group" aria-label="Быстрые суммы">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`gc-amt-preset ${value === p ? "on" : ""}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        {stock != null && stock > 0 && (
          <button
            type="button"
            className={`gc-amt-preset ${value === stock ? "on" : ""}`}
            onClick={() => onChange(clamp(stock))}
          >
            всё
          </button>
        )}
        {stock != null && stock > 1 && (
          <button
            type="button"
            className="gc-amt-preset"
            onClick={() => onChange(clamp(Math.floor(stock / 2)))}
          >
            ½
          </button>
        )}
      </div>
      <input
        className="gc-amt-range"
        type="range"
        min={1}
        max={Math.max(1, Math.min(max, 2000))}
        value={Math.min(value, Math.max(1, Math.min(max, 2000)))}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <div className="gc-amt-sheet__actions">
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn primary sm" onClick={onConfirm}>
          В сделку
        </button>
      </div>
    </div>
  );
}
