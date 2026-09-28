import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('active-night product language and safety', () => {
  it('uses Chaser on every primary user-facing night surface', () => {
    const sources = [
      'apps/web/src/features/nights/night-content.tsx',
      'apps/web/src/features/nights/summary-screen.tsx',
      'apps/web/src/features/nights/history-screen.tsx',
      'apps/web/src/features/plans/plan-editor.tsx',
      'apps/web/src/features/tour/steps.ts',
      'apps/web/src/features/offline/ended-night-outbox.tsx',
    ].map(read);
    const userCopy = sources.join('\n');
    expect(userCopy).toContain('Chaser');
    expect(userCopy).not.toMatch(/['">](?:Log )?Water(?: only| entry| entries)?[<'"]/);
  });

  it('makes the selected participant and fast add-person action explicit', () => {
    const content = read('apps/web/src/features/nights/night-content.tsx');
    expect(content).toContain('Logging for');
    expect(content).toContain('Managed guest');
    expect(content).toContain('aria-pressed={selected}');
    expect(content).toContain('Add person');
  });

  it('keeps Quick Check factual and carries the required driving disclaimer', () => {
    const quickCheck = read('apps/web/src/features/quick-check/quick-check.tsx');
    expect(quickCheck).toContain(
      'This does not measure sobriety and must not be used to decide whether it is safe to drive.',
    );
    expect(quickCheck).not.toMatch(/estimate BAC|fit to drive|you are (?:sober|tipsy|drunk)/i);
  });
});
