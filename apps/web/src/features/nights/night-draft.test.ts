import { describe, expect, it } from 'vitest';
import { nightDraftKey, readNightDraft, type NightDraft } from './night-draft';

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const draft: NightDraft = {
  version: 1,
  userId: first,
  creationKey: first,
  inviteToken: 'a'.repeat(43),
  step: 3,
  title: 'Friday',
  endTime: '22:00',
  endDate: '2026-09-07',
  withPeople: true,
  hostPlan: [],
  guests: [{ clientId: second, displayName: '', planItems: [] }],
};
describe('unfinished night setup', () => {
  it('restores incomplete fields, water-only choices, step and retry identifiers', () => {
    expect(readNightDraft({ getItem: () => JSON.stringify(draft) }, first)).toEqual(draft);
  });
  it('looks up only the current account and rejects a draft belonging to another account', () => {
    const keys: string[] = [];
    expect(
      readNightDraft(
        {
          getItem: (key) => {
            keys.push(key);
            return JSON.stringify(draft);
          },
        },
        second,
      ),
    ).toBeNull();
    expect(keys).toEqual([nightDraftKey(second)]);
    expect(nightDraftKey(first)).not.toBe(nightDraftKey(second));
  });
  it('survives malformed, future-version, and unavailable storage', () => {
    for (const value of [
      '{broken',
      JSON.stringify({ ...draft, version: 2 }),
      JSON.stringify({ ...draft, creationKey: 'invalid' }),
    ])
      expect(readNightDraft({ getItem: () => value }, first)).toBeNull();
    expect(
      readNightDraft(
        {
          getItem: () => {
            throw new Error('denied');
          },
        },
        first,
      ),
    ).toBeNull();
  });
});
