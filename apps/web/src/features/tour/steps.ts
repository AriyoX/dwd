export type Placement = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export interface TourScreen {
  route: string;
  target: string;
  description: string;
}
export interface TourStep extends TourScreen {
  id: string;
  title: string;
  placement: Placement;
  sample?: 'night' | 'history';
  interactive?: boolean;
  onTargetClick?: string;
  follow?: TourScreen;
}

export const tourSteps: readonly TourStep[] = [
  {
    id: 'start',
    route: '/home?tour=start',
    target: 'start',
    title: 'Start a night',
    description:
      'Choose your drinks and an end time here. Tap to try a practice night, or choose Next.',
    placement: 'right',
    interactive: true,
    onTargetClick: 'log',
  },
  {
    id: 'join',
    route: '/home?tour=join',
    target: 'join',
    title: "Join a friend's night",
    description:
      'Paste the link your friend sends you, then tap Join night. Try the practice invite here.',
    placement: 'left',
    interactive: true,
  },
  {
    id: 'log',
    route: '/night/tour?tour=log',
    target: 'log-drink',
    title: "Add what you're drinking",
    description:
      'Tap Log beer and watch your count change. You can try it here without saving a real drink.',
    placement: 'bottom',
    sample: 'night',
    interactive: true,
  },
  {
    id: 'choices',
    route: '/night/tour?tour=choices',
    target: 'drink-options',
    title: 'Water, another drink, or undo',
    description:
      'Add water, choose a different drink, or undo your last entry. Try any of these buttons.',
    placement: 'top',
    sample: 'night',
    interactive: true,
  },
  {
    id: 'group',
    route: '/night/tour?view=group&tour=group',
    target: 'group-card',
    title: 'Check on your friends',
    description:
      "Group shows each friend's plan and drinks. Friends with accounts add their own drinks.",
    placement: 'bottom',
    sample: 'night',
  },
  {
    id: 'help',
    route: '/night/tour?tour=help',
    target: 'help',
    title: 'Find help quickly',
    description:
      'Open Get help for emergency guidance. Practice calls are turned off during this tour.',
    placement: 'top',
    sample: 'night',
    interactive: true,
  },
  {
    id: 'history',
    route: '/history?tour=history',
    target: 'history-entry',
    title: 'See your previous nights',
    description: 'Finished nights appear here. Open this practice night to see its summary.',
    placement: 'bottom',
    sample: 'history',
    interactive: true,
    follow: {
      route: '/night/tour/summary?tour=history',
      target: 'history-summary',
      description:
        'Your summary shows the drinks and water you logged. Your real nights will appear here after they end.',
    },
  },
];

export function stepAtLocation(path: string, search: string): number {
  const query = new URLSearchParams(search);
  const id = query.get('tour');
  return tourSteps.findIndex(
    (step) =>
      step.id === id &&
      [step.route, step.follow?.route].some((route) => {
        if (!route) return false;
        const expected = new URL(route, 'https://tour.invalid');
        return (
          expected.pathname === path && expected.searchParams.get('view') === query.get('view')
        );
      }),
  );
}

// Only these screens derive tour options entirely from client-side search params.
// History's query changes its server-rendered data source, so it must still navigate.
export function canChangeTourInPlace(pathname: string, route: string): boolean {
  return (
    (pathname === '/home' || pathname === '/night/tour') &&
    new URL(route, 'https://tour.invalid').pathname === pathname
  );
}

export function normalReturnPath(path: string): string {
  try {
    const url = new URL(path, 'https://tour.invalid');
    if (
      url.origin !== 'https://tour.invalid' ||
      !path.startsWith('/') ||
      path.startsWith('//') ||
      path.includes('\\')
    )
      return '/home';
    if (url.pathname.startsWith('/night/tour') || url.searchParams.has('tour')) return '/home';
    if (!/^\/(home|account|history|feedback|night)(\/|$)/.test(url.pathname)) return '/home';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/home';
  }
}
