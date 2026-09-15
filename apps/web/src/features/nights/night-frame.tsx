'use client';
import type { ReactNode } from 'react';
import { HeartHandshake, Moon, Settings2, Users } from 'lucide-react';
import { formatNightDateTime, type NightSnapshot } from '@dwd/core';
import { Wordmark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';
export type NightSegment = 'tonight' | 'group' | 'more';
export function NightFrame({
  snapshot,
  segment,
  onSegment,
  onHelp,
  connection,
  remainingText,
  overdue = false,
  sample = false,
  children,
}: {
  snapshot: NightSnapshot;
  segment: NightSegment;
  onSegment: (segment: NightSegment) => void;
  onHelp: () => void;
  connection: 'connected' | 'offline' | 'reconnecting';
  remainingText: string;
  overdue?: boolean;
  sample?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="page-shell active-night-shell" id="main-content">
      <header className="night-header">
        <div className="row-between">
          <Wordmark />
          <span
            className={`pill${connection === 'connected' ? ' pill-online' : connection === 'offline' ? ' pill-warning' : ''}`}
          >
            {sample
              ? 'Tour practice'
              : connection === 'connected'
                ? 'Connected'
                : connection === 'offline'
                  ? 'Offline'
                  : 'Reconnecting'}
          </span>
        </div>
        <div>
          <p className="eyebrow">{overdue ? 'Planned time ended' : remainingText}</p>
          <h1>{snapshot.night.title}</h1>
          <p className="muted small">
            Planned end {formatNightDateTime(snapshot.night.endsAt, snapshot.night.timezone)}
          </p>
        </div>
        <div className="avatar-row" aria-label={`${snapshot.members.length} participants`}>
          {snapshot.members.slice(0, 8).map((member) => (
            <span className="avatar" title={member.displayName} key={member.id}>
              {initials(member.displayName)}
            </span>
          ))}
        </div>
      </header>

      {children}
      <Button type="button" variant="danger" full data-tour="help" onClick={onHelp}>
        <HeartHandshake aria-hidden="true" size={21} /> Get help
      </Button>

      <nav className="segment-nav" aria-label="Night views">
        <button
          className={segment === 'tonight' ? 'active' : ''}
          aria-pressed={segment === 'tonight'}
          type="button"
          onClick={() => onSegment('tonight')}
        >
          <Moon aria-hidden="true" size={19} /> Tonight
        </button>
        <button
          className={segment === 'group' ? 'active' : ''}
          data-tour="group"
          aria-pressed={segment === 'group'}
          type="button"
          onClick={() => onSegment('group')}
        >
          <Users aria-hidden="true" size={19} /> Group
        </button>
        <button
          className={segment === 'more' ? 'active' : ''}
          aria-pressed={segment === 'more'}
          type="button"
          onClick={() => onSegment('more')}
        >
          <Settings2 aria-hidden="true" size={19} /> Manage
        </button>
      </nav>
    </main>
  );
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
