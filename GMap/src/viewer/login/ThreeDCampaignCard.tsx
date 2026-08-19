import type { GateCampaign } from "./gateCatalog";
import { useTilt } from "../../ui/aceternityFx";

export function ThreeDCampaignCard({
  campaign,
  seatHint,
  center,
  onSelect,
}: {
  campaign: GateCampaign;
  seatHint?: string;
  center: boolean;
  onSelect: (id: string) => void;
}) {
  const tilt = useTilt(center ? 10 : 4);
  return (
    <button
      type="button"
      className={`td-card ${center ? "is-center" : "is-side"} ${
        campaign.live ? "" : "is-soon"
      }`}
      aria-pressed={center}
      onClick={() => onSelect(campaign.id)}
      {...tilt.bind}
    >
      <span className="td-card-body">
        <span className="td-card-art">
          {campaign.image ? (
            <img src={campaign.image} alt={campaign.title} />
          ) : (
            <span className={`td-card-fallback art-${campaign.id}`} />
          )}
        </span>
        <span className="td-card-kicker">{campaign.kicker}</span>
        <strong className="td-card-title">{campaign.title}</strong>
        {center ? (
          <span className="td-card-blurb">{campaign.blurb}</span>
        ) : null}
        {center ? (
          <span className="td-card-meta">
            {campaign.live
              ? seatHint || "Живой стол"
              : "Кампания ещё закрыта"}
          </span>
        ) : null}
      </span>
    </button>
  );
}
