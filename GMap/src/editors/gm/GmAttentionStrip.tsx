import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { usePendingIntents, type IntentRow } from "../IntentsInbox";
import { DragCard } from "../../ui/DragCard";
import type { GmLiveDomainId } from "../../state/types";
import {
  buildGmAttention,
  type GmAttentionItem,
} from "./buildGmAttention";
import { encodeAttentionCard } from "./gmAttentionCard";

type EngagementLite = {
  id: string;
  status?: string;
  systemId?: string;
  theater?: string;
};

export function GmAttentionStrip({
  onOpenDomain,
  onOpenRightDock,
  gestureMode = false,
}: {
  onOpenDomain: (id: GmLiveDomainId) => void;
  onOpenRightDock?: () => void;
  gestureMode?: boolean;
}) {
  const world = useWorldStore((s) => s.world);
  const setActiveFaction = useWorldStore((s) => s.setActiveFaction);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);
  const { masterToken } = useCampaignSessionCtx();
  const { pending } = usePendingIntents();
  const [engagements, setEngagements] = useState<EngagementLite[]>([]);

  const refreshEngagements = useCallback(async () => {
    try {
      const res = await fetch("/api/engagements", {
        headers: { "X-Master-Token": masterToken },
      });
      if (!res.ok) return;
      const data = await res.json();
      setEngagements(data.engagements ?? []);
    } catch {
      /* quiet */
    }
  }, [masterToken]);

  useEffect(() => {
    void refreshEngagements();
    const id = window.setInterval(() => void refreshEngagements(), 8000);
    return () => window.clearInterval(id);
  }, [refreshEngagements, world.meta.turn, world.meta.tableRevision]);

  const items = useMemo(
    () =>
      buildGmAttention({
        world,
        pendingIntents: pending as IntentRow[],
        engagements,
      }),
    [world, pending, engagements],
  );

  const onActivate = (item: GmAttentionItem) => {
    if (item.factionId) setActiveFaction(item.factionId);
    if (item.systemId) focusCameraOnSystem(item.systemId);
    if (item.domain === "inbox") {
      onOpenRightDock?.();
      onOpenDomain("inbox");
      return;
    }
    onOpenDomain(item.domain);
  };

  if (items.length === 0) {
    return (
      <div className="gm-attention gm-attention--empty" role="status">
        <span className="gm-attention-kicker">Attention</span>
        <span className="gm-attention-idle">Стол спокоен</span>
      </div>
    );
  }

  return (
    <div
      className={`gm-attention ${gestureMode ? "gm-attention--gestures" : ""}`}
      role="list"
      aria-label="Требует внимания мастера"
    >
      <span className="gm-attention-kicker">Attention · {items.length}</span>
      <div className="gm-attention-scroll">
        {items.map((item) =>
          gestureMode ? (
            <DragCard
              key={item.id}
              cardId={encodeAttentionCard(item)}
              title={item.label}
              subtitle={item.detail}
              accent="var(--signal-warning)"
              tilt
              className={`gm-attention-chip gm-attention-chip--drag gm-attention-chip--${item.kind}`}
            >
              <button
                type="button"
                className="btn ghost gm-attention-chip-open"
                onClick={(e) => {
                  e.stopPropagation();
                  onActivate(item);
                }}
              >
                Открыть
              </button>
            </DragCard>
          ) : (
            <button
              key={item.id}
              type="button"
              role="listitem"
              className={`gm-attention-chip gm-attention-chip--${item.kind}`}
              onClick={() => onActivate(item)}
              title={item.detail ?? item.label}
            >
              <span className="gm-attention-chip-label">{item.label}</span>
              {item.detail && (
                <span className="gm-attention-chip-detail">{item.detail}</span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
