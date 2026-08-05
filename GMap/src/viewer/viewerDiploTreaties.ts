import { DIPLOMACY_LABELS, DIPLOMACY_RELATIONS } from "../state/defaults";

/** Treaties available in deal packages (incl. A8 types). */
export const VIEWER_TREATY_OPTIONS = DIPLOMACY_RELATIONS.filter(
  (r) => r !== "vassal",
).map((id) => ({ id, label: DIPLOMACY_LABELS[id] }));
