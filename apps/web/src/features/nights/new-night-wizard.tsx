'use client';

import { ArrowLeft, ArrowRight, Check, Clock3, User, UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  resolveWallTimeInTimeZone,
  startNightSchema,
  type PlanSetupMode,
  type StartNightInput,
} from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlanEditor, materializePlanDraft, type PlanDraftItem } from '@/features/plans/plan-editor';
import { startNightAction } from './actions';
import { newInviteRequestToken } from '@/features/invites/invite-request';
import { nightDraftKey, readNightDraft } from './night-draft';

type GuestDraft = {
  clientId: string;
  displayName: string;
  planItems: PlanDraftItem[];
  planMode: PlanSetupMode;
};

function defaultEndParts(timeZone: string): { date: string; time: string } {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<
    string,
    string
  >;
  return {
    date: `${values['year'] ?? '1970'}-${values['month'] ?? '01'}-${values['day'] ?? '01'}`,
    time: `${values['hour'] ?? '00'}:${values['minute'] ?? '00'}`,
  };
}

function detectedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function NewNightWizard({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('Tonight');
  const [initialTimeZone] = useState(() => detectedTimeZone());
  const [initialEnd] = useState(() => defaultEndParts(initialTimeZone));
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [draftReady, setDraftReady] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [withPeople, setWithPeople] = useState(true);
  const [hostPlan, setHostPlan] = useState<PlanDraftItem[]>([]);
  const [hostPlanMode, setHostPlanMode] = useState<PlanSetupMode>('unselected');
  const [guests, setGuests] = useState<GuestDraft[]>([]);
  const [inviteToken, setInviteToken] = useState(newInviteRequestToken);
  const [creationKey, setCreationKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const draft = readNightDraft(localStorage, userId);
        if (draft) {
          setStep(draft.step);
          setTitle(draft.title);
          setEndTime(draft.endTime);
          setEndDate(draft.endDate);
          setTimeZone(draft.timezone ?? initialTimeZone);
          setWithPeople(draft.withPeople);
          setHostPlan(draft.hostPlan);
          setHostPlanMode(
            draft.hostPlanMode ?? (draft.hostPlan.length > 0 ? 'drinks' : 'unselected'),
          );
          setGuests(
            draft.guests.map((guest) => ({
              ...guest,
              planMode: guest.planMode ?? (guest.planItems.length > 0 ? 'drinks' : 'unselected'),
            })),
          );
          setCreationKey(draft.creationKey);
          setInviteToken(draft.inviteToken);
          setHasDraft(true);
          setDraftNotice('Your unfinished setup was restored on this device.');
        }
      } catch {
        setDraftNotice('Browser storage is unavailable. Keep this page open to retain setup.');
      }
      setDraftReady(true);
    });
  }, [initialTimeZone, userId]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      if (!hasDraft) localStorage.removeItem(nightDraftKey(userId));
      else
        localStorage.setItem(
          nightDraftKey(userId),
          JSON.stringify({
            version: 1,
            userId,
            creationKey,
            inviteToken,
            step,
            title,
            endTime,
            endDate,
            timezone: timeZone,
            withPeople,
            hostPlan,
            hostPlanMode,
            guests,
          }),
        );
    } catch {
      queueMicrotask(() =>
        setDraftNotice('Could not save setup on this device. Keep this page open.'),
      );
    }
  }, [
    draftReady,
    hasDraft,
    userId,
    creationKey,
    inviteToken,
    step,
    title,
    endTime,
    endDate,
    timeZone,
    withPeople,
    hostPlan,
    hostPlanMode,
    guests,
  ]);

  function discard() {
    const nextTimeZone = detectedTimeZone();
    const nextEnd = defaultEndParts(nextTimeZone);
    setHasDraft(false);
    setStep(1);
    setTitle('Tonight');
    setTimeZone(nextTimeZone);
    setEndTime(nextEnd.time);
    setEndDate(nextEnd.date);
    setWithPeople(true);
    setHostPlan([]);
    setHostPlanMode('unselected');
    setGuests([]);
    setCreationKey(crypto.randomUUID());
    setInviteToken(newInviteRequestToken());
    setError(null);
    setDraftNotice('Unfinished setup discarded.');
  }

  function resolveEndsAt(): string {
    try {
      return resolveWallTimeInTimeZone(endDate, endTime, timeZone);
    } catch {
      return '';
    }
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (step < 3) {
      if (step === 2) {
        const parsed = materializePlanDraft(hostPlanMode, hostPlan);
        if (!parsed.success) {
          setError(parsed.message);
          return;
        }
      }
      setStep((current) => current + 1);
      return;
    }
    const hostParsed = materializePlanDraft(hostPlanMode, hostPlan);
    if (!hostParsed.success) {
      setError(hostParsed.message);
      return;
    }
    const guestInputs: StartNightInput['guests'] = [];
    if (withPeople) {
      for (const guest of guests) {
        const parsedGuest = materializePlanDraft(guest.planMode, guest.planItems);
        if (!parsedGuest.success) {
          setError(`${guest.displayName || 'Guest'}: ${parsedGuest.message}`);
          return;
        }
        guestInputs.push({ displayName: guest.displayName, planItems: parsedGuest.data });
      }
    }
    const input: StartNightInput = {
      creationKey,
      title: title.trim() || 'Tonight',
      endsAt: resolveEndsAt(),
      timezone: timeZone,
      withPeople,
      hostPlanItems: hostParsed.data,
      guests: guestInputs,
    };
    const parsed = startNightSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the night details.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const result = await startNightAction(parsed.data, inviteToken);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        if (result.data.inviteUrl !== null)
          sessionStorage.setItem(`dwd-invite:${result.data.nightId}`, result.data.inviteUrl);
        if (result.data.inviteError !== null)
          sessionStorage.setItem(
            `dwd-invite-error:${result.data.nightId}`,
            result.data.inviteError,
          );
      } catch {
        /* Invitations remain available from the night if browser storage is disabled. */
      }
      try {
        localStorage.removeItem(nightDraftKey(userId));
      } catch {
        /* Creation key still prevents duplicates. */
      }
      setHasDraft(false);
      router.push(`/night/${result.data.nightId}${withPeople ? '?invite=1' : ''}`);
    } catch {
      setError('Couldn’t start the night. Check your connection and try again.');
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <form
      className="stack-lg"
      onChangeCapture={() => setHasDraft(true)}
      onClickCapture={() => setHasDraft(true)}
      onSubmit={(event) => void submit(event)}
      aria-busy={pending}
    >
      <div className="row-between">
        <p className="muted small">
          {draftNotice ?? 'Unfinished setup is saved on this device for your account.'}
        </p>
        <Button type="button" variant="ghost" disabled={pending || !draftReady} onClick={discard}>
          Discard setup
        </Button>
      </div>
      <fieldset disabled={pending || !draftReady} className="wizard-fields stack-lg">
        <ol className="wizard-progress" aria-label="Night setup">
          {['Details', 'Your plan', 'Review'].map((label, index) => (
            <li
              key={label}
              className={index + 1 <= step ? 'active' : ''}
              aria-current={index + 1 === step ? 'step' : undefined}
            >
              <span className="step-number">
                {index + 1 < step ? <Check size={14} aria-hidden="true" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {step === 1 ? (
          <Card className="stack-lg wizard-card">
            <h1 ref={heading} tabIndex={-1}>
              Make it your night.
            </h1>
            <div className="field">
              <label htmlFor="night-timezone">Night time zone</label>
              <input
                className="input"
                id="night-timezone"
                value={timeZone}
                onChange={(event) => setTimeZone(event.target.value)}
                aria-describedby="night-timezone-hint"
              />
              <span id="night-timezone-hint" className="muted small">
                Shared times use this IANA zone, even if someone is travelling.
              </span>
            </div>
            <div className="field">
              <label htmlFor="night-title">Night name</label>
              <input
                className="input"
                id="night-title"
                placeholder="Friday with friends"
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="end-date">Planned end date</label>
              <input
                className="input"
                id="end-date"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="end-time">Planned end time</label>
              <input
                className="input"
                id="end-time"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
                aria-describedby="end-time-hint"
              />
              <span id="end-time-hint" className="muted small">
                Use tomorrow&apos;s date if you are staying out past midnight. You can extend this
                later.
              </span>
            </div>
            <fieldset className="choice-grid">
              <legend className="field-label">Who’s joining?</legend>
              <button
                type="button"
                className={!withPeople ? 'choice active' : 'choice'}
                aria-pressed={!withPeople}
                onClick={() => setWithPeople(false)}
              >
                <User size={22} aria-hidden="true" /> Just me
              </button>
              <button
                type="button"
                className={withPeople ? 'choice active' : 'choice'}
                aria-pressed={withPeople}
                onClick={() => setWithPeople(true)}
              >
                <Users size={22} aria-hidden="true" /> With friends
              </button>
            </fieldset>
          </Card>
        ) : null}
        {step === 2 ? (
          <Card className="stack-lg wizard-card">
            <h1 ref={heading} tabIndex={-1}>
              Set your own pace.
            </h1>
            <p className="muted small">
              Choose water only, or set an alcohol plan with a quick-log drink.
            </p>
            <PlanEditor
              items={hostPlan}
              mode={hostPlanMode}
              onModeChange={setHostPlanMode}
              onChange={setHostPlan}
            />
          </Card>
        ) : null}
        {step === 3 ? (
          <div className="stack">
            <Card className="stack-lg wizard-card">
              <h1 ref={heading} tabIndex={-1}>
                Ready for tonight?
              </h1>
              <dl className="review-list">
                <div>
                  <dt>Night</dt>
                  <dd>{title.trim() || 'Tonight'}</dd>
                </div>
                <div>
                  <dt className="row">
                    <Clock3 size={16} aria-hidden="true" /> Planned end
                  </dt>
                  <dd>{endTime}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{withPeople ? 'With friends' : 'Just me'}</dd>
                </div>
                <div>
                  <dt>Your plan</dt>
                  <dd>
                    {hostPlanMode === 'unselected'
                      ? 'Choose a plan'
                      : hostPlanMode === 'water_only'
                        ? 'Water only'
                        : hostPlan
                            .map((item) => `${item.plannedQuantity} × ${item.label}`)
                            .join(', ')}
                  </dd>
                </div>
              </dl>
              {withPeople ? (
                <>
                  <hr className="divider" />
                  <h2>Bring your people</h2>
                  <p className="muted small">
                    Invite someone: they use their own account and phone. Track for someone: you
                    manage their entries on this device. Ask them before tracking for them. You can
                    share an invite after starting.
                  </p>
                  {guests.map((guest, index) => (
                    <div className="plan-item stack" key={guest.clientId}>
                      <div className="row-between">
                        <strong>Guest {index + 1}</strong>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            setGuests((current) =>
                              current.filter((item) => item.clientId !== guest.clientId),
                            )
                          }
                          aria-label={`Remove guest ${index + 1}`}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="field">
                        <label htmlFor={`guest-${guest.clientId}`}>Guest name</label>
                        <input
                          className="input"
                          id={`guest-${guest.clientId}`}
                          maxLength={60}
                          placeholder="Your friend’s name"
                          value={guest.displayName}
                          required
                          onChange={(event) =>
                            setGuests((current) =>
                              current.map((item) =>
                                item.clientId === guest.clientId
                                  ? { ...item, displayName: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <PlanEditor
                        compact
                        items={guest.planItems}
                        mode={guest.planMode}
                        onModeChange={(mode) =>
                          setGuests((current) =>
                            current.map((item) =>
                              item.clientId === guest.clientId ? { ...item, planMode: mode } : item,
                            ),
                          )
                        }
                        onChange={(items) =>
                          setGuests((current) =>
                            current.map((item) =>
                              item.clientId === guest.clientId
                                ? { ...item, planItems: items }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    full
                    disabled={guests.length >= 20}
                    onClick={() =>
                      setGuests((current) => [
                        ...current,
                        {
                          clientId: crypto.randomUUID(),
                          displayName: '',
                          planItems: [],
                          planMode: 'unselected',
                        },
                      ])
                    }
                  >
                    <UserPlus aria-hidden="true" size={20} /> Track for someone
                  </Button>
                </>
              ) : null}
            </Card>
          </div>
        ) : null}
        {error === null ? null : (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="row wizard-actions">
          {step > 1 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep((current) => current - 1);
              }}
            >
              <ArrowLeft aria-hidden="true" size={18} /> Back
            </Button>
          ) : null}
          <Button type="submit" full disabled={pending}>
            {step < 3 ? (
              <>
                Continue <ArrowRight aria-hidden="true" size={18} />
              </>
            ) : pending ? (
              'Starting…'
            ) : (
              'Start night'
            )}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
