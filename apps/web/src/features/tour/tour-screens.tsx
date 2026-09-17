'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CustomDrinkInput } from '@dwd/core';
import { TonightView, ParticipantCard, DrinkChooser } from '@/features/nights/night-content';
import { NightFrame, type NightSegment } from '@/features/nights/night-frame';
import { HistoryScreen } from '@/features/nights/history-screen';
import { SummaryScreen } from '@/features/nights/summary-screen';
import { EmergencyPanel } from '@/features/alerts/emergency-panel';
import { useTour } from './tour-provider';
import { addTourDrink, undoTourDrink } from './sample-state';

const noAction = () => undefined;
function OpeningTour() {
  return (
    <main className="page-shell" id="main-content">
      <p role="status">Opening tour…</p>
    </main>
  );
}

// This controller imports only shared presentation components and pure local operations.
// It never mounts the live outbox, realtime connection, notifications, or server actions.
export function TourNightScreen() {
  const tour = useTour();
  const router = useRouter();
  const query = useSearchParams();
  const segment: NightSegment = query.get('view') === 'group' ? 'group' : 'tonight';
  const [choosing, setChoosing] = useState(false);
  const [help, setHelp] = useState(false);
  const snapshot = tour?.active ? tour.sample : null;
  const member = snapshot?.members.find((item) => item.id === snapshot.currentMemberId);
  if (!snapshot || !member) return <OpeningTour />;
  const add = (kind: 'water' | 'alcohol', drink?: CustomDrinkInput) => {
    tour?.setSample((previous) => (previous ? addTourDrink(previous, kind, drink) : previous));
    setChoosing(false);
  };
  return (
    <>
      <NightFrame
        snapshot={snapshot}
        segment={segment}
        onSegment={(next) => {
          if (next === 'group') tour?.goTo('group');
          else if (next === 'tonight') tour?.goTo('log');
          else router.replace('/night/tour?tour=log', { scroll: false });
        }}
        onHelp={() => setHelp(true)}
        connection="connected"
        remainingText="2 hours remaining"
        sample
      >
        {segment === 'tonight' ? (
          <TonightView
            member={member}
            alerts={[]}
            busy={false}
            pendingLogs={[]}
            onQuick={() => add('alcohol')}
            onChoose={() => setChoosing(true)}
            onWater={() => add('water')}
            onUndo={() =>
              tour?.setSample((previous) => (previous ? undoTourDrink(previous) : previous))
            }
          />
        ) : (
          <section className="stack">
            <h2>Your people</h2>
            {snapshot.members.map((person, index) => (
              <div key={person.id} data-tour={index === 1 ? 'group-card' : undefined}>
                <ParticipantCard
                  member={person}
                  alerts={[]}
                  managed={false}
                  busy={false}
                  pendingLogs={[]}
                  onQuick={noAction}
                  onChoose={noAction}
                  onWater={noAction}
                  onUndo={noAction}
                  onEditPlan={noAction}
                  onRemove={noAction}
                />
              </div>
            ))}
          </section>
        )}
      </NightFrame>
      <DrinkChooser
        member={choosing ? member : null}
        busy={false}
        onClose={() => setChoosing(false)}
        onPlanned={(_person, id) =>
          add(
            'alcohol',
            member.planItems.find((item) => item.id === id),
          )
        }
      />
      <EmergencyPanel open={help} onClose={() => setHelp(false)} practice />
    </>
  );
}

export function TourHistoryScreen() {
  const tour = useTour();
  if (!tour?.active || !tour.sample) return <OpeningTour />;
  return (
    <HistoryScreen
      sample
      result={{
        nights: [
          {
            id: 'tour',
            title: tour.sample.night.title,
            startsAt: tour.sample.night.startsAt,
            endsAt: tour.sample.night.endsAt,
            endedAt: tour.sample.night.startsAt,
            timezone: tour.sample.night.timezone,
            role: 'host',
            memberId: tour.sample.currentMemberId,
            alcoholCount: 0,
            waterCount: 0,
            categoryCounts: {},
          },
        ],
        hasMore: false,
      }}
    />
  );
}

export function TourSummaryScreen() {
  const tour = useTour();
  if (!tour?.active || !tour.sample) return <OpeningTour />;
  return (
    <SummaryScreen
      sample
      snapshot={{
        ...tour.sample,
        night: { ...tour.sample.night, status: 'ended', endedAt: tour.sample.night.endsAt },
      }}
    />
  );
}
