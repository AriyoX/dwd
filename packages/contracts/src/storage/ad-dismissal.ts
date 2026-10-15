export const AD_DISMISSAL_MS = 7 * 60 * 1000;

// Memory only: navigation keeps the pause, while a page/app reload resets it.
export function createAdDismissal() {
  let hiddenUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    isHidden: () => Date.now() < hiddenUntil,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dismiss: () => {
      hiddenUntil = Date.now() + AD_DISMISSAL_MS;
      clearTimeout(timer);
      timer = setTimeout(() => {
        hiddenUntil = 0;
        notify();
      }, AD_DISMISSAL_MS);
      notify();
    },
  };
}
