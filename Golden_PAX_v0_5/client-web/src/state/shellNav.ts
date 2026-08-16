/** Shell navigation rooms — map stays mounted under overlays. */
export type ShellRoom = "map" | "economy" | "science" | "court" | "forces";

export const SHELL_ROOMS: { id: ShellRoom; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "economy", label: "Economy" },
  { id: "science", label: "Science" },
  { id: "court", label: "Court" },
  { id: "forces", label: "Forces" },
];

/** Dock subset — not every sidebar link (2-step nav rule). */
export const DOCK_ROOM_IDS: ShellRoom[] = ["economy", "science", "forces"];
