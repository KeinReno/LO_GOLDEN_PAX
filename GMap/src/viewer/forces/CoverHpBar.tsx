import { compositionHpRatio } from "../../state/forceReadiness";
import type { ShipGroup } from "../../state/types";

export function CoverHpBar({
  composition,
}: {
  composition: ShipGroup[] | undefined;
}) {
  const ratio = compositionHpRatio(composition);
  if (ratio == null) return null;
  const pct = Math.round(ratio * 100);
  const tone =
    pct < 40 ? "is-critical" : pct < 90 ? "is-hurt" : "";
  return (
    <span
      className={`forces-cover-hp ${tone}`.trim()}
      title={`Прочность ${pct}%`}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}
