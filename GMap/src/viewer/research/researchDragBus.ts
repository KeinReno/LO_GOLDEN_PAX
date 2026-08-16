/** Cross-widget research drag payload (touch + legacy bridge). */
let techDragId: string | null = null;
let cognitioDragging = false;

export function setTechDragId(id: string | null) {
  techDragId = id;
}

export function getTechDragId(): string | null {
  return techDragId;
}

export function setCognitioDragging(on: boolean) {
  cognitioDragging = on;
}

export function isCognitioDragging(): boolean {
  return cognitioDragging;
}

/** Defer clear so HTML5 drop handlers still read the id on dragend. */
export function clearTechDragIdDeferred() {
  window.setTimeout(() => {
    techDragId = null;
  }, 0);
}
