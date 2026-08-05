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

export type TradeAssetPool = {
  fleets: { id: string; name: string }[];
  legions: { id: string; name: string }[];
  systems: { id: string; name: string }[];
  techs: { id: string; name: string }[];
};
