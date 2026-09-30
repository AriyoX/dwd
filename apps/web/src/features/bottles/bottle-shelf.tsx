'use client';

import { ChevronLeft, MoreHorizontal, Plus, Users, Wine } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import {
  bottleDrinkWord,
  bottlePlanProgress,
  type CustomDrinkInput,
  type MemberSnapshot,
  type NightSnapshot,
  type SharedBottle,
} from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { sharedBottleAction } from './actions';
import { BottleFields, DrinkQuantity } from './bottle-fields';
import { materializeBottle, newBottleDraft } from './bottle-draft';

export function BottleLauncher({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" className="bottle-launcher" onClick={onClick}>
      <span className="bottle-launcher-icon">
        <Wine size={24} aria-hidden="true" />
      </span>
      <span>
        <strong>{count ? 'Shared bottles' : 'Share a bottle'}</strong>
        {count > 0 && <span className="small">{count} on the table</span>}
      </span>
      <Plus size={21} aria-hidden="true" />
    </button>
  );
}

type TrackingReady = (snapshot: NightSnapshot, bottleId: string, makeMain: boolean) => void;

export function BottleShelf({
  snapshot,
  member,
  online,
  busy: logging,
  onClose,
  onChange,
  onTracking,
  onLog,
  onUndo,
  onFullPlan,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  online: boolean;
  busy: boolean;
  onClose: () => void;
  onChange: (snapshot: NightSnapshot) => void;
  onTracking: TrackingReady;
  onLog: (drink: CustomDrinkInput) => void;
  onUndo: (bottleId: string) => void;
  onFullPlan: () => void;
}) {
  const bottles = availableBottles(snapshot, member.id);
  const [page, setPage] = useState<'shelf' | 'create' | 'plan' | 'close'>(() =>
    bottles.some((bottle) => !bottle.closedAt) ? 'shelf' : 'create',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const selected = bottles.find((bottle) => bottle.id === selectedId);
  const active = bottles.filter((bottle) => !bottle.closedAt);
  const disabled = busy || logging || !online;

  async function mutate(command: Parameters<typeof sharedBottleAction>[0]) {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await sharedBottleAction(command);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChange(result.data);
      setPage('shelf');
    } catch {
      setError('Could not save that change. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={
        page === 'create'
          ? 'Share a bottle'
          : page === 'plan'
            ? selected?.joinedMemberIds.includes(member.id)
              ? 'Adjust your drinks'
              : 'Join this bottle'
            : page === 'close'
              ? 'Put this bottle away?'
              : 'Shared bottles'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {page !== 'shelf' && (
        <button
          type="button"
          className="icon-text-button"
          disabled={busy}
          onClick={() => {
            setPage('shelf');
            setError(null);
          }}
        >
          <ChevronLeft size={18} aria-hidden="true" /> All bottles
        </button>
      )}
      {!online && (
        <p className="warning-box" role="status">
          Go online to share, join or log from a bottle.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {page === 'shelf' && (
        <div className="stack">
          <div className="row-between">
            <span className="small muted">For {member.displayName}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => setPage('create')}
            >
              <Plus size={18} aria-hidden="true" /> Add bottle
            </Button>
          </div>
          {!active.length && (
            <div className="bottle-empty">
              <Wine size={38} aria-hidden="true" />
              <h3>No bottles on the table</h3>
            </div>
          )}
          {active.map((bottle) => {
            const planned = member.planItems.find((item) => item.sharedBottleId === bottle.id);
            const joined = bottle.joinedMemberIds.includes(member.id) && planned;
            const word = bottleDrinkWord(bottle.category);
            const size = planned?.volumeMl ?? bottle.pourMl;
            const progress = bottlePlanProgress(bottle.id, member.drinkLogs, size);
            const people = snapshot.members.filter(
              (person) => !person.leftAt && bottle.joinedMemberIds.includes(person.id),
            );
            return (
              <article className="bottle-card stack" key={bottle.id}>
                <div className="bottle-card-heading">
                  <BottleVisual bottle={bottle} />
                  <div>
                    <span className="bottle-access">
                      <Users size={13} aria-hidden="true" />
                      {bottle.access === 'everyone' ? 'Everyone can join' : 'Selected people'}
                    </span>
                    <h3>{bottle.label}</h3>
                    <p className="small muted">
                      {size} ml per {word} · {bottle.abvPercent}%
                    </p>
                    {planned?.isQuickLog && (
                      <span className="bottle-main-badge">Your main drink</span>
                    )}
                  </div>
                </div>
                {planned && <BottleProgress bottle={bottle} member={member} />}
                <div className="bottle-remaining">
                  <strong>{bottle.remainingMl} ml left</strong>
                  <span className="small muted">{people.length} sharing</span>
                </div>
                <div
                  className="bottle-level"
                  role="meter"
                  aria-label={`${bottle.label} remaining`}
                  aria-valuemin={0}
                  aria-valuemax={bottle.volumeMl}
                  aria-valuenow={bottle.remainingMl}
                >
                  <span
                    style={{
                      width: `${Math.max(0, (bottle.remainingMl / bottle.volumeMl) * 100)}%`,
                    }}
                  />
                </div>
                <div className="bottle-actions">
                  <Button
                    type="button"
                    disabled={
                      disabled ||
                      bottle.remainingMl < 1 ||
                      Boolean(joined && bottle.remainingMl < size)
                    }
                    onClick={() => {
                      if (!joined) {
                        setSelectedId(bottle.id);
                        setPage('plan');
                        return;
                      }
                      onLog({
                        sharedBottleId: bottle.id,
                        label: bottle.label,
                        category: bottle.category,
                        volumeMl: size,
                        abvPercent: bottle.abvPercent,
                      });
                    }}
                  >
                    {bottle.remainingMl < 1
                      ? 'Bottle empty'
                      : joined
                        ? `Log ${word}`
                        : 'Join bottle'}
                  </Button>
                  {joined && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => {
                        setSelectedId(bottle.id);
                        setPage('plan');
                      }}
                    >
                      Adjust
                    </Button>
                  )}
                </div>
                {joined && bottle.remainingMl > 0 && bottle.remainingMl < size && (
                  <p className="small muted">
                    Less than one {word} left. Adjust the size to log it.
                  </p>
                )}
                {progress > 0 && (
                  <button
                    type="button"
                    className="icon-text-button small"
                    disabled={disabled}
                    onClick={() => onUndo(bottle.id)}
                  >
                    Undo last drink
                  </button>
                )}
                <details className="bottle-options">
                  <summary>
                    <MoreHorizontal size={19} aria-hidden="true" /> People &amp; options
                  </summary>
                  <div className="stack">
                    <p className="small">
                      {people
                        .map((person) => (person.id === member.id ? 'You' : person.displayName))
                        .join(', ') || 'No one has joined yet'}
                    </p>
                    <p className="small muted">
                      Shared by{' '}
                      {snapshot.members.find((person) => person.id === bottle.creatorMemberId)
                        ?.displayName ?? 'a former member'}
                    </p>
                    {bottle.joinedMemberIds.includes(member.id) && (
                      <button
                        type="button"
                        className="icon-text-button small"
                        disabled={disabled}
                        onClick={() =>
                          void mutate({
                            kind: 'membership',
                            bottleId: bottle.id,
                            memberId: member.id,
                            join: false,
                          })
                        }
                      >
                        Leave bottle
                      </button>
                    )}
                    {bottle.creatorMemberId === snapshot.currentMemberId && (
                      <button
                        type="button"
                        className="icon-text-button small"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedId(bottle.id);
                          setPage('close');
                        }}
                      >
                        Put bottle away
                      </button>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
          {bottles.some((bottle) => bottle.closedAt) && (
            <details>
              <summary>Put away</summary>
              {bottles
                .filter((bottle) => bottle.closedAt)
                .map((bottle) => (
                  <p className="small muted" key={bottle.id}>
                    {bottle.label} · {bottle.remainingMl} ml left
                  </p>
                ))}
            </details>
          )}
        </div>
      )}
      {page === 'create' && (
        <CreateBottle
          snapshot={snapshot}
          member={member}
          online={online}
          onBusy={setBusy}
          onTracking={onTracking}
        />
      )}
      {page === 'plan' && selected && (
        <BottlePlanForm
          bottle={selected}
          member={member}
          online={online}
          onBusy={setBusy}
          onTracking={onTracking}
          onFullPlan={onFullPlan}
        />
      )}
      {page === 'close' && selected && (
        <div className="stack">
          <p>No more drinks can be logged from {selected.label}. Past drinks stay saved.</p>
          <Button
            type="button"
            full
            disabled={disabled}
            onClick={() => void mutate({ kind: 'close', bottleId: selected.id })}
          >
            Put bottle away
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function CreateBottle({
  snapshot,
  member,
  online,
  onBusy,
  onTracking,
}: {
  snapshot: NightSnapshot;
  member: MemberSnapshot;
  online: boolean;
  onBusy: (busy: boolean) => void;
  onTracking: TrackingReady;
}) {
  const [draft, setDraft] = useState(newBottleDraft);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [revision] = useState(member.planRevision);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || !online) return;
        const parsed = materializeBottle(draft);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Check the bottle details.');
          return;
        }
        inFlight.current = true;
        setBusy(true);
        onBusy(true);
        setError(null);
        try {
          const bottle = {
            ...parsed.data,
            allowedMemberIds:
              parsed.data.access === 'selected'
                ? [...new Set([...parsed.data.allowedMemberIds, member.id])]
                : [],
          };
          const result = await sharedBottleAction({
            kind: 'create',
            nightId: snapshot.night.id,
            bottle,
            memberId: member.id,
            expectedRevision: revision,
            requestKey,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onTracking(result.data, bottle.id, true);
        } catch {
          setError('Could not confirm that save. Try again to safely recover it.');
        } finally {
          inFlight.current = false;
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <fieldset className="wizard-fields stack" disabled={busy || !online}>
        <BottleFields
          draft={draft}
          onChange={setDraft}
          members={snapshot.members}
          creatorMemberId={snapshot.currentMemberId}
          targetMemberId={member.id}
        />
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" full>
          {busy ? 'Saving…' : 'Share & start tracking'}
        </Button>
      </fieldset>
    </form>
  );
}

export function BottlePlanForm({
  bottle,
  member,
  online,
  onTracking,
  onBusy,
  onFullPlan,
}: {
  bottle: SharedBottle;
  member: MemberSnapshot;
  online: boolean;
  onTracking: TrackingReady;
  onBusy: (busy: boolean) => void;
  onFullPlan: () => void;
}) {
  const existing = member.planItems.find((item) => item.sharedBottleId === bottle.id);
  const [quantity, setQuantity] = useState(
    String(existing?.plannedQuantity ?? bottle.defaultQuantity ?? 1),
  );
  const [size, setSize] = useState(String(existing?.volumeMl ?? bottle.pourMl));
  const [makeMain, setMakeMain] = useState(existing?.isQuickLog ?? true);
  const [revision] = useState(member.planRevision);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const word = bottleDrinkWord(bottle.category);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || !online) return;
        inFlight.current = true;
        setBusy(true);
        onBusy(true);
        setError(null);
        try {
          const result = await sharedBottleAction({
            kind: 'plan',
            bottleId: bottle.id,
            memberId: member.id,
            quantity: Number(quantity),
            servingMl: Number(size),
            expectedRevision: revision,
            requestKey,
            makeMain,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onTracking(result.data, bottle.id, makeMain);
        } catch {
          setError('Could not confirm that save. Try again to safely recover it.');
        } finally {
          inFlight.current = false;
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <fieldset className="wizard-fields stack" disabled={busy || !online}>
        <div className="bottle-summary">
          <BottleVisual bottle={bottle} />
          <div>
            <h3>{bottle.label}</h3>
            <p className="small muted">
              {size} ml per {word} · {bottle.abvPercent}%
            </p>
            <p className="small">For {member.displayName}</p>
          </div>
        </div>
        <DrinkQuantity value={quantity} onChange={setQuantity} word={word} />
        {!existing && (
          <p className="small muted">
            This becomes your main drink. Your other planned drinks stay.
          </p>
        )}
        <details className="bottle-details">
          <summary>
            Change {word} size{existing ? ' or main drink' : ''}
          </summary>
          <div className="stack">
            <div className="field">
              <label htmlFor="bottle-serving-size">
                {word === 'shot' ? 'Shot' : 'Drink'} size (ml)
              </label>
              <input
                className="input"
                id="bottle-serving-size"
                type="number"
                min={1}
                max={Math.min(2000, bottle.volumeMl)}
                step="any"
                required
                value={size}
                onChange={(event) => setSize(event.target.value)}
              />
            </div>
            {existing && !existing.isQuickLog && (
              <label className="radio-label">
                <input
                  type="checkbox"
                  checked={makeMain}
                  onChange={(event) => setMakeMain(event.target.checked)}
                />{' '}
                Use as my main drink
              </label>
            )}
            <button type="button" className="icon-text-button" onClick={onFullPlan}>
              Adjust my full plan
            </button>
          </div>
        </details>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" full>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Join & start tracking'}
        </Button>
      </fieldset>
    </form>
  );
}

export function BottleJoinPrompt({
  bottle,
  member,
  online,
  onTracking,
  onSkip,
  onFullPlan,
}: {
  bottle: SharedBottle;
  member: MemberSnapshot;
  online: boolean;
  onTracking: TrackingReady;
  onSkip: () => void;
  onFullPlan: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      title="Sharing this bottle?"
      onClose={() => {
        if (!busy) onSkip();
      }}
    >
      <BottlePlanForm
        bottle={bottle}
        member={member}
        online={online}
        onTracking={onTracking}
        onBusy={setBusy}
        onFullPlan={onFullPlan}
      />
      <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>
        Not for me
      </Button>
    </Dialog>
  );
}

export function availableBottles(snapshot: NightSnapshot, memberId: string): SharedBottle[] {
  return (snapshot.sharedBottles ?? []).filter(
    (bottle) =>
      bottle.access === 'everyone' ||
      bottle.allowedMemberIds.includes(memberId) ||
      bottle.creatorMemberId === memberId,
  );
}

export function BottleProgress({
  bottle,
  member,
}: {
  bottle: SharedBottle;
  member: MemberSnapshot;
}) {
  const plan = member.planItems.find((item) => item.sharedBottleId === bottle.id);
  if (!plan) return null;
  const progress = bottlePlanProgress(bottle.id, member.drinkLogs, plan.volumeMl);
  return (
    <div className="bottle-personal-progress">
      <span>
        <strong>
          {progress} of {plan.plannedQuantity}
        </strong>{' '}
        {bottleDrinkWord(bottle.category)}s logged
      </span>
      <div
        className="bottle-progress-track"
        role="progressbar"
        aria-label={`Your ${bottle.label} plan`}
        aria-valuemin={0}
        aria-valuemax={plan.plannedQuantity}
        aria-valuenow={Math.min(progress, plan.plannedQuantity)}
        aria-valuetext={`${progress} of ${plan.plannedQuantity} ${bottleDrinkWord(bottle.category)}s logged`}
      >
        <span style={{ width: `${Math.min(100, (progress / plan.plannedQuantity) * 100)}%` }} />
      </div>
    </div>
  );
}

function BottleVisual({ bottle }: { bottle: Pick<SharedBottle, 'remainingMl' | 'volumeMl'> }) {
  return (
    <div
      className="bottle-art"
      aria-hidden="true"
      style={
        {
          '--bottle-fill': `${Math.max(0, Math.min(100, (bottle.remainingMl / bottle.volumeMl) * 100))}%`,
        } as CSSProperties
      }
    >
      <div className="bottle-art-cap" />
      <div className="bottle-art-neck" />
      <div className="bottle-art-body">
        <div className="bottle-art-liquid" />
        <span>
          <Wine size={19} strokeWidth={1.5} />
        </span>
      </div>
    </div>
  );
}
