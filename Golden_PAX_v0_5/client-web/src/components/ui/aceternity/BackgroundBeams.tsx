import { cn } from "../../../lib/utils";

/** Subtle SVG beams for login backdrop (reduced vs marketing hero). */
export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden opacity-40", className)} aria-hidden>
      <svg
        className="absolute h-full w-full"
        viewBox="0 0 800 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <path
          d="M-50 80 L200 320 L450 120"
          stroke="url(#gp-beam-a)"
          strokeWidth="1"
          className="animate-pulse"
        />
        <path d="M100 600 L350 280 L650 480" stroke="url(#gp-beam-b)" strokeWidth="1" opacity="0.6" />
        <path d="M750 0 L520 260 L780 420" stroke="url(#gp-beam-a)" strokeWidth="0.75" opacity="0.5" />
        <defs>
          <linearGradient id="gp-beam-a" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#c9a239" stopOpacity="0" />
            <stop offset="0.5" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="1" stopColor="#c9a239" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gp-beam-b" x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="0.5" stopColor="#c9a239" stopOpacity="0.25" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-gp-map via-transparent to-gp-map" />
    </div>
  );
}
