const messages: Record<string, string> = {
  unauthenticated: 'Sign in again to save this entry.',
  invalid_input: 'Check the drink details.',
  invalid_custom_drink: 'Check the drink details.',
  invalid_time: 'Check the entry time.',
  future_time: 'Choose a time up to now.',
  too_old: 'This entry is too old to save.',
  member_unavailable: 'This person has left the night.',
  before_night: 'Choose a time after the night started.',
  permission_denied: "You can't log for this person.",
  after_actual_end: 'This entry was made after the night ended.',
  post_end_grace_expired: 'More than 24 hours have passed since the night ended.',
  plan_required: 'Set your plan before logging a drink.',
  plan_version_unavailable: 'Your plan changed. Choose a drink from your current plan.',
  drink_required: 'Choose a drink.',
  invalid_bottle: 'Check the bottle and serving size.',
  bottle_unavailable: 'Join a bottle before logging from it.',
  invalid_pour: 'Use a serving size from 1 to 2,000 ml.',
  bottle_empty: 'There is less left in this bottle. Choose a smaller serving.',
};

export function entryFailureMessage(code: string) {
  return messages[code] ?? "Couldn't save this entry. Try again.";
}

export function savedEntryFailureMessage(message: string) {
  // Older saved entries can contain raw API errors. Keep only consumer copy.
  return Object.values(messages).includes(message) ? message : entryFailureMessage('unknown');
}
