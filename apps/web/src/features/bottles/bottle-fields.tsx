'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { bottleDrinkWord, type MemberSnapshot } from '@dwd/core';
import type { BottleDraft } from './bottle-draft';

export function DrinkQuantity({
  value,
  onChange,
  word,
}: {
  value: string;
  onChange: (value: string) => void;
  word: string;
}) {
  const id = useId();
  return (
    <div className="bottle-quantity field">
      <label htmlFor={id}>Your {word}s from this bottle</label>
      <div className="bottle-stepper">
        <button
          type="button"
          aria-label={`Fewer ${word}s`}
          disabled={Number(value) <= 1}
          onClick={() => onChange(String(Math.max(1, Number(value) - 1)))}
        >
          <Minus size={20} aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          step={1}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={`More ${word}s`}
          disabled={Number(value) >= 50}
          onClick={() => onChange(String(Math.min(50, Number(value) + 1)))}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function BottleFields({
  draft,
  onChange,
  members = [],
  creatorMemberId,
  targetMemberId,
  initial = false,
}: {
  draft: BottleDraft;
  onChange: (draft: BottleDraft) => void;
  members?: MemberSnapshot[];
  creatorMemberId?: string;
  targetMemberId?: string;
  initial?: boolean;
}) {
  const id = useId();
  const word = bottleDrinkWord(draft.category);
  const [detailsOpen, setDetailsOpen] = useState(!draft.abvPercent);
  function update(patch: Partial<BottleDraft>) {
    onChange({ ...draft, ...patch });
  }
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${id}-name`}>Bottle name</label>
        <input
          className="input"
          id={`${id}-name`}
          placeholder="e.g. Jameson, gin, rosé"
          maxLength={60}
          required
          value={draft.label}
          onChange={(event) => update({ label: event.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-kind`}>What’s in the bottle?</label>
        <select
          className="select"
          id={`${id}-kind`}
          value={draft.category}
          onChange={(event) => {
            const category = event.target.value as BottleDraft['category'];
            if (category === 'cocktail' || category === 'other') setDetailsOpen(true);
            update({
              category,
              ...(category === 'wine'
                ? { abvPercent: '12', pourMl: '150' }
                : category === 'spirit'
                  ? { abvPercent: '40', pourMl: '30' }
                  : category === 'beer'
                    ? { abvPercent: '5', pourMl: '330' }
                    : { abvPercent: '' }),
            });
          }}
        >
          <option value="spirit">Spirit / shots</option>
          <option value="wine">Wine</option>
          <option value="beer">Beer</option>
          <option value="cocktail">Cocktail</option>
          <option value="other">Other</option>
        </select>
      </div>
      <DrinkQuantity
        value={draft.defaultQuantity}
        onChange={(defaultQuantity) => update({ defaultQuantity })}
        word={word}
      />
      <details
        className="bottle-details"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        onInvalidCapture={() => setDetailsOpen(true)}
      >
        <summary>
          <strong>Bottle details</strong>
          <span>
            {draft.volumeMl || '—'} ml · {draft.abvPercent || '—'}% · {draft.pourMl || '—'} ml per{' '}
            {word}
          </span>
        </summary>
        <div className="field-grid">
          <div className="field">
            <label htmlFor={`${id}-size`}>Bottle size (ml)</label>
            <input
              className="input"
              id={`${id}-size`}
              type="number"
              min={1}
              max={10000}
              step="any"
              required
              value={draft.volumeMl}
              onChange={(event) => update({ volumeMl: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-strength`}>Alcohol strength (%)</label>
            <input
              className="input"
              id={`${id}-strength`}
              type="number"
              min="0.1"
              max={95}
              step="0.1"
              required
              value={draft.abvPercent}
              onChange={(event) => update({ abvPercent: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-serving`}>{word === 'shot' ? 'Shot' : 'Drink'} size (ml)</label>
            <input
              className="input"
              id={`${id}-serving`}
              type="number"
              min={1}
              max={2000}
              step="any"
              required
              value={draft.pourMl}
              onChange={(event) => update({ pourMl: event.target.value })}
            />
          </div>
        </div>
        <p className="small muted">
          Check your bottle’s label. For mixed drinks, count just the alcohol, without the mixer.
        </p>
      </details>
      {!initial && (
        <>
          <fieldset className="choice-grid">
            <legend className="field-label">Who can join?</legend>
            <button
              type="button"
              className={`choice${draft.access === 'everyone' ? ' active' : ''}`}
              aria-pressed={draft.access === 'everyone'}
              onClick={() => update({ access: 'everyone' })}
            >
              Everyone
            </button>
            <button
              type="button"
              className={`choice${draft.access === 'selected' ? ' active' : ''}`}
              aria-pressed={draft.access === 'selected'}
              onClick={() => update({ access: 'selected' })}
            >
              Choose people
            </button>
          </fieldset>
          {draft.access === 'selected' && (
            <div className="bottle-invitees">
              {members
                .filter(
                  (person) =>
                    person.leftAt === null &&
                    person.id !== creatorMemberId &&
                    person.id !== targetMemberId,
                )
                .map((person) => (
                  <label className="bottle-person" key={person.id}>
                    <input
                      type="checkbox"
                      checked={draft.allowedMemberIds.includes(person.id)}
                      onChange={(event) =>
                        update({
                          allowedMemberIds: event.target.checked
                            ? [...draft.allowedMemberIds, person.id]
                            : draft.allowedMemberIds.filter((memberId) => memberId !== person.id),
                        })
                      }
                    />
                    <span>{person.displayName}</span>
                  </label>
                ))}
            </div>
          )}
        </>
      )}
      <p className="small muted">
        {initial ? 'Everyone in the night can choose to join. ' : ''}This becomes your main drink.
        You can change it with Adjust.
      </p>
    </div>
  );
}
