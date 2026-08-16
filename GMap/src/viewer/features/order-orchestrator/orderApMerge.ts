export type ApMeters = {
  reservedAp: number;
  apMax: number;
  reservedForceAp: number;
  forceApMax: number;
};

export type ActionApPayload = {
  apMax?: number;
  reservedAp?: number;
  forceApMax?: number;
  reservedForceAp?: number;
  intent?: { apCost?: number; forceApCost?: number };
};

/** Merge server AP fields; if reserved* omitted, add intent/fallback cost. */
export function mergeActionAp(
  current: ApMeters,
  data: ActionApPayload,
  fallback?: { apCost?: number; forceCost?: number },
): ApMeters {
  const apCost = data.intent?.apCost ?? fallback?.apCost ?? 0;
  const forceCost = data.intent?.forceApCost ?? fallback?.forceCost ?? 0;
  return {
    apMax: typeof data.apMax === "number" ? data.apMax : current.apMax,
    forceApMax:
      typeof data.forceApMax === "number" ? data.forceApMax : current.forceApMax,
    reservedAp:
      typeof data.reservedAp === "number"
        ? data.reservedAp
        : current.reservedAp + (apCost || 0),
    reservedForceAp:
      typeof data.reservedForceAp === "number"
        ? data.reservedForceAp
        : current.reservedForceAp + (forceCost || 0),
  };
}

/** Cancel: if reserved* omitted, refund 1 (not add cost). */
export function mergeCancelAp(
  current: ApMeters,
  data: ActionApPayload,
): ApMeters {
  return {
    apMax: typeof data.apMax === "number" ? data.apMax : current.apMax,
    forceApMax:
      typeof data.forceApMax === "number" ? data.forceApMax : current.forceApMax,
    reservedAp:
      typeof data.reservedAp === "number"
        ? data.reservedAp
        : Math.max(0, current.reservedAp - 1),
    reservedForceAp:
      typeof data.reservedForceAp === "number"
        ? data.reservedForceAp
        : Math.max(0, current.reservedForceAp - 1),
  };
}
