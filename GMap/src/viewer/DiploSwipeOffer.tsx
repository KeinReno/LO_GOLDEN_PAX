import { useEffect, useRef, useState } from "react";
import { useDrag } from "@use-gesture/react";
import { motion, useMotionValue, useTransform, useReducedMotion } from "motion/react";
import { HoldButton } from "./shared/HoldButton";
import { useRipple } from "../ui/aceternityFx";

/**
 * Swipeable inbox card: swipe right → accept (routine deals), left → reject.
 * Irreversible packages require hold on Accept; swipe-accept is disabled then.
 */
export function DiploSwipeOffer({
  title,
  subtitle,
  busy,
  focused,
  needsHold,
  onAccept,
  onReject,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
  focused?: boolean;
  needsHold?: boolean;
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
  const holdAccept = !!needsHold;

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
        if (mx > 0 && holdAccept) {
          x.set(0);
          return;
        }
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
        style={{ opacity: holdAccept ? 0 : acceptOpacity }}
        aria-hidden
      >
        Принять
      </motion.div>
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
                {holdAccept
                  ? "← свайп отклонить · принять — удержать"
                  : "← свайп отклонить · принять свайп →"}
              </p>
            )}
          </div>
          <div className="deal-inbox-actions gc-swipe-offer__actions">
            {holdAccept ? (
              <HoldButton
                className="btn sm primary hold-btn--danger"
                ms={700}
                disabled={busy || locked}
                holdHint="Удерживайте: принять сделку"
                onConfirm={() => {
                  setLocked(true);
                  onAccept();
                }}
              >
                Удержать · принять
              </HoldButton>
            ) : (
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
            )}
            <button
              type="button"
              className="btn sm ghost"
              disabled={busy || locked}
              onClick={() => {
                if (locked || busy) return;
                setLocked(true);
                onReject();
              }}
            >
              Отклонить
            </button>
          </div>
        </motion.div>
      </div>
    </li>
  );
}
