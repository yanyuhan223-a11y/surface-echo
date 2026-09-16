export type GameMode = 'intro' | 'play' | 'tour' | 'paused';
export type MoveDirection = 'forward' | 'backward' | 'left' | 'right';
/** Which level the player is in. */
export type Zone = 'hall' | 'surface';

export interface InvestigationTarget {
  id: string;
  title: string;
  hint: string;
}

export interface InvestigationRecord {
  title: string;
  subtitle: string;
  body: string[];
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface DialogueView {
  npcName: string;
  npcRole: string;
  color: string;
  lines: { who: string; text: string }[];
  /** which button to show at the end of this dialogue */
  action: 'accept' | 'turnin' | 'close';
  questTitle: string;
}

export interface QuestView {
  id: string;
  title: string;
  objective: string;
  npcName: string;
  status: QuestStatus;
  /** how many completion steps are satisfied */
  current: number;
  /** total steps needed */
  goal: number;
}

/** Live player progression, shown in the hub capsules and HUD. */
export interface PlayerProgress {
  level: number;
  /** exp accumulated into the current level */
  levelInto: number;
  /** exp needed per level */
  levelSpan: number;
  /** cumulative echo value (E) */
  echo: number;
  /** cumulative energy (⚡) */
  energy: number;
  /** completed quest count */
  questsDone: number;
  /** total quest count */
  questsTotal: number;
}

/** Reward settlement panel shown on quest turn-in. */
export interface RewardView {
  questTitle: string;
  npcName: string;
  color: string;
  exp: number;
  echo: number;
  energy: number;
  unlock: string;
  rewardTitle: string;
  /** true when this turn-in pushed the player to a new level */
  leveledUp: boolean;
  newLevel: number;
  /** true when this was the final quest (all done) */
  allDone: boolean;
}

/** Live readouts for the surface (地表) combat HUD, styled after the recon overlay. */
export interface SurfaceView {
  /** health / armour */
  hp: number; maxHp: number;
  armor: number; maxArmor: number;
  /** weapon */
  mag: number; magSize: number; reserve: number;
  reloading: boolean;
  /** mission */
  beastsAlive: number;
  beastsTotal: number;
  /** true once every beast is down and the pad is hot */
  extractionOpen: boolean;
  /** player is standing on the extraction pad */
  onPad: boolean;
  /** metres to the extraction beacon */
  beaconDistance: number;
  /** environment telemetry */
  temp: number;
  humidity: number;
  pressure: number;
  wind: number;
  elevation: number;
  fogDensity: number;
  /** bio-sign monitor */
  heartRate: number;
  spo2: number;
  stress: number;
  /** flashes the damage vignette */
  hurt: number;
  /** run outcome */
  outcome: 'alive' | 'down' | 'extracted';
  /** radar blips, relative to the player, already rotated into view space (-1..1) */
  blips: { x: number; y: number; kind: 'beast' | 'beacon' }[];
}

export interface GameUIProps {
  mode: GameMode;
  zone: Zone;
  ready: boolean;
  progress: number;
  objective: string;
  investigated: number;
  target: InvestigationTarget | null;
  activeRecord: InvestigationRecord | null;
  toast: string | null;
  muted: boolean;
  cinematic: boolean;
  overlooking: boolean;
  activation: number;
  activated: boolean;
  storyOpen: boolean;
  ending: 'human' | 'mimic' | 'future' | null;
  error: string | null;
  dialogue: DialogueView | null;
  quests: QuestView[];
  progressStats: PlayerProgress;
  reward: RewardView | null;
  /** present only while zone === 'surface' */
  surface: SurfaceView | null;
  /** true when the hall teleport pad is charged and can drop the player to the surface */
  canDeploy: boolean;
  onStart: () => void;
  onTour: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleMute: () => void;
  onToggleView: () => void;
  onCloseRecord: () => void;
  onInteract: () => void;
  onRestart: () => void;
  onMove: (direction: MoveDirection, pressed: boolean) => void;
  /** Optional: use for touch/keyboard hold interaction. Never required for investigation. */
  onInteractionHold?: (pressed: boolean) => void;
  onCloseStory: () => void;
  onChooseStory: (ending: 'human' | 'mimic' | 'future') => void;
  onDialogueAction: (action: 'accept' | 'turnin' | 'close') => void;
  onCloseReward: () => void;
  /** drop from the hall teleport pad down to the ash surface */
  onDeploy: () => void;
  /** fire the railgun (surface only) */
  onFire: () => void;
  /** reload the railgun (surface only) */
  onReload: () => void;
  /** leave the surface — extraction success, or retreat after going down */
  onExtract: () => void;
}
