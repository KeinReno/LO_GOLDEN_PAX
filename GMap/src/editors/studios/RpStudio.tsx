import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { RpGmDesk } from "../../viewer/RpGmDesk";

export function RpStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();

  return (
    <RpGmDesk masterToken={masterToken} onMsg={setSyncMsg} layout="fill" />
  );
}
