import { useEffect, useMemo, useState } from "react";
import type { PerfMode, FactionOption } from "./viewerSessionPrefs";
import { PERF_OPTIONS } from "./viewerSessionPrefs";
import type { MapStyleId } from "../renderers/styles/mapTheme";
import { MAP_STYLE_OPTIONS } from "../ui/mapStylePrefs";
import { LoginAtmosphere } from "./login/LoginAtmosphere";
import { CampaignCarousel } from "./login/CampaignCarousel";
import {
  FALLBACK_GATE_CAMPAIGNS,
  GATE_MODES,
  campaignsForMode,
  coverflowNeighbors,
  defaultCampaignId,
  digitsKey,
  type GateCampaign,
  type GateModeId,
} from "./login/gateCatalog";

export interface ViewerLoginProps {
  factions: FactionOption[];
  factionId: string;
  password: string;
  loginPerf: PerfMode;
  loginMapStyle: MapStyleId;
  error: string | null;
  isLoggingIn?: boolean;
  mobile: boolean;
  onFactionIdChange: (id: string) => void;
  onPasswordChange: (pw: string) => void;
  onLoginPerfChange: (mode: PerfMode) => void;
  onLoginMapStyleChange: (style: MapStyleId) => void;
  onReloadFactions: () => void;
  onSubmit: () => void;
}

export function ViewerLogin({
  factions,
  password,
  loginPerf,
  loginMapStyle,
  error,
  isLoggingIn = false,
  mobile,
  onFactionIdChange: _onFactionIdChange,
  onPasswordChange,
  onLoginPerfChange,
  onLoginMapStyleChange,
  onReloadFactions,
  onSubmit,
}: ViewerLoginProps) {
  const [mode, setMode] = useState<GateModeId>("strategia");
  const [overlay, setOverlay] = useState<GateCampaign[]>(FALLBACK_GATE_CAMPAIGNS);
  const campaigns = useMemo(
    () => campaignsForMode(mode, overlay),
    [mode, overlay],
  );
  const [campaignId, setCampaignId] = useState(() =>
    defaultCampaignId(FALLBACK_GATE_CAMPAIGNS),
  );

  const selected = campaigns.find((c) => c.id === campaignId) ?? null;
  const liveReady = Boolean(selected?.live);
  const canSubmit = liveReady && password.length >= 4 && !isLoggingIn;
  const seatHint = factions.length
    ? `${factions.length} держав у стола`
    : "Синхронизация стола…";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gate-campaigns")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { campaigns?: GateCampaign[] } | null) => {
        if (cancelled || !Array.isArray(data?.campaigns) || !data.campaigns.length) {
          return;
        }
        setOverlay(data.campaigns);
        setCampaignId((cur) =>
          data.campaigns!.some((c) => c.id === cur)
            ? cur
            : defaultCampaignId(data.campaigns!),
        );
      })
      .catch(() => {
        /* keep fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modeHit = GATE_MODES.find((m) => m.hotkey === e.key.toUpperCase());
      if (modeHit) {
        e.preventDefault();
        setMode(modeHit.id);
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const { prev, next } = coverflowNeighbors(campaigns, campaignId);
      const dest = e.key === "ArrowLeft" ? prev : next;
      if (!dest) return;
      e.preventDefault();
      setCampaignId(dest.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [campaigns, campaignId]);

  return (
    <div className="viewer-login">
      <LoginAtmosphere />
      <div className="login-hub">
        <header className="login-brand">
          <p className="login-eyebrow">Вход к столу</p>
          <h1>
            <span>The Legends of</span>
            <span>Oberon</span>
          </h1>
        </header>

        <div className="login-modes" role="tablist" aria-label="Режимы">
          {GATE_MODES.map((m) => {
            const selectedMode = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={selectedMode}
                className={`login-mode ${selectedMode ? "is-active" : ""} ${
                  m.live ? "" : "is-soon"
                }`}
                onClick={() => setMode(m.id)}
              >
                <span className="login-mode-hotkey">{m.hotkey}</span>
                <span className="login-mode-label">{m.label}</span>
                {!m.live ? <span className="login-mode-soon">скоро</span> : null}
              </button>
            );
          })}
        </div>

        <CampaignCarousel
          campaigns={campaigns}
          campaignId={campaignId}
          seatHint={seatHint}
          onSelect={setCampaignId}
        />

        {liveReady ? (
          <form
            className="login-keydock"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              onSubmit();
            }}
          >
            <input
              type="text"
              name="username"
              autoComplete="username"
              className="login-sr-only"
              value={campaignId}
              readOnly
              tabIndex={-1}
              aria-hidden
            />
            <label className="login-key-field">
              <span>Ключ доступа</span>
              <input
                className="login-key-input"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(digitsKey(e.target.value))}
                placeholder="••••"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={8}
                aria-label="Ключ доступа"
              />
            </label>

            <details className="login-advanced">
              <summary>Параметры карты</summary>
              <div className="login-perf">
                <span className="login-perf-label">Режим карты</span>
                {mobile && (
                  <p className="hint login-perf-rec">
                    С телефона: <strong>Суперлайт</strong> — самый плавный.
                  </p>
                )}
                <div
                  className="login-perf-options"
                  role="radiogroup"
                  aria-label="Режим карты"
                >
                  {PERF_OPTIONS.filter(
                    (opt) => !(mobile && opt.desktopOnly),
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={loginPerf === opt.id}
                      className={`login-perf-card ${
                        loginPerf === opt.id ? "active" : ""
                      } ${mobile && opt.mobileRec ? "recommended" : ""}`}
                      onClick={() => onLoginPerfChange(opt.id)}
                    >
                      <strong>
                        {opt.label}
                        {mobile && opt.mobileRec ? " · реком." : ""}
                      </strong>
                      <span>{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="login-perf">
                <span className="login-perf-label">Язык карты</span>
                <div
                  className="login-perf-options"
                  role="radiogroup"
                  aria-label="Язык карты"
                >
                  {MAP_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={loginMapStyle === opt.id}
                      className={`login-perf-card ${
                        loginMapStyle === opt.id ? "active" : ""
                      }`}
                      onClick={() => onLoginMapStyleChange(opt.id)}
                    >
                      <strong>{opt.label}</strong>
                      <span>{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>

            <button
              type="submit"
              className="login-enter"
              disabled={!canSubmit}
              aria-busy={isLoggingIn}
            >
              <span>{isLoggingIn ? "Вход…" : "Войти к столу"}</span>
            </button>
          </form>
        ) : (
          <p className="login-soon-note">
            {selected
              ? `${selected.title} ещё закрыта. Выберите Golden Pax, чтобы сесть за стол.`
              : "Выберите кампанию."}
          </p>
        )}

        <div className="login-foot">
          <button type="button" className="login-refresh" onClick={onReloadFactions}>
            Обновить стол
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
