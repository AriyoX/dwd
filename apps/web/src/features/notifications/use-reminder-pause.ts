'use client';

import { useEffect, useState } from 'react';

export function useReminderPause(until: string | null): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return until !== null && Date.parse(until) > now;
}
