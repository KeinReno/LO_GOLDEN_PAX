import { useEffect } from "react";
import { sumGmHqUnread } from "../state/rpReadState";

/** Keep the GM RP launcher badge alive even when the float desk is unmounted. */
export function useGmRpUnread(
  masterToken: string,
  onUnread: (n: number) => void,
): void {
  useEffect(() => {
    if (!masterToken) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/rp", {
          headers: { "X-Master-Token": masterToken },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          chapters?: Parameters<typeof sumGmHqUnread>[0];
        };
        const n = sumGmHqUnread(data.chapters || []);
        if (!cancelled) onUnread(n);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [masterToken, onUnread]);
}
