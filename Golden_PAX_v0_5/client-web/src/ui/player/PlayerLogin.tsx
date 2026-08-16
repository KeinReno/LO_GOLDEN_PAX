import { useEffect, useState, type FormEvent } from "react";
import { IconShield, IconUser } from "@tabler/icons-react";

import { fetchCampaignList } from "../../api/client";
import { BackgroundBeams } from "../../components/ui/aceternity/BackgroundBeams";
import { CardSpotlight } from "../../components/ui/aceternity/CardSpotlight";
import { HoverBorderGradient } from "../../components/ui/aceternity/HoverBorderGradient";
import { MovingBorder } from "../../components/ui/aceternity/MovingBorder";
import { Sparkles } from "../../components/ui/aceternity/Sparkles";
import { cn } from "../../lib/utils";
import { useWorldStore } from "../../state/worldStore";
import { GlassField, glassInputClass } from "../shared/ShellLayout";

type Tab = "player" | "gm";

const ERROR_LABELS: Record<string, string> = {
  not_seated: "Этот код не привязан к выбранной кампании.",
  player_token_required: "Нужен код из 4 цифр.",
  unauthenticated: "Неверный код.",
};

function digits4(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export function LoginScreen() {
  const [tab, setTab] = useState<Tab>("player");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [campaignId, setCampaignId] = useState("");
  const [playerToken, setPlayerToken] = useState("");
  const [masterToken, setMasterToken] = useState("");
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const loginPlayer = useWorldStore((s) => s.loginPlayer);
  const loginGm = useWorldStore((s) => s.loginGm);
  const health = useWorldStore((s) => s.health);

  useEffect(() => {
    let cancelled = false;
    fetchCampaignList().then((res) => {
      if (cancelled) return;
      if (!res.ok) return;
      const list = res.data.campaigns ?? [];
      setCampaigns(list);
      setCampaignId((current) => current || list[0]?.id || "");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!campaignId.trim()) return;
    if (tab === "player") {
      if (playerToken.length !== 4) return;
      await loginPlayer(campaignId.trim(), playerToken);
    } else {
      if (masterToken.length !== 4) return;
      await loginGm(campaignId.trim(), masterToken);
    }
  };

  const errorText = error ? (ERROR_LABELS[error] ?? error) : null;
  const pin = tab === "player" ? playerToken : masterToken;
  const canSubmit = Boolean(campaignId) && pin.length === 4 && !loading;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <BackgroundBeams />
      <Sparkles particleDensity={48} particleColor="#c9a239" maxSize={1} className="opacity-70" />
      <Sparkles particleDensity={24} particleColor="#22d3ee" maxSize={0.8} speed={0.1} className="opacity-40" />

      <CardSpotlight className="relative z-10 w-full max-w-md" color="rgba(201, 162, 57, 0.14)">
        <div className="p-6 sm:p-8">
          <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-gp-gold/80">Golden Pax v0.5</p>
          <h1 className="mb-1 text-2xl font-semibold text-slate-100">Вход за стол</h1>
          <p className="mb-5 text-center text-xs text-slate-400">API: {health}</p>

          <div className="mb-5 grid grid-cols-2 gap-2">
            <HoverBorderGradient
              type="button"
              onClick={() => setTab("player")}
              className={cn(tab === "player" && "border-cyan-500/40 text-white")}
              containerClassName="w-full"
            >
              <span className="flex items-center justify-center gap-1.5">
                <IconUser size={16} aria-hidden />
                Игрок
              </span>
            </HoverBorderGradient>
            <HoverBorderGradient
              type="button"
              onClick={() => setTab("gm")}
              className={cn(tab === "gm" && "border-gp-gold/40 text-white")}
              containerClassName="w-full"
            >
              <span className="flex items-center justify-center gap-1.5">
                <IconShield size={16} aria-hidden />
                GM
              </span>
            </HoverBorderGradient>
          </div>

          <form onSubmit={onSubmit} className="space-y-1">
            <GlassField label="Кампания">
              <select
                className={`${glassInputClass} [color-scheme:dark]`}
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                required
              >
                {campaigns.length === 0 ? <option value="">Нет кампаний</option> : null}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </GlassField>

            {tab === "player" ? (
              <GlassField label="Код (4 цифры)">
                <input
                  className={cn(glassInputClass, "tracking-[0.4em]")}
                  value={playerToken}
                  onChange={(e) => setPlayerToken(digits4(e.target.value))}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="••••"
                  required
                />
              </GlassField>
            ) : (
              <GlassField label="Код мастера (4 цифры)">
                <input
                  className={cn(glassInputClass, "tracking-[0.4em]")}
                  value={masterToken}
                  onChange={(e) => setMasterToken(digits4(e.target.value))}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="••••"
                  required
                />
              </GlassField>
            )}

            <MovingBorder
              type="submit"
              disabled={!canSubmit}
              containerClassName="mt-4 w-full"
              innerClassName="w-full py-2.5"
            >
              {loading ? "Вход…" : tab === "player" ? "Войти как игрок" : "Войти как GM"}
            </MovingBorder>
          </form>

          {errorText ? (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {errorText}
            </p>
          ) : null}
        </div>
      </CardSpotlight>
    </div>
  );
}
