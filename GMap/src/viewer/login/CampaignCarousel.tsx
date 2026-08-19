import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GateCampaign } from "./gateCatalog";
import { coverflowNeighbors, coverflowStep } from "./gateCatalog";
import { ThreeDCampaignCard } from "./ThreeDCampaignCard";

const SPRING = { type: "spring", stiffness: 380, damping: 34, mass: 0.85 } as const;

const trackV = {
  enter: (dir: number) => ({ x: `${dir * 22}%`, opacity: 0.2 }),
  rest: { x: "0%", opacity: 1 },
  exit: (dir: number) => ({
    x: `${dir * -22}%`,
    opacity: 0.2,
    pointerEvents: "none" as const,
  }),
};

export function CampaignCarousel({
  campaigns,
  campaignId,
  seatHint,
  onSelect,
}: {
  campaigns: GateCampaign[];
  campaignId: string;
  seatHint?: string;
  onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const lastId = useRef(campaignId);
  const dir = useRef<1 | -1>(1);
  if (lastId.current !== campaignId) {
    dir.current = coverflowStep(campaigns, lastId.current, campaignId);
    lastId.current = campaignId;
  }

  const { prev, center, next } = coverflowNeighbors(campaigns, campaignId);
  if (!center) return null;

  const transition = reduce ? { duration: 0 } : SPRING;

  return (
    <div className="login-coverflow">
      <button
        type="button"
        className="login-coverflow-nav"
        aria-label="Предыдущая кампания"
        disabled={!prev}
        onClick={() => prev && onSelect(prev.id)}
      >
        <ChevronLeft size={22} strokeWidth={1.75} />
      </button>
      <div className="login-coverflow-viewport">
        <AnimatePresence initial={false} custom={dir.current}>
          <motion.div
            key={center.id}
            className="login-coverflow-track"
            role="list"
            aria-label="Кампании"
            custom={dir.current}
            variants={trackV}
            initial="enter"
            animate="rest"
            exit="exit"
            transition={transition}
          >
            {prev ? (
              <div className="login-coverflow-slot is-prev" role="listitem">
                <ThreeDCampaignCard
                  campaign={prev}
                  center={false}
                  onSelect={onSelect}
                />
              </div>
            ) : null}
            <motion.div
              className="login-coverflow-slot is-center"
              role="listitem"
              initial={reduce ? false : { scale: 0.92 }}
              animate={{ scale: 1 }}
              transition={transition}
            >
              <ThreeDCampaignCard
                campaign={center}
                seatHint={seatHint}
                center
                onSelect={onSelect}
              />
            </motion.div>
            {next ? (
              <div className="login-coverflow-slot is-next" role="listitem">
                <ThreeDCampaignCard
                  campaign={next}
                  center={false}
                  onSelect={onSelect}
                />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
      <button
        type="button"
        className="login-coverflow-nav"
        aria-label="Следующая кампания"
        disabled={!next}
        onClick={() => next && onSelect(next.id)}
      >
        <ChevronRight size={22} strokeWidth={1.75} />
      </button>
    </div>
  );
}
