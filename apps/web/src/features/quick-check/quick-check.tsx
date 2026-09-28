'use client';

import { TimerReset } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Phase = 'idle' | 'waiting' | 'ready' | 'done' | 'early';

export function QuickCheck({ nightId }: { nightId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const [earlier, setEarlier] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const value = Number(localStorage.getItem(`dwd:quick-check:${nightId}`));
      if (Number.isFinite(value) && value > 0) queueMicrotask(() => setEarlier(value));
    } catch {
      // Comparison is optional when browser storage is unavailable.
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [nightId]);

  function start() {
    if (result !== null) setEarlier(result);
    setPhase('waiting');
    setResult(null);
    timer.current = setTimeout(
      () => {
        setStartedAt(performance.now());
        setPhase('ready');
      },
      1200 + Math.random() * 2200,
    );
  }

  function tap() {
    if (phase === 'waiting') {
      if (timer.current) clearTimeout(timer.current);
      setPhase('early');
      return;
    }
    if (phase !== 'ready') return;
    const milliseconds = Math.round(performance.now() - startedAt);
    setResult(milliseconds);
    setPhase('done');
    try {
      localStorage.setItem(`dwd:quick-check:${nightId}`, String(milliseconds));
    } catch {
      // The result remains visible for this attempt.
    }
  }

  return (
    <Card className="stack quick-check">
      <div className="row-between">
        <h2>Quick Check</h2>
        <TimerReset aria-hidden="true" size={22} />
      </div>
      <p className="warning-box small">
        This does not measure sobriety and must not be used to decide whether it is safe to drive.
      </p>
      {phase === 'idle' || phase === 'done' || phase === 'early' ? (
        <Button type="button" variant="secondary" onClick={start}>
          {phase === 'idle' ? 'Start reaction check' : 'Try again'}
        </Button>
      ) : (
        <button
          type="button"
          className={`reaction-pad ${phase === 'ready' ? 'ready' : ''}`}
          onClick={tap}
        >
          {phase === 'ready' ? 'Tap now' : 'Wait…'}
        </button>
      )}
      {phase === 'early' ? <p role="status">Early tap. No time recorded.</p> : null}
      {result !== null ? (
        <p role="status">
          Reaction time: <strong>{result} ms</strong>
          {earlier === null ? '' : ` · Earlier tonight: ${earlier} ms`}
        </p>
      ) : null}
    </Card>
  );
}
