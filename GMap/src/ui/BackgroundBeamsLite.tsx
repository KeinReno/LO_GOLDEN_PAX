import { isLikelyMobile } from "../viewer/useViewerViewport";

/** Curved paths — subtle Aceternity Background Beams port (SVG + CSS, no canvas). */
const BEAM_PATHS = [
  "M-20 100 Q 80 20, 200 60 T 420 40",
  "M-10 110 Q 120 80, 220 30 T 440 70",
  "M0 90 Q 100 10, 210 50 T 430 20",
  "M30 120 Q 140 40, 250 80 T 460 50",
  "M-30 70 Q 90 90, 190 20 T 400 90",
];

/**
 * Scoped background beams for a single panel (e.g. diplomacy faceoff).
 * Disabled under prefers-reduced-motion via CSS.
 */
export function BackgroundBeamsLite({ className = "" }: { className?: string }) {
  if (isLikelyMobile()) return null;
  return (
    <div
      className={["fx-beams-lite", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      <svg
        className="fx-beams-lite__svg"
        viewBox="0 0 400 120"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="fx-beam-grad-diplo" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop
              offset="0%"
              stopColor="var(--accent-holo, #7a9bb8)"
              stopOpacity="0"
            />
            <stop
              offset="35%"
              stopColor="var(--accent, #c9a227)"
              stopOpacity="0.55"
            />
            <stop
              offset="65%"
              stopColor="var(--accent-holo, #7a9bb8)"
              stopOpacity="0.45"
            />
            <stop
              offset="100%"
              stopColor="var(--accent)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        {BEAM_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            className="fx-beams-lite__path"
            stroke="url(#fx-beam-grad-diplo)"
            style={{ animationDelay: `${i * 1.1}s`, animationDuration: `${7 + i}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
