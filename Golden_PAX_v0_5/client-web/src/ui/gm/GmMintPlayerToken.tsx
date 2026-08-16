import { useState } from "react";
import { IconKey } from "@tabler/icons-react";

import { HoverBorderGradient } from "../../components/ui/aceternity/HoverBorderGradient";
import { MovingBorder } from "../../components/ui/aceternity/MovingBorder";
import { useWorldStore } from "../../state/worldStore";
import { GlassField, glassInputClass } from "../shared/ShellLayout";

/** GM-only: mint a 4-digit player PIN for a faction (plaintext shown once). */
export function GmMintPlayerToken() {
  const mintPlayerToken = useWorldStore((s) => s.mintPlayerToken);
  const loading = useWorldStore((s) => s.loading);
  const others = useWorldStore((s) => s.view?.others ?? []);
  const [factionId, setFactionId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [minted, setMinted] = useState<{ token: string; factionId: string } | null>(null);

  const selected = factionId || others[0]?.id || "";

  const onMint = async () => {
    if (!selected) return;
    const result = await mintPlayerToken(
      selected,
      displayName.trim() || undefined,
      pin.length === 4 ? pin : undefined,
    );
    if (result) {
      setMinted({ token: result.token, factionId: result.factionId });
    }
  };

  return (
    <div className="rounded-lg border border-gp-gold/20 bg-slate-950/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gp-gold-soft">
        <IconKey size={14} aria-hidden />
        Код игрока
      </p>
      <GlassField label="Фракция">
        <select
          className={`${glassInputClass} [color-scheme:dark]`}
          value={selected}
          onChange={(e) => setFactionId(e.target.value)}
        >
          {others.length === 0 ? <option value="">Нет фракций</option> : null}
          {others.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </GlassField>
      <GlassField label="Имя за столом (необязательно)">
        <input
          className={glassInputClass}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="как зовут игрока"
        />
      </GlassField>
      <GlassField label="PIN (4 цифры, пусто = случайный)">
        <input
          className={`${glassInputClass} tracking-[0.4em]`}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
        />
      </GlassField>
      <MovingBorder
        type="button"
        onClick={onMint}
        disabled={loading || !selected}
        containerClassName="w-full"
        innerClassName="w-full py-2 text-xs"
      >
        Выдать код
      </MovingBorder>
      {minted ? (
        <div className="mt-3 rounded border border-cyan-500/30 bg-cyan-950/20 p-2">
          <p className="text-[0.65rem] uppercase text-slate-400">Показать один раз</p>
          <code className="mt-1 block text-lg tracking-[0.4em] text-cyan-100">{minted.token}</code>
          <HoverBorderGradient
            type="button"
            containerClassName="mt-2 w-full"
            className="w-full text-center text-xs"
            onClick={() => navigator.clipboard?.writeText(minted.token)}
          >
            Скопировать
          </HoverBorderGradient>
        </div>
      ) : null}
    </div>
  );
}