import { useEffect, useState } from "react";

type DiceRollerProps = {
  /** Final face value from the server (known before animation). */
  value: number;
  sides?: number;
  rolling?: boolean;
  durationMs?: number;
  className?: string;
  onSettled?: () => void;
};

/**
 * CSS 3D die — animates ~1.5s then settles on the server-known face.
 */
export function DiceRoller({
  value,
  sides = 6,
  rolling = false,
  durationMs = 1500,
  className = "",
  onSettled,
}: DiceRollerProps) {
  const [display, setDisplay] = useState(value);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!rolling) {
      setDisplay(value);
      setSpinning(false);
      return;
    }
    setSpinning(true);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      if (elapsed < durationMs) {
        setDisplay(1 + Math.floor(Math.random() * Math.max(1, sides)));
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
        setSpinning(false);
        onSettled?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rolling, value, sides, durationMs, onSettled]);

  const rot = spinning
    ? undefined
    : {
        // Map face → approximate cube orientation for d6
        transform: settleTransform(display, sides),
      };

  return (
    <div
      className={`dice-roller ${spinning ? "is-rolling" : "is-settled"} ${className}`.trim()}
      aria-live="polite"
      aria-label={`Кубик d${sides}: ${display}`}
    >
      <div className="dice-cube" style={rot}>
        <span className="dice-face dice-face--front">{display}</span>
        <span className="dice-face dice-face--back" aria-hidden>
          {sides}
        </span>
        <span className="dice-face dice-face--right" aria-hidden>
          {Math.max(1, display - 1)}
        </span>
        <span className="dice-face dice-face--left" aria-hidden>
          {Math.min(sides, display + 1)}
        </span>
        <span className="dice-face dice-face--top" aria-hidden>
          {Math.max(1, (display % sides) + 1)}
        </span>
        <span className="dice-face dice-face--bottom" aria-hidden>
          {Math.max(1, ((display + 2) % sides) + 1)}
        </span>
      </div>
      <p className="dice-result-text" data-reveal={!spinning || undefined}>
        {spinning ? "…" : display}
      </p>
    </div>
  );
}

function settleTransform(value: number, sides: number): string {
  if (sides !== 6) {
    return `rotateX(${value * 37}deg) rotateY(${value * 53}deg)`;
  }
  const map: Record<number, string> = {
    1: "rotateX(0deg) rotateY(0deg)",
    2: "rotateX(0deg) rotateY(-90deg)",
    3: "rotateX(-90deg) rotateY(0deg)",
    4: "rotateX(90deg) rotateY(0deg)",
    5: "rotateX(0deg) rotateY(90deg)",
    6: "rotateX(0deg) rotateY(180deg)",
  };
  return map[value] || map[1];
}
