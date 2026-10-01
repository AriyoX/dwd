'use client';

import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export function BottleMainHint({
  memberId,
  bottleId,
  label,
}: {
  memberId: string;
  bottleId: string;
  label: string;
}) {
  const key = `dwd:bottle-main-hint:${memberId}:${bottleId}`;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let show = true;
    try {
      show = sessionStorage.getItem(key) !== 'seen';
    } catch {
      /* Show the hint once in memory. */
    }
    queueMicrotask(() => setVisible(show));
  }, [key]);
  if (!visible) return null;
  return (
    <aside className="bottle-main-hint" role="status">
      <Sparkles size={20} aria-hidden="true" />
      <div>
        <strong>{label} is your main drink</strong>
        <p>Use Adjust to change the size, number or main drink.</p>
      </div>
      <button
        type="button"
        aria-label="Dismiss main drink tip"
        onClick={() => {
          setVisible(false);
          try {
            sessionStorage.setItem(key, 'seen');
          } catch {
            /* Keep dismissed in memory. */
          }
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
