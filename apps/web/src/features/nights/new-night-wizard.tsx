'use client';

import { ArrowLeft, ArrowRight, Check, Clock3, User, UserPlus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import {
  planItemsSchema,
  startNightSchema,
  type PlanItemInput,
  type StartNightInput,
} from '@dwd/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PlanEditor, newPlanItem } from '@/features/plans/plan-editor';
import { startNightAction } from './actions';

type GuestDraft = { clientId: string; displayName: string; planItems: PlanItemInput[] };

function defaultEndTime(): string {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function NewNightWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('Tonight');
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [withPeople, setWithPeople] = useState(true);
  const [hostPlan, setHostPlan] = useState<PlanItemInput[]>(() => [newPlanItem()]);
  const [guests, setGuests] = useState<GuestDraft[]>([]);
  const [creationKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  function resolveEndsAt(): string {
    const [hourText, minuteText] = endTime.split(':');
    const end = new Date();
    end.setHours(Number(hourText), Number(minuteText), 0, 0);
    if (end.getTime() <= Date.now()) end.setDate(end.getDate() + 1);
    return end.toISOString();
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError(null);
    if (step < 3) {
      if (step === 2) {
        const parsed = planItemsSchema.safeParse(hostPlan);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Check your drink details.');
          return;
        }
      }
      setStep((current) => current + 1);
      return;
    }
    const input: StartNightInput = {
      creationKey,
      title: title.trim() || 'Tonight',
      endsAt: resolveEndsAt(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      withPeople,
      hostPlanItems: hostPlan,
      guests: withPeople
        ? guests.map(({ displayName, planItems }) => ({ displayName, planItems }))
        : [],
    };
    const parsed = startNightSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the night details.');
      return;
    }
    inFlight.current = true;
    setPending(true);
    try {
      const result = await startNightAction(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        if (result.data.inviteUrl !== null)
          sessionStorage.setItem(
            `dwd-invite:${result.data.nightId}`,
            result.data.inviteUrl,
          );
        if (result.data.inviteError !== null)
          sessionStorage.setItem(
            `dwd-invite-error:${result.data.nightId}`,
            result.data.inviteError,
          );
      } catch {
        /* Invitations remain available from the night if browser storage is disabled. */
      }
      router.push(`/night/${result.data.nightId}${withPeople ? '?invite=1' : ''}`);
    } catch {
      setError('Couldn’t start the night. Check your connection and try again.');
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <form className="stack-lg" onSubmit={(event) => void submit(event)} aria-busy={pending}>
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
              Earlier times mean tomorrow. You can extend this later.
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
            Choose your drinks and quantities. Select one for quick logging.
          </p>
          <PlanEditor items={hostPlan} onChange={setHostPlan} />
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
                  {hostPlan.map((item) => `${item.plannedQuantity} × ${item.label}`).join(', ')}
                </dd>
              </div>
            </dl>
            {withPeople ? (
              <>
                <hr className="divider" />
                <h2>Bring your people</h2>
                <p className="muted small">
                  Share an invite after starting, or add guests whose entries you’ll manage.
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
                      onChange={(items) =>
                        setGuests((current) =>
                          current.map((item) =>
                            item.clientId === guest.clientId ? { ...item, planItems: items } : item,
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
                        planItems: [newPlanItem()],
                      },
                    ])
                  }
                >
                  <UserPlus aria-hidden="true" size={20} /> Add a guest
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
    </form>
  );
}
