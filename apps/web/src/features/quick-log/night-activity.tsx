'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  hasUnknownAmounts,
  hasQuickLogs,
  quickCountLabel,
  quickKindLabel,
  quickCorrectionKind,
  RECENT_CORRECTION_MINUTES,
  type MemberSnapshot,
} from '@dwd/core';
import { correctNightQuickLog } from '@dwd/data';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
export function QuickNightActivity({
  member,
  accountId,
  refresh,
}: {
  member: MemberSnapshot;
  accountId?: string;
  refresh?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [issue, setIssue] = useState<string | null>(null);
  const router = useRouter();
  if (!hasQuickLogs(member.quickLogs)) return null;
  async function correct(id: string, kind: 'drink' | 'chaser' | 'shot' | 'remove') {
    if (busy) return;
    setBusy(true);
    setIssue(null);
    try {
      await correctNightQuickLog(createBrowserSupabaseClient(), id, kind);
      if (refresh) await refresh();
      else router.refresh();
    } catch {
      setIssue('Couldn’t correct this entry. Check your connection and the correction window.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="quick-history-card stack">
      <strong>Quick Log · {quickCountLabel(member.quickLogs ?? [])}</strong>
      {hasUnknownAmounts(member.quickLogs) ? (
        <p className="muted small">
          Earlier drinks have no size saved, so the alcohol total is partial.
        </p>
      ) : null}
      <details>
        <summary>Earlier entries</summary>
        {member.quickLogs
          ?.filter((e) => !e.deletedAt)
          .map((e) => (
            <div className="quick-history-card stack" key={e.id}>
              <p>
                Quick log · {quickKindLabel(e.kind)} · {new Date(e.recordedAt).toLocaleString()}
              </p>
              {e.earlierLogging ? (
                <p className="muted small">Earlier logging · before this night started</p>
              ) : null}
              {accountId &&
              e.actorUserId === accountId &&
              now - Date.parse(e.createdAt) <= RECENT_CORRECTION_MINUTES * 60_000 ? (
                <div className="row">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void correct(e.id, quickCorrectionKind(e.kind))}
                  >
                    Change to {quickKindLabel(quickCorrectionKind(e.kind))}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void correct(e.id, 'remove')}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
      </details>
      {issue ? <p role="alert">{issue}</p> : null}
    </section>
  );
}
