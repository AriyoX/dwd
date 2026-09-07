'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Beer, Droplets, RotateCcw, LogOut, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Wordmark } from '@/components/layout/wordmark';
import { DEMO_STORAGE_KEY, demoLog, readDemo, sampleNight } from './demo-state';

export function DemoNight({ next }: { next: string }) {
  const [night, setNight] = useState(sampleNight);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setNight(readDemo(localStorage));
      } catch {
        /* Use sample. */
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(night));
    } catch {
      queueMicrotask(() =>
        setMessage('Demo changes last until this page closes. Browser storage is unavailable.'),
      );
    }
  }, [night, ready]);
  function log(id: string, kind: 'beer' | 'water') {
    const p = night.participants.find((p) => p.id === id);
    if (kind === 'beer' && p && p.entries.filter((e) => e === 'beer').length >= 2) {
      setConfirm(id);
      return;
    }
    setNight((current) => demoLog(current, id, kind));
    setMessage(`${p?.name ?? 'Participant'}: ${kind} logged in demo.`);
  }
  function reset() {
    setNight(sampleNight());
    setConfirm(null);
    setMessage('Demo reset. The sample night is ready.');
  }
  return (
    <main id="main-content" className="page-shell wide-shell demo-shell">
      <header className="topbar">
        <Wordmark />
        <Link className="button button-secondary" href={next === '/home' ? '/login' : next}>
          <LogOut size={18} aria-hidden="true" />
          Exit demo
        </Link>
      </header>
      <div className="stack-lg">
        <aside className="demo-banner row-between">
          <div>
            <strong>Demo · fictional people and entries</strong>
            <p className="small">
              Actions stay in this browser. No accounts, invitations, or shared records are created.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setConfirm('reset')}>
            <RotateCcw size={18} aria-hidden="true" />
            Reset demo
          </Button>
        </aside>
        <header className="row-between">
          <div>
            <p className="eyebrow">
              {night.ended ? 'Sample summary' : 'Sample night · Friday, 8–10 pm'}
            </p>
            <h1>The Amber Room.</h1>
          </div>
          <span className="pill">{night.participants.length} people</span>
        </header>
        {!night.ended && (
          <p className="muted">
            Try logging a drink or water, undo an entry, then end the sample night to see its
            summary.
          </p>
        )}
        {message && (
          <div className="notice-box" role="status">
            {message}
          </div>
        )}
        <section
          className="demo-grid"
          aria-label={night.ended ? 'Sample night summary' : 'Sample participants'}
        >
          {night.participants.map((p, index) => (
            <Card key={p.id} className="stack">
              <div className="row-between">
                <div className="row">
                  <span className="avatar">{p.name[0]}</span>
                  <div>
                    <h2>{p.name}</h2>
                    <p className="muted small">
                      {index === 0
                        ? 'Host · your entries'
                        : p.managed
                          ? 'Tracked by you'
                          : 'Own account · own phone'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="summary-grid">
                <div>
                  <strong className="big-count">
                    {p.entries.filter((e) => e === 'beer').length}
                  </strong>
                  <span className="muted small">Beers logged</span>
                </div>
                <div>
                  <strong className="big-count">
                    {p.entries.filter((e) => e === 'water').length}
                  </strong>
                  <span className="muted small">Water entries</span>
                </div>
              </div>
              <p className="pill">
                {p.waterOnly ? 'Water only' : 'Plan: 2 beers · 330 ml · 5% ABV'}
              </p>
              {!night.ended && p.managed && (
                <>
                  <div className="row">
                    <Button
                      type="button"
                      full
                      disabled={!ready || p.waterOnly}
                      onClick={() => log(p.id, 'beer')}
                    >
                      <Beer size={18} aria-hidden="true" />
                      Log beer
                    </Button>
                    <Button
                      type="button"
                      full
                      variant="secondary"
                      disabled={!ready}
                      onClick={() => log(p.id, 'water')}
                    >
                      <Droplets size={18} aria-hidden="true" />
                      Water
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!p.entries.length}
                    onClick={() =>
                      setNight((current) => ({
                        ...current,
                        participants: current.participants.map((person) =>
                          person.id === p.id
                            ? { ...person, entries: person.entries.slice(0, -1) }
                            : person,
                        ),
                      }))
                    }
                  >
                    Undo last entry
                  </Button>
                </>
              )}
              {!night.ended && !p.managed && (
                <p className="muted small">
                  Mika manages their own entries. Hosts cannot change another account participant’s
                  logs.
                </p>
              )}
            </Card>
          ))}
        </section>
        {!night.ended && (
          <Card className="stack">
            <h2>Bring someone along</h2>
            <div className="demo-grid">
              <div className="stack">
                <h3>Invite someone</h3>
                <p className="muted small">
                  They join on their own phone, with their own account, and manage their own plan
                  and entries.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setMessage(
                      'In a real night, Invite someone creates a private link that expires in 24 hours. No real link is created in this demo.',
                    )
                  }
                >
                  <Users size={18} aria-hidden="true" />
                  Try inviting
                </Button>
              </div>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!guestName.trim() || night.participants.length >= 20) return;
                  setNight((current) => ({
                    ...current,
                    participants: [
                      ...current.participants,
                      {
                        id: `demo-${crypto.randomUUID()}`,
                        name: guestName.trim(),
                        managed: true,
                        waterOnly: true,
                        entries: [],
                      },
                    ],
                  }));
                  setGuestName('');
                }}
              >
                <h3>Track for someone</h3>
                <p className="muted small">
                  You manage their entries on your phone. They do not need an account. Ask them
                  before adding them.
                </p>
                <label className="field">
                  Fictional guest name
                  <input
                    className="input"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={60}
                    required
                  />
                </label>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={night.participants.length >= 20}
                >
                  Add water-only guest
                </Button>
              </form>
            </div>
          </Card>
        )}
        {!night.ended ? (
          <Button type="button" variant="secondary" onClick={() => setConfirm('end')}>
            End sample night & view summary
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={reset}>
            Try another sample night
          </Button>
        )}
        <p className="muted small">
          A plan is a personal intention, not a safe allowance. DWD cannot determine sobriety or
          driving safety.
        </p>
        <Link className="button button-primary" href={`/signup?next=${encodeURIComponent(next)}`}>
          Create your own account
        </Link>
      </div>
      <Dialog
        open={confirm !== null}
        title={
          confirm === 'reset'
            ? 'Reset demo data?'
            : confirm === 'end'
              ? 'End the sample night?'
              : 'Beyond the sample plan'
        }
        description={
          confirm === 'reset'
            ? 'This removes your demo changes and restores the fictional sample. Your real nights and queued entries are unaffected.'
            : confirm === 'end'
              ? 'This opens the sample summary. You can reset the demo at any time.'
              : 'This beer is beyond the plan set earlier. Log it anyway?'
        }
        onClose={() => setConfirm(null)}
      >
        <Button
          type="button"
          onClick={() => {
            if (confirm === 'reset') reset();
            else if (confirm === 'end') {
              setNight((current) => ({ ...current, ended: true }));
              setConfirm(null);
            } else if (confirm) {
              setNight((current) => demoLog(current, confirm, 'beer'));
              setConfirm(null);
            }
          }}
        >
          {confirm === 'reset'
            ? 'Reset demo'
            : confirm === 'end'
              ? 'View sample summary'
              : 'Log anyway'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
          Cancel
        </Button>
      </Dialog>
    </main>
  );
}
