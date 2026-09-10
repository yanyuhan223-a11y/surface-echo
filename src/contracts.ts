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
}
