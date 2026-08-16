import { ViewerLogin } from "../../ViewerLogin";
import { useViewerAuth } from "../../hooks/useViewerAuth";

type Auth = ReturnType<typeof useViewerAuth>;

export function ViewerPlayLoginGate({
  mobile,
  auth,
  onLogin,
}: {
  mobile: boolean;
  auth: Auth;
  onLogin: () => void | Promise<void>;
}) {
  return (
    <ViewerLogin
      factions={auth.factions}
      factionId={auth.factionId}
      password={auth.password}
      loginPerf={auth.loginPerf}
      loginMapStyle={auth.loginMapStyle}
      error={auth.error}
      isLoggingIn={auth.isLoggingIn}
      mobile={mobile}
      onFactionIdChange={auth.setFactionId}
      onPasswordChange={auth.setPassword}
      onLoginPerfChange={auth.setLoginPerf}
      onLoginMapStyleChange={auth.setLoginMapStyle}
      onReloadFactions={() => void auth.loadFactions()}
      onSubmit={() => void onLogin()}
    />
  );
}
