import { useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { motion, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import { HoldButton } from "../ui/HoldButton";
import { useRipple } from "../ui/aceternityFx";

/**
 * Aceternity-ish swipeable inbox card:
 * swipe right → accept, left → reject. Buttons remain for a11y / touch fallback.
 */
export function DiploSwipeOffer({
  title,
  subtitle,
  busy,
  focused,
  onAccept,
  onReject,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
  focused?: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const acceptOpacity = useTransform(x, [0, 80], [0, 1]);
  const rejectOpacity = useTransform(x, [-80, 0], [1, 0]);
  const [locked, setLocked] = useState(false);
  const triggered = useRef(false);
  const ripple = useRipple();

  useEffect(() => {
    if (!busy) {
      setLocked(false);
      triggered.current = false;
    }
  }, [busy]);

  useEffect(() => {
    setLocked(false);
    triggered.current = false;
  }, [title]);

  const bind = useDrag(
    ({ down, movement: [mx], last, cancel }) => {
      if (busy || locked || reduce) return;
      if (Math.abs(mx) > 140 && !down && !triggered.current) {
        triggered.current = true;
        setLocked(true);
        if (mx > 0) onAccept();
        else onReject();
        cancel?.();
        return;
      }
      x.set(down ? mx : 0);
      if (last && !triggered.current) x.set(0);
    },
    { axis: "x", filterTaps: true, from: () => [x.get(), 0] },
  );

  return (
    <li className={`gc-swipe-offer${focused ? " is-focus" : ""}`}>
      <motion.div
        className="gc-swipe-offer__rail gc-swipe-offer__rail--reject"
        style={{ opacity: rejectOpacity }}
        aria-hidden
      >
        Отклонить
      </motion.div>
      <motion.div
        className="gc-swipe-offer__rail gc-swipe-offer__rail--accept"
        style={{ opacity: acceptOpacity }}
        aria-hidden
      >
        Принять
      </motion.div>
      {/* Plain hit host for use-gesture — avoids onDrag clash with motion */}
      <div
        className="gc-swipe-offer__hit"
        style={{ touchAction: reduce || busy ? "auto" : "pan-y" }}
        {...(reduce || busy ? {} : bind())}
      >
        <motion.div className="gc-swipe-offer__card fx-spotlight" style={{ x }}>
          <div>
            <strong>{title}</strong>
            <p className="hint">{subtitle}</p>
            {!reduce && (
              <p className="gc-swipe-offer__gesture hint">
                ← свайп отклонить · принять свайп →
              </p>
            )}
          </div>
          <div className="deal-inbox-actions">
            <button
              type="button"
              className="btn sm primary fx-magnetic fx-ripple-host"
              disabled={busy || locked}
              {...ripple.bind}
              onClick={() => {
                if (locked || busy) return;
                setLocked(true);
                onAccept();
              }}
            >
              Принять
            </button>
            <HoldButton
              className="btn sm ghost"
              ms={500}
              disabled={busy || locked}
              onConfirm={() => {
                setLocked(true);
                onReject();
              }}
            >
              Отклонить
            </HoldButton>
          </div>
        </motion.div>
      </div>
    </li>
  );
}
