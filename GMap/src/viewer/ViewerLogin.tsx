import type { PerfMode, FactionOption } from "./viewerSessionPrefs";
import { PERF_OPTIONS } from "./viewerSessionPrefs";
import type { MapStyleId } from "../renderers/styles/mapTheme";
import { MAP_STYLE_OPTIONS } from "../ui/mapStylePrefs";

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
  factionId,
  password,
  loginPerf,
  loginMapStyle,
  error,
  isLoggingIn = false,
  mobile,
  onFactionIdChange,
  onPasswordChange,
  onLoginPerfChange,
  onLoginMapStyleChange,
  onReloadFactions,
  onSubmit,
}: ViewerLoginProps) {
  return (
    <div className="viewer-login">
      <div className="login-card">
        <p className="login-eyebrow">Доступ к кампании</p>
        <h1>LO GOLDEN PAX</h1>
        <p className="hint" style={{ textAlign: "center" }}>
          После входа — карта галактики. Штаб, наука, рынок и сцена — внизу.
        </p>
        {factions.length === 0 && !error && (
          <p className="hint">Синхронизация списка держав…</p>
        )}
        <button type="button" className="btn" onClick={onReloadFactions}>
          Обновить список
        </button>
        {factions.length > 0 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLoggingIn) return;
              onSubmit();
            }}
          >
            <label className="field">
              <span>Держава / фракция</span>
              <select
                value={factionId}
                onChange={(e) => onFactionIdChange(e.target.value)}
              >
                {factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Код доступа</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                style={{ display: "none" }}
                value={factionId}
                readOnly
              />
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Код доступа"
                autoComplete="current-password"
              />
            </label>

            <div className="login-perf">
              <span className="login-perf-label">Режим карты</span>
              {mobile && (
                <p className="hint login-perf-rec">
                  С телефона: <strong>Суперлайт</strong> — самый плавный,{" "}
                  <strong>Качество</strong> — красивее без лагов при зуме.
                </p>
              )}
              <div
                className="login-perf-options"
                role="radiogroup"
                aria-label="Режим карты"
              >
                {PERF_OPTIONS.filter((opt) => !(mobile && opt.desktopOnly)).map(
                  (opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={loginPerf === opt.id}
                      className={`login-perf-card ${loginPerf === opt.id ? "active" : ""} ${
                        mobile && opt.mobileRec ? "recommended" : ""
                      }`}
                      onClick={() => onLoginPerfChange(opt.id)}
                    >
                      <strong>
                        {opt.label}
                        {mobile && opt.mobileRec ? " · реком." : ""}
                      </strong>
                      <span>{opt.hint}</span>
                    </button>
                  ),
                )}
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
                    className={`login-perf-card ${loginMapStyle === opt.id ? "active" : ""}`}
                    onClick={() => onLoginMapStyleChange(opt.id)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="btn primary"
              disabled={isLoggingIn}
              aria-busy={isLoggingIn}
            >
              {isLoggingIn ? "Вход..." : "Войти к столу"}
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
