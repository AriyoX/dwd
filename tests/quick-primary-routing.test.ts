import { describe, it, expect } from 'vitest';
import { quickEntryDestination } from '@/features/quick-log/entry-routing';
describe('normal DWD entry and invitation priority', () => {
  it('leaves guests in the logger and retains the signed-in home', () => {
    expect(quickEntryDestination(null)).toBeNull();
    expect(quickEntryDestination('account')).toBe('/home');
  });
  it('prioritizes valid and invalid invitations over the generic entry', () => {
    for (const owner of [null, 'account']) {
      expect(quickEntryDestination(owner, 'a'.repeat(43))).toBe(`/join/${'a'.repeat(43)}`);
      for (const invalid of [
        'bad',
        '//example.com',
        'a/b',
        'a?next=/home',
        ['a'.repeat(43), 'b'.repeat(43)],
      ])
        expect(quickEntryDestination(owner, invalid)).toBe('/join/invalid');
    }
  });
});
