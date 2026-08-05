import { useCallback, useEffect, useState } from "react";
import { fetchContent, getCachedContent } from "../../state/contentCatalog";
import { useCampaignSessionCtx } from "../CampaignSessionContext";

type NumField = {
  key: string;
  label: string;
  path: "alchemy" | "intel" | "apPerTurn" | "forceAp.base" | "forceAp.max";
  step?: number;
};

const FIELDS: NumField[] = [
  { key: "attemptsPerTurn", label: "attemptsPerTurn", path: "alchemy", step: 1 },
  { key: "baseCost", label: "baseCost", path: "alchemy", step: 1 },
  { key: "eraGapCost", label: "eraGapCost", path: "alchemy", step: 1 },
  { key: "blindHit", label: "blindHit", path: "alchemy", step: 0.01 },
  { key: "duplicateRefund", label: "duplicateRefund", path: "alchemy", step: 0.05 },
  { key: "apPerTurn", label: "apPerTurn", path: "apPerTurn", step: 1 },
  { key: "base", label: "forceAp.base", path: "forceAp.base", step: 1 },
  { key: "max", label: "forceAp.max", path: "forceAp.max", step: 1 },
];

function readValue(
  rules: Record<string, unknown> | undefined,
  field: NumField,
): number | null {
  if (!rules) return null;
  if (field.path === "apPerTurn") {
    const v = rules.apPerTurn;
    return typeof v === "number" ? v : null;
  }
  if (field.path.startsWith("forceAp.")) {
    const sub = field.path.split(".")[1];
    const fa = rules.forceAp as Record<string, unknown> | undefined;
    const v = fa?.[sub];
    return typeof v === "number" ? v : null;
  }
  const bag = rules[field.path] as Record<string, unknown> | undefined;
  const v = bag?.[field.key];
  return typeof v === "number" ? v : null;
}

/** Inline numeric knobs for rules.json (alchemy, AP, intel). */
export function GmRulesKnobEditor() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const content = getCachedContent();
  const rules = content?.rules as Record<string, unknown> | undefined;
  const alchemy = rules?.alchemy as Record<string, unknown> | undefined;
  const intel = rules?.intel as Record<string, unknown> | undefined;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    await fetchContent(true);
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/gm/content/rules-knobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      await fetchContent(true);
      tick((n) => n + 1);
      setSyncMsg("rules: knobs сохранены");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      setSyncMsg(msg);
    } finally {
      setBusy(false);
    }
  };

  const bump = (field: NumField, delta: number) => {
    const cur = readValue(rules, field);
    if (cur == null) return;
    const step = field.step ?? 1;
    const next = Math.round((cur + delta * step) * 1000) / 1000;
    if (field.path === "apPerTurn") {
      void patch({ apPerTurn: next });
      return;
    }
    if (field.path.startsWith("forceAp.")) {
      const sub = field.path.split(".")[1];
      void patch({ forceAp: { [sub]: next } });
      return;
    }
    void patch({ [field.path]: { [field.key]: next } });
  };

  return (
    <div className="gm-rules-knobs">
      {err && <p className="gmsys-error">{err}</p>}

      <h5>Алхимия · быстрые правки</h5>
      <ul className="gm-atelier-kv gm-rules-knob-list">
        {FIELDS.filter((f) => f.path === "alchemy" || f.path === "apPerTurn" || f.path.startsWith("forceAp")).map(
          (field) => {
            const val = readValue(rules, field);
            return (
              <li key={field.label}>
                <span>{field.label}</span>
                <div className="gm-rules-knob-controls">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || val == null}
                    onClick={() => bump(field, -1)}
                    aria-label={`Уменьшить ${field.label}`}
                  >
                    −
                  </button>
                  <strong className="tabular">{val ?? "—"}</strong>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={busy || val == null}
                    onClick={() => bump(field, 1)}
                    aria-label={`Увеличить ${field.label}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          },
        )}
      </ul>

      <h5>Intel</h5>
      <ul className="gm-atelier-kv gm-rules-knob-list">
        {intel
          ? Object.entries(intel).map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <div className="gm-rules-knob-controls">
                  {typeof v === "number" ? (
                    <>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() =>
                          void patch({ intel: { [k]: Math.max(0, Number(v) - 1) } })
                        }
                      >
                        −
                      </button>
                      <strong className="tabular">{String(v)}</strong>
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={busy}
                        onClick={() =>
                          void patch({ intel: { [k]: Number(v) + 1 } })
                        }
                      >
                        +
                      </button>
                    </>
                  ) : (
                    <strong className="tabular">{String(v)}</strong>
                  )}
                </div>
              </li>
            ))
          : (
            <li>
              <span>нет rules.intel</span>
            </li>
          )}
      </ul>

      {alchemy && (
        <p className="hint">
          blindHit={String(alchemy.blindHit ?? "—")} · duplicateRefund=
          {String(alchemy.duplicateRefund ?? "—")}
        </p>
      )}
    </div>
  );
}
