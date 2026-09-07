import { describe, expect, it } from 'vitest';
import { addTourDrink, createTourNight, undoTourDrink } from './sample-state';
import { canChangeTourInPlace, normalReturnPath, stepAtLocation, tourSteps } from './steps';
import { placeCoach } from './position';

describe('isolated tour state', () => {
  it('adds and undoes entries without mutating the source or another member', () => {
    const initial = createTourNight(1_800_000_000_000);
    const copy = structuredClone(initial);
    const logged = addTourDrink(
      initial,
      'alcohol',
      undefined,
      initial.currentMemberId,
      1_800_000_001_000,
    );
    expect(initial).toEqual(copy);
    expect(logged.members[0]?.drinkLogs).toHaveLength(2);
    expect(logged.members[1]).toEqual(initial.members[1]);
    expect(undoTourDrink(logged)).toEqual(initial);
    const water = addTourDrink(
      initial,
      'water',
      undefined,
      initial.currentMemberId,
      1_800_000_001_000,
    );
    expect(water.members[0]?.waterLogs).toHaveLength(2);
    expect(undoTourDrink(water)).toEqual(initial);
    expect(createTourNight(1_800_000_000_000)).toEqual(initial);
    expect(initial.night.id).toBe('tour');
  });
});

describe('tour routes', () => {
  it('changes local options without refetching while keeping server data transitions intact', () => {
    expect(canChangeTourInPlace('/home', '/home?tour=join')).toBe(true);
    expect(canChangeTourInPlace('/night/tour', '/night/tour?view=group&tour=group')).toBe(true);
    expect(canChangeTourInPlace('/home', '/night/tour?tour=log')).toBe(false);
    expect(canChangeTourInPlace('/history', '/history?tour=history')).toBe(false);
    expect(canChangeTourInPlace('/night/real', '/night/real?tour=log')).toBe(false);
  });
  it('resolves each screen and the real history summary route', () => {
    tourSteps.forEach((step, index) => {
      for (const route of [step.route, step.follow?.route].filter((value) => value !== undefined)) {
        const url = new URL(route, 'https://example.test');
        expect(stepAtLocation(url.pathname, url.search)).toBe(index);
      }
    });
    expect(stepAtLocation('/night/real-night', '?tour=log')).toBe(-1);
    expect(stepAtLocation('/home', '?tour=group')).toBe(-1);
    expect(stepAtLocation('/night/tour', '?view=group&tour=log')).toBe(-1);
  });
  it('returns only to normal app pages and preserves a real invitation setup', () => {
    expect(normalReturnPath('/night/real?setup=1')).toBe('/night/real?setup=1');
    expect(normalReturnPath('/account')).toBe('/account');
    for (const path of [
      '//example.com',
      'https://example.com',
      '/night/tour',
      '/home?tour=start',
      '/login',
      '/\\example.com',
    ])
      expect(normalReturnPath(path)).toBe('/home');
  });
});

describe('coach positioning', () => {
  it.each([390, 1440])('fits a %i px viewport without covering its target', (width) => {
    const viewport = { left: 0, top: 0, width, height: 700 };
    const target = { left: 20, top: 40, width: 300, height: 120 };
    const card = { width: 350, height: 240 };
    const result = placeCoach(target, card, viewport, 'right');
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.left + card.width).toBeLessThanOrEqual(width - 12);
    expect(result.top + card.height).toBeLessThanOrEqual(688);
    expect(result.top >= 176 || result.left >= 336).toBe(true);
  });
  it('switches above a low target and requests repositioning when no side fits', () => {
    expect(
      placeCoach(
        { left: 20, top: 600, width: 300, height: 50 },
        { width: 350, height: 240 },
        { left: 0, top: 0, width: 390, height: 700 },
        'bottom',
      )?.side,
    ).toBe('top');
    expect(
      placeCoach(
        { left: 20, top: 200, width: 300, height: 300 },
        { width: 350, height: 240 },
        { left: 0, top: 0, width: 390, height: 700 },
      ),
    ).toBeNull();
  });
});
