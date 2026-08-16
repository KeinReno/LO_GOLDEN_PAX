import { ViewerPlaySession } from "./ViewerPlaySession";

/**
 * Player `/view` route shell. Auth, map, orders, combat and rooms live in
 * `ViewerPlaySession` plus `features/*` and `hooks/*` (see VIEWER_PAGE_REFACTOR_BLUEPRINT).
 */
export function ViewerPage() {
  return <ViewerPlaySession />;
}
