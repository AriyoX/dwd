import { z } from 'zod';

export const TOUR_STEPS = [
  'Make a plan',
  'Invite a friend',
  'Log and undo',
  'Share a bottle',
  'Check on friends',
  'Find help',
  'Your recap',
  'Keep a memory',
  'Choose reminders',
] as const;
const progressSchema = z.object({
  step: z
    .number()
    .int()
    .min(0)
    .max(TOUR_STEPS.length - 1),
  status: z.enum(['active', 'skipped', 'complete']),
});
export type TourProgress = z.infer<typeof progressSchema>;
export const tourKey = (owner: string) => `dwd.mobile.tour.v1:${owner}`;
export const tourSeenKey = (owner: string) => `dwd.mobile.highlights.v2:${owner}`;

export function shouldStartTour(storage: Pick<Storage, 'getItem'>, owner: string) {
  try {
    if (storage.getItem(tourSeenKey(owner)) === 'true') return false;
  } catch {
    /* The account preference and session guard still apply. */
  }
  // The native controls differ from the web tour and the retired practice tour.
  return true;
}

export function rememberTourSeen(storage: Pick<Storage, 'setItem'>, owner: string) {
  storage.setItem(tourSeenKey(owner), 'true');
}
export function readTourProgress(
  storage: Pick<Storage, 'getItem'>,
  owner: string,
): TourProgress | null {
  try {
    const result = progressSchema.safeParse(JSON.parse(storage.getItem(tourKey(owner)) ?? 'null'));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function saveTourProgress(
  storage: Pick<Storage, 'setItem'>,
  owner: string,
  progress: TourProgress,
) {
  storage.setItem(tourKey(owner), JSON.stringify(progressSchema.parse(progress)));
}
type Entry = { kind: 'drink' | 'chaser'; bottleMl: number };
export type PracticeState = {
  plan: 'beer' | 'chaser';
  entries: Entry[];
  warning: Entry | null;
  invited: boolean;
  checkedIn: boolean;
  helpOpen: boolean;
  memory: boolean;
  reminders: boolean;
};
export const initialPracticeState: PracticeState = {
  plan: 'beer',
  entries: [],
  warning: null,
  invited: false,
  checkedIn: false,
  helpOpen: false,
  memory: false,
  reminders: false,
};
export type PracticeAction =
  | { type: 'plan'; plan: PracticeState['plan'] }
  | { type: 'log'; kind: Entry['kind']; bottleMl?: number }
  | {
      type: 'confirm' | 'cancel' | 'undo' | 'invite' | 'check-in' | 'help' | 'memory' | 'reminders';
    };
export function practiceTotals(state: PracticeState) {
  return {
    drinks: state.entries.filter((e) => e.kind === 'drink').length,
    chasers: state.entries.filter((e) => e.kind === 'chaser').length,
    remainingMl: 750 - state.entries.reduce((sum, e) => sum + e.bottleMl, 0),
  };
}
// This reducer has no API, queue, session or storage dependencies. Practice
// entries cannot accidentally become real log commands.
export function practiceReducer(state: PracticeState, action: PracticeAction): PracticeState {
  const totals = practiceTotals(state);
  switch (action.type) {
    case 'plan':
      return { ...state, plan: action.plan, warning: null };
    case 'log': {
      if (state.warning || state.entries.length >= 20) return state;
      const bottleMl =
        action.kind === 'drink' && (action.bottleMl === 30 || action.bottleMl === 45)
          ? action.bottleMl
          : 0;
      if (bottleMl > totals.remainingMl) return state;
      const entry = { kind: action.kind, bottleMl };
      if (action.kind === 'drink' && totals.drinks >= (state.plan === 'beer' ? 2 : 0))
        return { ...state, warning: entry };
      return { ...state, entries: [...state.entries, entry] };
    }
    case 'confirm':
      return state.warning
        ? { ...state, entries: [...state.entries, state.warning], warning: null }
        : state;
    case 'cancel':
      return { ...state, warning: null };
    case 'undo':
      return { ...state, entries: state.entries.slice(0, -1), warning: null };
    case 'invite':
      return { ...state, invited: true };
    case 'check-in':
      return { ...state, checkedIn: true };
    case 'help':
      return { ...state, helpOpen: !state.helpOpen };
    case 'memory':
      return { ...state, memory: !state.memory };
    case 'reminders':
      return { ...state, reminders: !state.reminders };
  }
}
