import { useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { FactionNpc, InternalBloc } from "../../state/types";
import {
  blocKindLabel,
  stanceLabel,
} from "../../state/courtGovernance";
import { DropZone } from "../../ui/DropZone";
import { useSpotlight } from "../../ui/aceternityFx";

/**
 * Houses workplace — drop NPC onto a house card to appoint the head.
 */
export function CourtHousesView({
  blocs,
  npcs,
  accent,
  selectedId,
  targetBlocId,
  onSelectNpc,
  onVacantPick,
  onDropLeader,
  busy,
}: {
  blocs: InternalBloc[];
  npcs: FactionNpc[];
  accent?: string;
  selectedId?: string | null;
  targetBlocId?: string | null;
  onSelectNpc: (id: string | null) => void;
  onVacantPick?: (blocId: string) => void;
  onDropLeader: (npcId: string, blocId: string) => void;
  busy?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const ranked = [...blocs].sort(
    (a, b) => (b.influence || 0) - (a.influence || 0),
  );
  // Exact NPC ids — replaces "*" now that CardBoard is shared app-wide.
  const npcCardIds = useMemo(() => npcs.map((n) => n.id), [npcs]);

  if (ranked.length === 0) {
    return (
      <section className="court-houses" aria-label="Дома">
        <p className="hint court-empty-state">
          Внутренних домов пока нет — появятся с каноном фракции.
        </p>
      </section>
    );
  }

  return (
    <section className="court-houses" aria-label="Дома">
      <p className="hint court-houses__lede">
        Клик по дому без главы, затем «Глава» в пуле — или перетащите лицо.
      </p>
      <ul className="court-houses-bento">
        {ranked.map((b, i) => {
          const vacant =
            (b.kind === "house" ||
              b.kind === "church" ||
              b.kind === "race_caucus") &&
            !b.leaderNpcId;
          const leader = b.leaderNpcId
            ? npcs.find((n) => n.id === b.leaderNpcId)
            : null;
          const members = npcs.filter((n) => n.blocId === b.id);
          const open = expandedId === b.id;
          return (
            <HouseCard
              key={b.id}
              bloc={b}
              index={i}
              vacant={vacant}
              targeted={targetBlocId === b.id}
              leader={leader}
              members={members}
              open={open}
              accent={accent}
              selectedNpcId={selectedId}
              busy={busy}
              onToggle={() =>
                setExpandedId((id) => (id === b.id ? null : b.id))
              }
              onSelectNpc={onSelectNpc}
              onVacantPick={onVacantPick}
              onDropLeader={onDropLeader}
              acceptCardIds={npcCardIds}
            />
          );
        })}
      </ul>
    </section>
  );
}

function HouseCard({
  bloc,
  index,
  vacant,
  targeted,
  leader,
  members,
  open,
  accent,
  selectedNpcId,
  busy,
  onToggle,
  onSelectNpc,
  onVacantPick,
  onDropLeader,
  acceptCardIds,
}: {
  bloc: InternalBloc;
  index: number;
  vacant: boolean;
  targeted?: boolean;
  leader: FactionNpc | null | undefined;
  members: FactionNpc[];
  open: boolean;
  accent?: string;
  selectedNpcId?: string | null;
  busy?: boolean;
  onToggle: () => void;
  onSelectNpc: (id: string | null) => void;
  onVacantPick?: (blocId: string) => void;
  onDropLeader: (npcId: string, blocId: string) => void;
  acceptCardIds: string[];
}) {
  const spot = useSpotlight();
  const color = bloc.color || accent || "var(--accent)";
  const influence = Math.max(0, Math.min(100, bloc.influence || 0));

  return (
    <motion.li
      className={`court-house-card court-house-card--${bloc.stance}${
        vacant ? " is-vacant" : ""
      }${targeted ? " is-target" : ""}${open ? " is-open" : ""}`}
      style={{ ["--house-accent" as string]: color } as CSSProperties}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
    >
      <DropZone
        zoneId={`house:${bloc.id}`}
        accepts={acceptCardIds}
        armWhileDragging
        onDrop={(cardId) => onDropLeader(cardId, bloc.id)}
        className="court-house-drop fx-spotlight"
        contentLayout="stack"
        label={bloc.name}
      >
        <div
          className="court-house-card__inner"
          {...spot.bind}
          style={
            {
              ["--fx-spot-color" as string]: color,
            } as CSSProperties
          }
        >
          <button
            type="button"
            className="court-house-card__hit"
            onClick={() => {
              if (vacant) onVacantPick?.(bloc.id);
              onToggle();
            }}
            aria-expanded={open}
            disabled={busy}
          >
            <span
              className="court-house-card__dot"
              style={{ background: color }}
              aria-hidden
            />
            <span className="court-house-card__titles">
              <strong>{bloc.name}</strong>
              <span className="hint">
                {blocKindLabel(bloc.kind)} · {stanceLabel(bloc.stance)}
                {vacant ? " · престол вакантен" : ""}
              </span>
            </span>
            <span className="court-house-card__stat" title="Влияние">
              {bloc.influence}
            </span>
          </button>

          <div
            className="court-house-card__bar"
            role="meter"
            aria-valuenow={influence}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Влияние"
          >
            <span style={{ width: `${influence}%` }} />
          </div>

          <p className="court-house-card__leader hint">
            {leader ? (
              <>
                Глава:{" "}
                <button
                  type="button"
                  className="court-house-card__link"
                  onClick={() =>
                    onSelectNpc(
                      selectedNpcId === leader.id ? null : leader.id,
                    )
                  }
                >
                  {leader.name}
                </button>
              </>
            ) : vacant ? (
              "Нет главы · выбрать, затем назначить из пула"
            ) : (
              "Без обозначенного главы"
            )}
            {members.length > 0 ? ` · ${members.length} лиц` : ""}
          </p>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                className="court-house-card__body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28 }}
              >
                {bloc.description ? (
                  <p className="hint">{bloc.description}</p>
                ) : null}
                <div className="court-house-card__meters hint">
                  опора {bloc.support ?? 0} · угроза {bloc.threat ?? 0}
                </div>
                {members.length > 0 ? (
                  <ul className="court-house-members">
                    {members.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className={
                            selectedNpcId === m.id ? "is-selected" : undefined
                          }
                          onClick={() =>
                            onSelectNpc(
                              selectedNpcId === m.id ? null : m.id,
                            )
                          }
                        >
                          {m.name}
                          {m.id === bloc.leaderNpcId || m.isBlocLeader
                            ? " · глава"
                            : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Нет приписанных лиц.</p>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DropZone>
    </motion.li>
  );
}
