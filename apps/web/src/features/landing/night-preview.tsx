'use client';

import { Droplets, Plus, RotateCcw, Wine } from 'lucide-react';
import { useCookiePreferences } from '@/features/privacy/cookie-preferences';
import styles from './landing.module.css';

type Entry = 'drink' | 'chaser';

// This illustrative demo is separate from actual logs; persistence requires cookie opt-in.
export function NightPreview() {
  const { demo: entries, updateDemo, optional, previewLayout } = useCookiePreferences();
  const drinks = entries.filter((entry) => entry === 'drink').length;
  const chasers = entries.length - drinks;

  function add(entry: Entry) {
    updateDemo([...entries, entry]);
  }

  return (
    <div className={styles['previewStage']} data-preview-layout={previewLayout}>
      <div className={styles['coaster']} aria-hidden="true">
        <span>
          GOOD
          <br />
          COMPANY
        </span>
        <span>ALWAYS.</span>
      </div>
      <section className={styles['receipt']} aria-label="Interactive drink log preview">
        <header className={styles['receiptHeader']}>
          <span className={styles['receiptBrand']}>dwd.</span>
          <span>
            PREVIEW
            <br />
            NO. 001
          </span>
        </header>
        <div className={styles['receiptTitle']}>
          <h2>Tonight, so far.</h2>
          <span>YOUR PERSONAL COUNT</span>
        </div>
        <dl className={styles['counts']} aria-live="polite" aria-atomic="true">
          <div>
            <dt>
              <Wine size={17} aria-hidden="true" /> Drinks
            </dt>
            <dd>{String(drinks).padStart(2, '0')}</dd>
          </div>
          <div>
            <dt>
              <Droplets size={17} aria-hidden="true" /> Chasers
            </dt>
            <dd>{String(chasers).padStart(2, '0')}</dd>
          </div>
        </dl>
        <div className={styles['previewControls']}>
          <button
            type="button"
            aria-label="Add a drink to the preview"
            onClick={() => add('drink')}
          >
            Drink <Plus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Add a chaser to the preview"
            onClick={() => add('chaser')}
          >
            Chaser <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <div className={styles['receiptBottom']}>
          <span>
            {optional ? 'Demo remembered in this browser.' : 'Try a tap. Demo resets on reload.'}
          </span>
          <button
            type="button"
            onClick={() => updateDemo(entries.slice(0, -1))}
            disabled={entries.length === 0}
            aria-label="Undo last preview entry"
          >
            <RotateCcw size={14} aria-hidden="true" /> Undo
          </button>
        </div>
        <div className={styles['receiptRule']} aria-hidden="true" />
        <p className={styles['receiptFootnote']}>A count, never a competition.</p>
      </section>
      <span className={styles['stageCaption']} aria-hidden="true">
        A SMALL RECORD OF A GOOD NIGHT.
      </span>
    </div>
  );
}
