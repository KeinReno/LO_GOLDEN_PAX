import type { GmLiveDomainId } from "../../state/types";
import type { GmAttentionItem } from "./buildGmAttention";

/** Encode attention payload for DropZone handlers on target wells. */
export function encodeAttentionCard(item: GmAttentionItem): string {
  return [
    "gm-attn",
    item.domain,
    item.factionId || "-",
    item.systemId || "-",
  ].join("|");
}

export function parseAttentionCard(cardId: string): {
  domain: GmLiveDomainId;
  factionId: string | null;
  systemId: string | null;
} | null {
  if (!cardId.startsWith("gm-attn|")) return null;
  const parts = cardId.split("|");
  if (parts.length < 4) return null;
  return {
    domain: parts[1] as GmLiveDomainId,
    factionId: parts[2] === "-" ? null : parts[2],
    systemId: parts[3] === "-" ? null : parts[3],
  };
}
