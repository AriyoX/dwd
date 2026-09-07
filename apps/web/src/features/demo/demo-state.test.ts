import { describe, expect, it } from 'vitest';
import { DEMO_STORAGE_KEY, demoLog, readDemo, sampleNight } from './demo-state';

describe('isolated demo activity', () => {
  it('changes the sample host without editing the original fixture', () => {
    const original = sampleNight();
    const changed = demoLog(original, 'demo-you', 'beer');
    expect(changed.participants[0]?.entries).toHaveLength(3);
    expect(original.participants[0]?.entries).toHaveLength(2);
  });
  it('does not let a host log for an account participant or add alcohol to water-only guests', () => {
    const original = sampleNight();
    expect(demoLog(original, 'demo-mika', 'beer')).toEqual(original);
    expect(demoLog(original, 'demo-robin', 'beer')).toEqual(original);
    expect(demoLog(original, 'demo-robin', 'water').participants[2]?.entries).toHaveLength(2);
  });
  it('finished demo nights are read-only', () => {
    const ended = { ...sampleNight(), ended: true };
    expect(demoLog(ended, 'demo-you', 'water')).toBe(ended);
  });
  it('reads only its dedicated key and recovers from corrupt or blocked storage', () => {
    const keys: string[] = [];
    expect(
      readDemo({
        getItem: (key) => {
          keys.push(key);
          return '{broken';
        },
      }),
    ).toEqual(sampleNight());
    expect(keys).toEqual([DEMO_STORAGE_KEY]);
    expect(
      readDemo({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual(sampleNight());
    expect(readDemo({ getItem: () => JSON.stringify({ ...sampleNight(), version: 999 }) })).toEqual(
      sampleNight(),
    );
  });
});
