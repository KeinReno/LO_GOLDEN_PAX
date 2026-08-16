import type { WorldState } from "../../../state/types";

export function worldAfterSeatPortfolio(
  world: WorldState,
  factionId: string,
  seatId: string,
  portfolioId: string,
): WorldState {
  return {
    ...world,
    factions: world.factions.map((f) => {
      if (f.id !== factionId) return f;
      const council = f.council ?? { unlockedSeatIds: [] };
      return {
        ...f,
        council: {
          ...council,
          seatPortfolios: {
            ...(council.seatPortfolios ?? {}),
            [seatId]: portfolioId,
          },
        },
      };
    }),
  };
}

export function worldAfterBlocLeader(
  world: WorldState,
  factionId: string,
  npcId: string,
  blocId: string,
): WorldState {
  return {
    ...world,
    factions: world.factions.map((f) => {
      if (f.id !== factionId) return f;
      return {
        ...f,
        npcs: (f.npcs ?? []).map((n) => {
          if (n.id === npcId) return { ...n, blocId, isBlocLeader: true };
          if (n.blocId === blocId && n.isBlocLeader) {
            return { ...n, isBlocLeader: false };
          }
          return n;
        }),
        internalBlocs: (f.internalBlocs ?? []).map((b) =>
          b.id === blocId ? { ...b, leaderNpcId: npcId } : b,
        ),
      };
    }),
  };
}

export function worldAfterRaceLeader(
  world: WorldState,
  factionId: string,
  npcId: string,
  raceId: string,
  title?: string,
): WorldState {
  return {
    ...world,
    factions: world.factions.map((f) => {
      if (f.id !== factionId) return f;
      return {
        ...f,
        npcs: (f.npcs ?? []).map((n) => {
          if (n.id === npcId) {
            return {
              ...n,
              raceLeadership: title ? { raceId, title } : { raceId },
            };
          }
          if (n.raceLeadership?.raceId === raceId) {
            return { ...n, raceLeadership: null };
          }
          return n;
        }),
      };
    }),
  };
}

export function stockAlertMsg(on: boolean, name: string): string {
  return on
    ? `Слежение: «${name}» — предупреждение на Обзоре при низком запасе`
    : `Слежение снято: «${name}»`;
}
