'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, GlassWater, Plus, Undo2 } from 'lucide-react';
import type { PlanItemInput } from '@dwd/core';
import { Button } from '@/components/ui/button';
import styles from './quick-log.module.css';

/** The same tap layout for count-only sessions and measured night drinks. */
export function QuickLogControls({
  label,
  accessibleLabel = label,
  detail,
  mainDrink,
  onEditMain,
  disabled,
  canUndo = true,
  undoDisabled,
  onLog,
  onChaser,
  onUndo,
  onChoose,
  chaserLabel = 'Chaser',
  undoLabel = 'Undo',
  children,
}: {
  label: string;
  accessibleLabel?: string;
  detail?: string;
  mainDrink?: Pick<PlanItemInput, 'label' | 'volumeMl' | 'abvPercent'> | undefined;
  onEditMain?: (() => void) | undefined;
  disabled: boolean;
  canUndo?: boolean;
  undoDisabled?: boolean;
  onLog: () => void;
  onChaser: () => void;
  onUndo: () => void;
  onChoose?: (() => void) | undefined;
  chaserLabel?: string;
  undoLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles['logControl']}>
      {mainDrink ? (
        <div className={`main-drink ${styles['mainDrink']}`} role="group" aria-label="Main drink">
          <div className={styles['mainDrinkCopy']}>
            <span className={styles['mainDrinkLabel']}>
              <CheckCircle2 size={16} aria-hidden="true" /> Main drink
            </span>
            <strong>{mainDrink.label}</strong>
            <span className="small">
              {mainDrink.volumeMl} ml · {mainDrink.abvPercent}%
            </span>
          </div>
          {onEditMain ? (
            <Button type="button" variant="ghost" disabled={disabled} onClick={onEditMain}>
              Adjust
            </Button>
          ) : null}
        </div>
      ) : null}
      <Button
        type="button"
        className={styles['tap']}
        aria-label={accessibleLabel}
        data-tour="log-drink"
        data-fast-log="drink"
        disabled={disabled}
        onClick={onLog}
      >
        <Plus size={52} strokeWidth={1.7} aria-hidden="true" />
        <span>{label}</span>
      </Button>
      {!mainDrink && detail ? <span className="muted small">{detail}</span> : null}
      <div className={styles['secondaryActions']} data-tour="drink-options">
        <Button
          type="button"
          variant="secondary"
          className="button-water"
          aria-label={chaserLabel}
          data-fast-log="chaser"
          disabled={disabled}
          onClick={onChaser}
        >
          <GlassWater size={20} aria-hidden="true" /> Chaser
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label={undoLabel}
          disabled={(undoDisabled ?? disabled) || !canUndo}
          onClick={onUndo}
        >
          <Undo2 size={18} aria-hidden="true" /> Undo
        </Button>
        {onChoose ? (
          <Button type="button" variant="secondary" disabled={disabled} onClick={onChoose}>
            Choose another drink
          </Button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
