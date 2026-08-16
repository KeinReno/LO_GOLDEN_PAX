import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { cn } from "../../../lib/utils";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+=●◆◇";

function generateRandomString(length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return out;
}

type EvervaultCardProps = {
  text?: string;
  className?: string;
  children?: ReactNode;
};

/** Aceternity Evervault Card — encrypted grid reveal on hover. */
export function EvervaultCard({ text, className, children }: EvervaultCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [randomString, setRandomString] = useState("");

  useEffect(() => {
    setRandomString(generateRandomString(1200));
  }, []);

  function onMouseMove(e: MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }

  return (
    <div
      className={cn(
        "group/card relative flex w-full flex-col overflow-hidden rounded-xl border border-cyan-500/15 bg-slate-950/80",
        className,
      )}
      onMouseMove={onMouseMove}
    >
      <CardPattern mouseX={mouseX} mouseY={mouseY} randomString={randomString} />
      <div className="relative z-10 p-4">
        {text ? (
          <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-widest text-cyan-500/60">{text}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function CardPattern({
  mouseX,
  mouseY,
  randomString,
}: {
  mouseX: ReturnType<typeof useMotionValue<number>>;
  mouseY: ReturnType<typeof useMotionValue<number>>;
  randomString: string;
}) {
  const maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`;
  const style = { maskImage, WebkitMaskImage: maskImage };

  return (
    <div className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute inset-0 rounded-xl bg-gradient-to-br from-gp-gold/30 via-cyan-500/20 to-gp-gold/10 opacity-0 backdrop-blur-md transition duration-500 group-hover/card:opacity-100"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-xl opacity-0 mix-blend-soft-light group-hover/card:opacity-80"
        style={style}
      >
        <p className="absolute inset-0 h-full break-all p-2 font-mono text-[0.45rem] leading-tight text-cyan-100/90">
          {randomString}
        </p>
      </motion.div>
    </div>
  );
}
