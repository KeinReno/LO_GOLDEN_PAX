import type { ViewerPayload } from "../../../state/types";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { ViewerQuestPanel } from "../../ViewerQuestPanel";
import { navigateViewerRoom } from "./navigateViewerRoom";

type QuestRes = {
  ok: boolean;
  error?: string;
  message?: string;
  count?: number;
  roll?: number;
  rolls?: number[];
  success?: boolean | null;
  quests?: { id?: string }[];
};

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  onFocusSystem: (systemId: string) => void;
  submitQuest: (
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<QuestRes>;
  submitIntent: (
    defId: string,
    args: Record<string, unknown>,
    note: string,
  ) => Promise<boolean>;
};

export function ViewerQuestsRoom({
  payload,
  mobile,
  onFocusSystem,
  submitQuest,
  submitIntent,
}: Props) {
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  return (
    <ViewerQuestPanel
      payload={payload}
      compact={mobile}
      onCloseMap={() => navigateViewerRoom("map")}
      onOpenCourt={() => navigateViewerRoom("court")}
      onFocusSystem={onFocusSystem}
      actions={{
        onThrowYearlyDice: async () => {
          const res = await submitQuest("throw_quest_dice");
          if (!res.ok) {
            return {
              ok: false,
              error: res.error || "Не удалось бросить ежеходный кубик",
            };
          }
          setOrderMsg(res.message || `Ежходные квесты: ${res.count ?? 0}`);
          const spawned = Array.isArray(res.quests)
            ? res.quests
                .map((q) => q?.id)
                .filter((id): id is string => Boolean(id))
            : [];
          return {
            ok: true,
            roll: res.roll,
            message: res.message,
            questIds: spawned,
          };
        },
        onResolveChoice: async (questId, choiceId) => {
          const res = await submitQuest("resolve_quest_choice", {
            questId,
            choiceId,
          });
          if (res.ok) setOrderMsg("Выбор по квесту применён");
          return {
            ok: res.ok,
            error: res.ok ? undefined : res.error || "Выбор не применён",
          };
        },
        onResolveDice: async (questId, specIndex, choiceId) => {
          const res = await submitQuest("resolve_quest_dice", {
            questId,
            specIndex,
            choiceId,
          });
          if (!res.ok) {
            return { ok: false, error: res.error || "Бросок не удался" };
          }
          setOrderMsg(res.message || "Бросок записан");
          return {
            ok: true,
            rolls: res.rolls,
            success: res.success,
            message: res.message,
          };
        },
        onGiveNpcTask: async (npcId, opts) => {
          await submitIntent(
            "intent.give_npc_task",
            {
              npcId,
              taskLabel: opts.taskLabel,
              etaTurn: opts.etaTurn,
              linkedQuestId: opts.linkedQuestId,
            },
            "Поручение для двора принято",
          );
        },
        onSendChat: async (questId, text) => {
          const res = await submitQuest("send_quest_message", {
            questId,
            message: text,
          });
          if (!res.ok) {
            setOrderMsg(res.error || "Не удалось отправить");
            return;
          }
          setOrderMsg(res.message || "Запись в журнале квеста");
        },
      }}
    />
  );
}
