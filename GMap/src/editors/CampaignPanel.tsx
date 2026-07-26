import { RpChat, type RpChatProps } from "./RpChat";

/** @deprecated thin alias — use RpChat directly. */
export function CampaignPanel(props: RpChatProps) {
  return (
    <section className="campaign-panel">
      <h3>Кампания · RP</h3>
      <RpChat {...props} layout="panel" />
    </section>
  );
}

export { RpChat };
