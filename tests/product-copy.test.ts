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
    expect(content).toContain('You log for them');
    expect(content).toContain('aria-pressed={selected}');
    expect(content).toContain('Add person');
  });
});
