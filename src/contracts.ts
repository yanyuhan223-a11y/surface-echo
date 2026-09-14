export type GameMode = 'intro' | 'play' | 'tour' | 'paused';
export type MoveDirection = 'forward' | 'backward' | 'left' | 'right';

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
}

export interface GameUIProps {
  mode: GameMode;
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
}
