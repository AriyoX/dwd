'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DEMO_STORAGE_KEY } from './demo-state';
export function ResetDemoButton() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="stack">
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          try {
            localStorage.removeItem(DEMO_STORAGE_KEY);
            setMessage(
              'Demo data removed from this browser. The next demo starts with the sample night.',
            );
          } catch {
            setMessage(
              'Browser storage is unavailable. Close the demo tab to clear its temporary changes.',
            );
          }
        }}
      >
        Reset demo data
      </Button>
      {message && (
        <p className="notice-box" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
