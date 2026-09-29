'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { DRINK_PRESETS, drinkCategorySchema, type PlanSetupMode } from '@dwd/core';
import { Button } from '@/components/ui/button';
import { newPlanItem, type PlanDraftItem } from './plan-draft';

export { draftItemsFromPlan, materializePlanDraft, newPlanItem } from './plan-draft';
export type { PlanDraftItem } from './plan-draft';

export function PlanEditor({
  items,
  onChange,
  mode = items.length === 0 ? 'water_only' : 'drinks',
  onModeChange,
}: {
  items: PlanDraftItem[];
  onChange: (items: PlanDraftItem[]) => void;
  mode?: PlanSetupMode;
  onModeChange?: (mode: PlanSetupMode) => void;
  compact?: boolean;
}) {
  const radioGroup = useId();
  const editor = useRef<HTMLDivElement>(null);
  const addedItem = useRef<string | null>(null);

  useEffect(() => {
    if (addedItem.current === null) return;
    const card = Array.from(
      editor.current?.querySelectorAll<HTMLElement>('[data-plan-item]') ?? [],
    ).find((element) => element.dataset['planItem'] === addedItem.current);
    if (!card) return;
    addedItem.current = null;
    card.focus({ preventScroll: true });
    card.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }, [items]);
  const setMode = (next: PlanSetupMode) => {
    onModeChange?.(next);
    if (next === 'water_only') onChange([]);
    if (next === 'drinks' && items.length === 0) onChange([newPlanItem()]);
  };

  function addPreset(presetId: string) {
    const next = newPlanItem(presetId);
    addedItem.current = next.clientId ?? null;
    const isPlaceholder = hasBlankPlaceholder(items);
    next.isQuickLog = items.length === 0 || isPlaceholder;
    onModeChange?.('drinks');
    onChange(isPlaceholder ? [next] : [...items, next]);
  }

  function addCustom() {
    const next = newPlanItem();
    addedItem.current = next.clientId ?? null;
    next.category = 'other';
    onModeChange?.('drinks');
    const isPlaceholder = hasBlankPlaceholder(items);
    next.isQuickLog = items.length === 0 || isPlaceholder;
    onChange(isPlaceholder ? [next] : [...items, next]);
  }

  function update(index: number, patch: Partial<PlanDraftItem>) {
    onModeChange?.('drinks');
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
    if (next.length === 0) onModeChange?.('unselected');
  }

  return (
    <div className="stack" ref={editor}>
      <fieldset className="choice-grid">
        <legend className="field-label">Choose a plan</legend>
        <button
          type="button"
          className={mode === 'drinks' ? 'choice active' : 'choice'}
          aria-pressed={mode === 'drinks'}
          onClick={() => setMode('drinks')}
        >
          Plan drinks
        </button>
        <button
          type="button"
          className={mode === 'water_only' ? 'choice active' : 'choice'}
          aria-pressed={mode === 'water_only'}
          onClick={() => setMode('water_only')}
        >
          Chaser only
        </button>
      </fieldset>
      {mode === 'drinks' ? (
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
              onClick={addCustom}
            >
              <Plus aria-hidden="true" size={18} /> Custom
            </Button>
          </div>
          <p className="muted small">Your main drink is the one you can log with one tap.</p>
          {items.length === 0 ? <p className="muted small">Add a drink to continue.</p> : null}
          {items.map((item, index) => {
            const domId = item.id ?? item.clientId ?? `item-${String(index)}`;
            return (
              <div
                className="plan-item"
                key={domId}
                data-plan-item={domId}
                tabIndex={-1}
                aria-label={`${item.label || 'Custom drink'} details`}
              >
                <div className="row-between">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name={`quick-${radioGroup}`}
                      checked={item.isQuickLog}
                      onChange={() => chooseQuick(index)}
                    />
                    Main drink
                  </label>
                  <button
                    className="icon-text-button"
                    type="button"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${item.label || 'drink'}`}
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
                      onChange={(event) => {
                        const parsed = drinkCategorySchema.safeParse(event.target.value);
                        update(index, { category: parsed.success ? parsed.data : '' });
                      }}
                    >
                      <option value="">Choose a drink</option>
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
                      onChange={(event) => update(index, { plannedQuantity: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`volume-${domId}`}>Drink size (ml)</label>
                    <input
                      className="input"
                      id={`volume-${domId}`}
                      type="number"
                      min="1"
                      max="2000"
                      required
                      inputMode="decimal"
                      value={item.volumeMl}
                      onChange={(event) => update(index, { volumeMl: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`abv-${domId}`}>Alcohol strength (%)</label>
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
                      onChange={(event) => update(index, { abvPercent: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <p className="muted small">A plan is not a safe drinking limit.</p>
        </>
      ) : null}
    </div>
  );
}

function hasBlankPlaceholder(items: readonly PlanDraftItem[]): boolean {
  const item = items.length === 1 ? items[0] : undefined;
  return (
    item !== undefined &&
    item.label.trim() === '' &&
    item.category === '' &&
    item.volumeMl === '' &&
    item.abvPercent === ''
  );
}
