export const ALCOHOL_DENSITY_GRAMS_PER_ML = 0.789;
export const STANDARD_DRINK_GRAMS = 10;
export const NUMERIC_TOLERANCE_GRAMS = 0.01;

export const PERSONAL_PACE_THRESHOLD_GRAMS = 20;
export const PERSONAL_PACE_WINDOW_MINUTES = 60;
export const PERSONAL_PACE_COOLDOWN_MINUTES = 60;

export const GROUP_CHECK_IN_THRESHOLD_GRAMS = 40;
export const GROUP_CHECK_IN_WINDOW_MINUTES = 120;
export const GROUP_CHECK_IN_COOLDOWN_MINUTES = 120;

export const STALE_OFFLINE_ALERT_MINUTES = 15;
export const RECENT_CORRECTION_MINUTES = 15;
export const POST_END_SYNC_GRACE_HOURS = 24;
export const MAX_NIGHT_DURATION_HOURS = 24;
export const MAX_FUTURE_CONSUMED_AT_MINUTES = 5;
export const MAX_DELAYED_SYNC_DAYS = 7;

export const INPUT_LIMITS = {
  displayName: { min: 1, max: 60 },
  title: { min: 1, max: 80 },
  label: { min: 1, max: 60 },
  volumeMl: { min: 1, max: 2_000 },
  abvPercent: { minExclusive: 0, max: 95 },
  plannedQuantity: { min: 1, max: 50 },
  guests: { max: 20 },
  planItems: { min: 0, max: 20 },
} as const;

export const EMERGENCY_NUMBERS_UGANDA = ['112', '999'] as const;

export const EMERGENCY_SIGNS = [
  'Cannot remain conscious or cannot be awakened',
  'Repeated vomiting',
  'Seizure',
  'Slow or irregular breathing',
  'Severe confusion',
  'Clammy or unusually cold skin',
] as const;
