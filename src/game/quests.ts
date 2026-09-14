import type { Point2 } from './logic';

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface DialogueLine {
  /** speaker label; empty for narration */
  who: string;
  text: string;
}

export interface NpcQuest {
  id: string;
  npcName: string;
  npcRole: string;
  /** color used for hologram + marker */
  color: number;
  position: [number, number, number];
  /** which way the NPC faces (radians, y) */
  facing: number;
  questTitle: string;
  /** short objective shown in the quest tracker while active */
  objective: string;
  /** lines shown the first time you talk (offering the quest) */
  offer: DialogueLine[];
  /** lines shown while the quest is active but not yet complete */
  inProgress: DialogueLine[];
  /** lines shown when the completion condition is met and you turn it in */
  turnIn: DialogueLine[];
  /** lines shown after the quest is done */
  afterDone: DialogueLine[];
  /** reward line surfaced as a toast on turn-in */
  reward: string;
}

export const npcQuests: NpcQuest[] = [
  {
    id: 'warden',
    npcName: '守灯人',
    npcRole: '大厅管理系统 · 全息',
    color: 0x63e6f0,
    position: [4.6, 0, 12.5],
    facing: -2.4,
    questTitle: '唤醒大厅',
    objective: '找到配电终端，恢复备用供电',
    offer: [
      { who: '守灯人', text: '……侦测到活体信号。你是第一个在停机后走进来的人。' },
      { who: '守灯人', text: '主电源已离线四百余日。我只剩最后一格备用电量维持投影。' },
      { who: '守灯人', text: '去西侧找到配电终端，接通备用回路——让这座灯塔重新睁开眼睛。' },
      { who: '', text: '（任务已接取：唤醒大厅）' },
    ],
    inProgress: [
      { who: '守灯人', text: '配电终端在西侧廊道，覆着灰的那台。接通它，我才能为你打开更多权限。' },
    ],
    turnIn: [
      { who: '守灯人', text: '……供电恢复了。谢谢你，幸存者。' },
      { who: '守灯人', text: '传送核心已解除锁定。但在启动它之前，你需要先弄清这里发生过什么。' },
      { who: '', text: '（任务完成：唤醒大厅）' },
    ],
    afterDone: [
      { who: '守灯人', text: '灯还亮着。只要还有光，就还有人可能回应。' },
    ],
    reward: '守灯人授予你核心访问权限 · 供电已恢复',
  },
  {
    id: 'ranger',
    npcName: '老康',
    npcRole: '地表勘探队 · 拾荒者',
    color: 0xffb066,
    position: [13.5, 0, 8.5],
    facing: -2.1,
    questTitle: '拾回声',
    objective: '在大厅各处收集至少 4 条回声记录',
    offer: [
      { who: '老康', text: '嘿，别站在光里发呆。你也是冲着那些「回声」来的吧？' },
      { who: '老康', text: '这大厅到处是没被清理的记录——头盔、留言、异常回波……每一段都是一个没回来的人。' },
      { who: '老康', text: '替我把它们凑齐，至少四段。我要确认……我兄弟是不是还在名单上。' },
      { who: '', text: '（任务已接取：拾回声）' },
    ],
    inProgress: [
      { who: '老康', text: '还差几段呢。头盔在西边，留言在东边，异常回波在最里头。去吧。' },
    ],
    turnIn: [
      { who: '老康', text: '……都在这了。B-27，那是他的编号。' },
      { who: '老康', text: '拿着这个，我的补给你用得上。剩下的路，替我们走完。' },
      { who: '', text: '（任务完成：拾回声）' },
    ],
    afterDone: [
      { who: '老康', text: '我在这儿守着。你要是找到了真相，回来告诉我一声。' },
    ],
    reward: '老康分给你一份勘探补给 · 士气 +1',
  },
  {
    id: 'signal',
    npcName: '岚',
    npcRole: '失联信号员 · 残响',
    color: 0xa88bff,
    position: [-12.5, 0, -10.5],
    facing: 0.7,
    questTitle: '确认真相',
    objective: '回到中央控制台，写下你相信的那个版本',
    offer: [
      { who: '岚', text: '……你能看见我？那说明供电真的回来了。' },
      { who: '岚', text: '我是岚。或者说，是留在信号里的岚。真正的我，已经不确定还在不在。' },
      { who: '岚', text: '大厅收集够了回声之后，去中央控制台——把故事写完整。只有那样，我们才知道该不该回应地表。' },
      { who: '', text: '（任务已接取：确认真相）' },
    ],
    inProgress: [
      { who: '岚', text: '先凑齐回声，再去核心。别急着相信第一段呼救……它会用我们希望听见的声音。' },
    ],
    turnIn: [
      { who: '岚', text: '你写下了自己的版本。无论对错，这座灯塔从此有了新的现实。' },
      { who: '岚', text: '谢谢你，让我以某种方式……被记得。' },
      { who: '', text: '（任务完成：确认真相）' },
    ],
    afterDone: [
      { who: '岚', text: '故事已经完整了。剩下的，是你要不要继续留在这里。' },
    ],
    reward: '岚的残响归于平静 · 结局已铭刻',
  },
];

/** Distance within which an NPC can be greeted (E / tap). */
export function nearestNpc(position: Point2, radius = 3.1): NpcQuest | null {
  return npcQuests
    .map(npc => ({ npc, d: Math.hypot(npc.position[0] - position.x, npc.position[2] - position.z) }))
    .filter(v => v.d < radius)
    .sort((a, b) => a.d - b.d)[0]?.npc ?? null;
}

/** Pure state machine used by both the game and the tests. */
export interface QuestProgressInput {
  status: QuestStatus;
  powered: boolean;      // power investigation done
  echoCount: number;     // number of investigations inspected
  ending: string | null; // story finalized
}

/** Given the current quest status and world facts, decide whether it can be turned in. */
export function questReadyToTurnIn(questId: string, w: QuestProgressInput): boolean {
  if (w.status !== 'active') return false;
  if (questId === 'warden') return w.powered;
  if (questId === 'ranger') return w.echoCount >= 4;
  if (questId === 'signal') return w.ending !== null;
  return false;
}

/** Compute the display status for a quest from raw status + world facts. */
export function resolveQuestStatus(questId: string, w: QuestProgressInput): QuestStatus {
  if (w.status === 'done') return 'done';
  if (w.status === 'active') return questReadyToTurnIn(questId, w) ? 'ready' : 'active';
  return w.status;
}
