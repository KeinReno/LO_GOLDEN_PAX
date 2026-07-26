import { createContext, useContext, type ReactNode } from "react";
import { useCampaignSession, fmtTime } from "./useCampaignSession";

export { fmtTime };

type Session = ReturnType<typeof useCampaignSession>;

const Ctx = createContext<Session | null>(null);

/** Raw context for optional consumers (e.g. viewer without provider). */
export const CampaignSessionCtx = Ctx;

export function CampaignSessionProvider({ children }: { children: ReactNode }) {
  const session = useCampaignSession();
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useCampaignSessionCtx(): Session {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useCampaignSessionCtx outside CampaignSessionProvider");
  }
  return ctx;
}
