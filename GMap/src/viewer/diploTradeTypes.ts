import type { DiplomacyRelation } from "../state/types";

export type DiploDealItem =
  | { kind: "resource"; currencyId: string; amount: number }
  | { kind: "treaty"; treaty: DiplomacyRelation }
  | { kind: "tech"; techId: string }
  | { kind: "fleet"; fleetId: string }
  | { kind: "legion"; legionId: string }
  | { kind: "system"; systemId: string };

export type DiploOffer = {
  id: string;
  fromFactionId: string;
  toFactionId: string;
  status: string;
  give: DiploDealItem[];
  want: DiploDealItem[];
  note?: string;
  createdTurn?: number;
  createdAt?: string;
};

export type DiploUnilateralStance = "war" | "embargo" | "break" | "insult";

export type TradeAsset = {
  id: string;
  name: string;
  where?: string;
  worlds?: string[];
  direction?: string;
};

export type TradeAssetPool = {
  fleets: TradeAsset[];
  legions: TradeAsset[];
  systems: TradeAsset[];
  techs: TradeAsset[];
};
