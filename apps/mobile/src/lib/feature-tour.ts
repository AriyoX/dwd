export const FEATURE_TOUR_STEPS = [
  {
    id: 'start',
    route: '/',
    title: 'Start a night',
    message: 'Choose your drinks, shared bottles and a planned finish when you start a night.',
  },
  {
    id: 'join',
    route: '/',
    title: "Join a friend's night",
    message: 'Open an invite from a friend, then join with your own drink plan.',
  },
  {
    id: 'entries',
    route: '/history',
    title: 'Look back on your nights',
    message:
      'Finished nights appear here. Open a recap to see your entries and add photo memories.',
  },
  {
    id: 'notifications',
    route: '/notifications',
    title: 'Stay in the loop',
    message:
      'Manage notifications for reminders and check-ins on this page. Messages appear in the inbox below.',
  },
  {
    id: 'reminders',
    route: '/account',
    title: 'Choose your reminders',
    message: 'Open Night reminders to choose when DWD reminds you to log a drink or have a chaser.',
  },
  {
    id: 'settings',
    route: '/account',
    title: 'Make it yours',
    message:
      'Choose your appearance here. To replay this tour, open Explore DWD in Help & privacy.',
  },
] as const;

export type TourStep = (typeof FEATURE_TOUR_STEPS)[number];
export type TourTargetId = TourStep['id'];
export type TourRoute = TourStep['route'];
export type TourBox = { x: number; y: number; width: number; height: number };

/** Both measurements must come from the same native window. */
export function relativeTourBox(target: TourBox, container: TourBox): TourBox {
  return { ...target, x: target.x - container.x, y: target.y - container.y };
}

export function sameTourBox(a: TourBox | null, b: TourBox) {
  return (
    a !== null &&
    (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(a[key] - b[key]) < 0.5)
  );
}

export function tourScrollOffset(target: TourBox, viewport: TourBox, offset: number) {
  const top = viewport.y + 12;
  const bottom = viewport.y + viewport.height - 12;
  const roomForCard = Math.max(target.y - top, bottom - target.y - target.height);
  if (
    target.y >= top &&
    target.y + target.height <= bottom &&
    roomForCard >= Math.min(200, viewport.height / 2)
  )
    return null;
  return Math.max(0, offset + target.y - top);
}

export function tourSpotlight(target: TourBox, viewport: TourBox): TourBox | null {
  const x = Math.max(viewport.x + 4, target.x - 5);
  const y = Math.max(viewport.y + 4, target.y - 5);
  const right = Math.min(viewport.x + viewport.width - 4, target.x + target.width + 5);
  const bottom = Math.min(viewport.y + viewport.height - 4, target.y + target.height + 5);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function tourCardLayout(box: TourBox | null, viewport: TourBox, contentHeight: number) {
  const top = viewport.y + 8;
  const bottom = viewport.y + viewport.height - 8;
  if (!box) return { top, maxHeight: Math.max(0, bottom - top) };
  const above = Math.max(0, box.y - 12 - top);
  const below = Math.max(0, bottom - box.y - box.height - 12);
  if (below >= contentHeight || below >= above) {
    return { top: box.y + box.height + 12, maxHeight: below };
  }
  return { top: Math.max(top, box.y - 12 - contentHeight), maxHeight: above };
}
