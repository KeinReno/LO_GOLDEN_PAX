import { RESOURCE_META, RESOURCE_POOL } from "./resourcePool.generated";
import { isPaintDeposit } from "./resourceIndex";
import { paintTagExtras } from "./depositAliases";

export {
  paintTagExtras,
  resourcesHas,
  sameDepositToken,
  toggleDeposit,
  uniqueDepositTokens,
} from "./depositAliases";

/** GM brush / system generator pool (Russian names). */
export function depositPaintPool(): readonly string[] {
  return RESOURCE_POOL.filter((name) => {
    const meta = RESOURCE_META[name];
    if (!meta) return false;
    return isPaintDeposit(meta);
  });
}

/** Paint chips: leftover stub tiles stay visible so the GM can remove them. */
export function paintTagList(current: string[] | undefined): string[] {
  const pool = depositPaintPool();
  return [...paintTagExtras(current, pool), ...pool];
}
