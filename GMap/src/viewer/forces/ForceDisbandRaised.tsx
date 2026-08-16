import { useState } from "react";
import { HoldRevealButton } from "../../ui/HoldRevealButton";
import {
  postForceDisbandRaised,
  type ForceRecruitSession,
} from "../../state/forceRaiseClient";

export function ForceDisbandRaised({
  factionId,
  password,
  kind,
  id,
  maxCount,
  busy,
  onSession,
  onToast,
}: {
  factionId: string;
  password: string;
  kind: "legion" | "fleet";
  id: string;
  maxCount: number;
  busy?: boolean;
  onSession: (data: ForceRecruitSession) => void;
  onToast?: (msg: string) => void;
}) {
  const [count, setCount] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Math.max(1, Math.min(maxCount, Math.floor(count) || 1));
  const locked = busy || pending || !password || maxCount < 1;

  const disband = async () => {
    if (locked) return;
    setPending(true);
    setError(null);
    const result = await postForceDisbandRaised({
      factionId,
      password,
      kind,
      id,
      count: n,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      onToast?.(result.error);
      return;
    }
    onSession(result.data);
    onToast?.(
      `Население возвращено · ${result.data.disbandedCount ?? n}`,
    );
  };

  return (
    <section className="planet-manage-block" aria-label="Роспуск набранных">
      <p className="hint">
        Набрано с планеты. Роспуск вернёт население, без возврата металла.
      </p>
      <label className="system-cmd-count">
        Кол-во
        <input
          type="number"
          min={1}
          max={Math.max(1, maxCount)}
          value={n}
          disabled={pending}
          onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <HoldRevealButton
        className="btn ghost"
        danger
        disabled={locked}
        holdMs={720}
        title="Зажми, чтобы вернуть население на домашнюю планету"
        onHoldComplete={() => void disband()}
      >
        {pending ? "Роспуск…" : "Вернуть на планету"}
      </HoldRevealButton>
      {error && (
        <p className="hint planet-manage-msg" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
