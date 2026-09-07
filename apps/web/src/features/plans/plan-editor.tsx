'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { DRINK_PRESETS, type DrinkCategory, type PlanItemInput } from '@dwd/core';
import { Button } from '@/components/ui/button';

export function newPlanItem(presetId = 'beer'): PlanItemInput {
  const preset = DRINK_PRESETS.find((item) => item.id === presetId) ?? DRINK_PRESETS[0];
  if (preset === undefined) throw new Error('Drink presets are unavailable.');
  return {
    clientId: crypto.randomUUID(),
    label: preset.label,
    category: preset.category,
    volumeMl: preset.volumeMl,
    abvPercent: preset.abvPercent,
    plannedQuantity: 1,
    isQuickLog: true,
  };
}

export function PlanEditor({
  items,
  onChange,
}: {
  items: PlanItemInput[];
  onChange: (items: PlanItemInput[]) => void;
  compact?: boolean;
}) {
  const radioGroup = useId();
  function addPreset(presetId: string) {
    const next = newPlanItem(presetId);
    next.isQuickLog = items.length === 0;
    onChange([...items, next]);
  }

  function update(index: number, patch: Partial<PlanItemInput>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function chooseQuick(index: number) {
    onChange(items.map((item, itemIndex) => ({ ...item, isQuickLog: itemIndex === index })));
  }

  function remove(index: number) {
    const wasQuick = items[index]?.isQuickLog ?? false;
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    if (wasQuick && next[0] !== undefined) next[0] = { ...next[0], isQuickLog: true };
    onChange(next);
  }

  return (
    <div className="stack">
      <fieldset className="choice-grid">
        <legend className="field-label">Participation</legend>
        <button
          type="button"
          className={items.length === 0 ? 'choice active' : 'choice'}
          aria-pressed={items.length === 0}
          onClick={() => onChange([])}
        >
          Water only
        </button>
        <button
          type="button"
          className={items.length > 0 ? 'choice active' : 'choice'}
          aria-pressed={items.length > 0}
          onClick={() => {
            if (items.length === 0) onChange([newPlanItem()]);
          }}
        >
          Plan alcohol
        </button>
      </fieldset>
      {items.length === 0 ? (
        <p className="muted small">
          Log water without an alcohol plan. You can add a plan later before logging alcohol.
        </p>
      ) : (
        <>
          <div className="preset-grid" aria-label="Drink presets">
            {DRINK_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="secondary"
                disabled={items.length >= 20}
                onClick={() => addPreset(preset.id)}
              >
                <Plus aria-hidden="true" size={18} /> {preset.label}
                {preset.estimate === true ? ' · estimate' : ''}
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={items.length >= 20}
              onClick={() => addPreset('cocktail')}
            >
              <Plus aria-hidden="true" size={18} /> Custom
            </Button>
          </div>
          {items.map((item, index) => {
            const domId = item.id ?? item.clientId ?? `item-${String(index)}`;
            return (
              <div className="plan-item" key={domId}>
                <div className="row-between">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name={`quick-${radioGroup}`}
                      checked={item.isQuickLog}
                      onChange={() => chooseQuick(index)}
                    />
                    Quick log
                  </label>
                  <button
                    className="icon-text-button"
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${item.label}`}
                  >
                    <Trash2 aria-hidden="true" size={18} /> Remove
                  </button>
                </div>
                <div className="field-grid">
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor={`label-${domId}`}>Drink name</label>
                    <input
                      className="input"
                      id={`label-${domId}`}
                      value={item.label}
                      maxLength={60}
                      required
                      onChange={(event) => update(index, { label: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`category-${domId}`}>Category</label>
                    <select
                      className="select"
                      id={`category-${domId}`}
                      value={item.category}
                      onChange={(event) =>
                        update(index, { category: event.target.value as DrinkCategory })
                      }
                    >
                      <option value="beer">Beer</option>
                      <option value="wine">Wine</option>
                      <option value="spirit">Spirit</option>
                      <option value="cocktail">Cocktail</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`quantity-${domId}`}>Quantity</label>
                    <input
                      className="input"
                      id={`quantity-${domId}`}
                      type="number"
                      min="1"
                      max="50"
                      required
                      inputMode="numeric"
                      value={item.plannedQuantity}
                      onChange={(event) =>
                        update(index, { plannedQuantity: Number(event.target.value) })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`volume-${domId}`}>Volume (ml)</label>
                    <input
                      className="input"
                      id={`volume-${domId}`}
                      type="number"
                      min="1"
                      max="2000"
                      required
                      inputMode="decimal"
                      value={item.volumeMl}
                      onChange={(event) => update(index, { volumeMl: Number(event.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`abv-${domId}`}>Alcohol (ABV %)</label>
                    <input
                      className="input"
                      id={`abv-${domId}`}
                      type="number"
                      min="0.1"
                      max="95"
                      step="0.1"
                      required
                      inputMode="decimal"
                      value={item.abvPercent}
                      onChange={(event) =>
                        update(index, { abvPercent: Number(event.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <p className="muted small">
            Your plan is a personal intention, not a medically safe allowance.
          </p>
        </>
      )}
    </div>
  );
}
