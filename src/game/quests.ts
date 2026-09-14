import type { Point2 } from './logic';

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface DialogueLine {
  /** speaker label; empty for narration */
  who: string;
  text: string;
}

/** Concrete, granted-on-turn-in reward bundle. */
export interface QuestReward {
  /** 勘探度经验值 */
  exp: number;
  /** 回声值 (E) */
  echo: number;
  /** 能量 (⚡) */
  energy: number;
  /** short flavour line + what it unlocks */
  title: string;
  unlock: string;
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
  /** total number of steps needed to complete (drives the progress bar) */
  goal: number;
  /** lines shown the first time you talk (offering the quest) */
  offer: DialogueLine[];
  /** lines shown while the quest is active but not yet complete */
  inProgress: DialogueLine[];
  /** lines shown when the completion condition is met and you turn it in */
  turnIn: DialogueLine[];
  /** lines shown after the quest is done */
  afterDone: DialogueLine[];
  /** concrete reward granted on turn-in */
  reward: QuestReward;
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
    objective: '在西侧廊道找到配电终端，接通备用回路',
    goal: 1,
    offer: [
      { who: '守灯人', text: '……侦测到活体信号。你是第一个在停机后走进来的人。' },
      { who: '守灯人', text: '主电源已离线四百余日。我只剩最后一格备用电量维持投影。' },
      { who: '守灯人', text: '去西侧找到配电终端，接通备用回路——让这座灯塔重新睁开眼睛。' },
      { who: '', text: '（任务已接取：唤醒大厅 · 进度将随你的调查实时更新）' },
    ],
    inProgress: [
      { who: '守灯人', text: '配电终端在西侧廊道，覆着灰的那台。走近它，按住 E 接通——别急着松手。' },
      { who: '守灯人', text: '我能感觉到你还没找到它。灯还没亮。' },
    ],
    turnIn: [
      { who: '守灯人', text: '……供电恢复了。谢谢你，幸存者。' },
      { who: '守灯人', text: '传送核心已解除锁定。但在启动它之前，你需要先弄清这里发生过什么。' },
      { who: '', text: '（任务完成：唤醒大厅）' },
    ],
    afterDone: [
      { who: '守灯人', text: '灯还亮着。只要还有光，就还有人可能回应。' },
    ],
    reward: { exp: 60, echo: 40, energy: 25, title: '核心访问权限', unlock: '解锁：中央控制台蓄能' },
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
    goal: 4,
    offer: [
      { who: '老康', text: '嘿，别站在光里发呆。你也是冲着那些「回声」来的吧？' },
      { who: '老康', text: '这大厅到处是没被清理的记录——头盔、留言、异常回波……每一段都是一个没回来的人。' },
      { who: '老康', text: '替我把它们凑齐，至少四段。我要确认……我兄弟是不是还在名单上。' },
      { who: '', text: '（任务已接取：拾回声 0 / 4 · 每调查一处回声进度 +1）' },
    ],
    inProgress: [
      { who: '老康', text: '还差几段呢。头盔在西边，留言在东边，异常回波在最里头——四处都别落下。' },
      { who: '老康', text: '走近发光的终端，按 E 调查。凑够四段再回来找我。' },
    ],
    turnIn: [
      { who: '老康', text: '……都在这了。B-27，那是他的编号。' },
      { who: '老康', text: '拿着这个，我的补给你用得上。剩下的路，替我们走完。' },
      { who: '', text: '（任务完成：拾回声）' },
    ],
    afterDone: [
      { who: '老康', text: '我在这儿守着。你要是找到了真相，回来告诉我一声。' },
    ],
    reward: { exp: 120, echo: 90, energy: 15, title: '勘探补给包', unlock: '解锁：老康的地表补给' },
  },
  {
    id: 'signal',
    npcName: '岚',
    npcRole: '失联信号员 · 残响',
    color: 0xa88bff,
    position: [-12.5, 0, -10.5],
    facing: 0.7,
    questTitle: '确认真相',
    objective: '集齐 4 段回声后，回到中央控制台写下结局',
    goal: 5,
    offer: [
      { who: '岚', text: '……你能看见我？那说明供电真的回来了。' },
      { who: '岚', text: '我是岚。或者说，是留在信号里的岚。真正的我，已经不确定还在不在。' },
      { who: '岚', text: '大厅收集够了回声之后，去中央控制台——把故事写完整。只有那样，我们才知道该不该回应地表。' },
      { who: '', text: '（任务已接取：确认真相 · 需先集齐回声，再在核心写下结局）' },
    ],
    inProgress: [
      { who: '岚', text: '先凑齐四段回声，再去核心。别急着相信第一段呼救……它会用我们希望听见的声音。' },
      { who: '岚', text: '走到中央控制台，按住 E 蓄能，你就能写下自己的版本。' },
    ],
    turnIn: [
      { who: '岚', text: '你写下了自己的版本。无论对错，这座灯塔从此有了新的现实。' },
      { who: '岚', text: '谢谢你，让我以某种方式……被记得。' },
      { who: '', text: '（任务完成：确认真相）' },
    ],
    afterDone: [
      { who: '岚', text: '故事已经完整了。剩下的，是你要不要继续留在这里。' },
    ],
    reward: { exp: 240, echo: 60, energy: 40, title: '结局铭刻徽章', unlock: '解锁：真相档案 · 结局已铭刻' },
  },
];

/** How many steps of a quest are currently satisfied (drives the progress bar). */
export function questProgress(questId: string, w: QuestProgressInput): { current: number; goal: number } {
  if (questId === 'warden') return { current: w.powered ? 1 : 0, goal: 1 };
  if (questId === 'ranger') return { current: Math.min(4, w.echoCount), goal: 4 };
  if (questId === 'signal') {
    // 4 echoes gathered + 1 ending written = 5 steps
    const gathered = Math.min(4, w.echoCount);
    return { current: gathered + (w.ending ? 1 : 0), goal: 5 };
  }
  return { current: 0, goal: 1 };
}

/** Player progression: level derived from cumulative exp. */
export const LEVEL_STEP = 300;
export function levelFromExp(exp: number): { level: number; into: number; span: number; ratio: number } {
  const level = Math.floor(exp / LEVEL_STEP) + 1;
  const into = exp % LEVEL_STEP;
  return { level, into, span: LEVEL_STEP, ratio: into / LEVEL_STEP };
}

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
