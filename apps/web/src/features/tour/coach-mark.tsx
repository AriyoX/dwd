'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { placeCoach, type Box } from './position';
import { tourSteps, type TourScreen, type TourStep } from './steps';

const focusable =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
interface Geometry {
  target: Box;
  card: { top: number; left: number; side: string };
  viewport: Box;
}

export function CoachMark({
  step,
  screen,
  index,
  waiting,
  onClose,
  onBack,
  onNext,
  onTargetAction,
}: {
  step: TourStep | undefined;
  screen: TourScreen | undefined;
  index: number;
  waiting: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onTargetAction: (id: string) => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [suspended, setSuspended] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const callbacks = useRef({ onClose, onTargetAction });
  useEffect(() => {
    callbacks.current = { onClose, onTargetAction };
  }, [onClose, onTargetAction]);

  useEffect(() => {
    const previousPadding = document.body.style.paddingBottom;
    document.body.dataset['tourActive'] = 'true';
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.paddingBottom = '360px';
    return () => {
      document.body.style.paddingBottom = previousPadding;
      delete document.body.dataset['tourActive'];
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let frame = 0;
    let disposed = false;
    let focused = false;
    let modalOpen = false;
    const inertElements = new Map<HTMLElement, boolean>();
    const restore = () => {
      inertElements.forEach((value, element) => {
        element.inert = value;
      });
      inertElements.clear();
    };
    const isolate = (root: HTMLElement, keep: HTMLElement[]) => {
      for (const child of Array.from(root.children)) {
        if (!(child instanceof HTMLElement) || ['SCRIPT', 'STYLE'].includes(child.tagName))
          continue;
        if (keep.some((element) => child === element)) continue;
        if (keep.some((element) => child.contains(element))) isolate(child, keep);
        else {
          if (!inertElements.has(child)) inertElements.set(child, child.inert);
          child.inert = true;
        }
      }
    };
    const update = () => {
      if (disposed) return;
      const panel = panelRef.current;
      const modal = document.querySelector<HTMLElement>(
        '[role="dialog"]:not([data-tour-coach]), [role="alertdialog"]',
      );
      modalOpen = modal !== null;
      setSuspended(modalOpen);
      if (modalOpen) {
        restore();
        setGeometry(null);
        focused = false;
        return;
      }
      const found =
        screen && !waiting
          ? document.querySelector<HTMLElement>(`[data-tour="${screen.target}"]`)
          : null;
      if (found !== target) {
        restore();
        target = found;
        focused = false;
        resize.disconnect();
        if (target) resize.observe(target);
        if (panel) resize.observe(panel);
      }
      if (!target || !panel || target.getClientRects().length === 0) {
        setGeometry(null);
        return;
      }
      const viewport = {
        top: window.visualViewport?.offsetTop ?? 0,
        left: window.visualViewport?.offsetLeft ?? 0,
        width: window.visualViewport?.width ?? innerWidth,
        height: window.visualViewport?.height ?? innerHeight,
      };
      const bounds = target.getBoundingClientRect();
      // Leave room for the real controls even when the mobile keyboard is open.
      panel.style.maxHeight = `${Math.max(100, viewport.height - bounds.height - 48)}px`;
      const box = {
        top: bounds.top - 5,
        left: bounds.left - 5,
        width: bounds.width + 10,
        height: bounds.height + 10,
      };
      const size = panel.getBoundingClientRect();
      const position = placeCoach(box, size, viewport, step?.placement);
      // Prefer placing a logging explanation below its button so the count above stays visible.
      if (step?.placement === 'bottom' && position?.side === 'top') {
        const desiredTop =
          viewport.top +
          Math.max(
            24,
            Math.min(viewport.height / 2, viewport.height - size.height - bounds.height - 40),
          );
        const shift = bounds.top - desiredTop;
        if (Math.abs(shift) > 1) {
          window.scrollBy({ top: shift, behavior: 'instant' });
          setGeometry(null);
          schedule();
          return;
        }
      }
      if (
        !position ||
        box.top < viewport.top + 12 ||
        box.top + box.height > viewport.top + viewport.height - 12
      ) {
        const shift = bounds.top - viewport.top - 24;
        if (Math.abs(shift) > 1) {
          window.scrollBy({ top: shift, behavior: 'instant' });
          schedule();
        }
        setGeometry(null);
        return;
      }
      setGeometry((old) => {
        const next = { target: box, card: position, viewport };
        return JSON.stringify(old) === JSON.stringify(next) ? old : next;
      });
      const overlay = panel.closest<HTMLElement>('[data-tour-overlay]');
      restore();
      if (overlay) isolate(document.body, step?.interactive ? [target, overlay] : [overlay]);
      if (!focused) {
        if (getComputedStyle(panel).visibility === 'visible') {
          panel.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
          focused = true;
        } else schedule();
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    const click = (event: MouseEvent) => {
      if (modalOpen || !target || !(event.target instanceof Node) || !target.contains(event.target))
        return;
      if (step?.onTargetClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.current.onTargetAction(step.onTargetClick);
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      // The animation-frame geometry state may lag behind a newly opened
      // dialog. Let the current modal consume Escape/Tab before the tour.
      if (modalOpen || event.defaultPrevented || document.querySelector('[aria-modal="true"]'))
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        callbacks.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      const controls = Array.from(panel?.querySelectorAll<HTMLElement>(focusable) ?? []);
      const targets =
        step?.interactive && target
          ? [
              ...(target.matches(focusable) ? [target] : []),
              ...target.querySelectorAll<HTMLElement>(focusable),
            ]
          : [];
      const items = [...controls, ...targets].filter(
        (element) => element.getClientRects().length > 0 && !element.closest('[inert]'),
      );
      if (!items.length) return;
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? current <= 0
          ? items.length - 1
          : current - 1
        : (current + 1) % items.length;
      event.preventDefault();
      items[next]?.focus({ preventScroll: true });
    };
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keyboard);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      restore();
      resize.disconnect();
      mutations.disconnect();
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', keyboard);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [screen, step, waiting]);

  const ready = !waiting && geometry !== null;
  return createPortal(
    <div data-tour-overlay hidden={suspended}>
      {ready ? (
        <>
          <div
            className="tour-shade"
            style={{ top: 0, left: 0, right: 0, height: geometry.target.top }}
          />
          <div
            className="tour-shade"
            style={{
              top: geometry.target.top + geometry.target.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            className="tour-shade"
            style={{
              top: geometry.target.top,
              left: 0,
              width: Math.max(0, geometry.target.left),
              height: geometry.target.height,
            }}
          />
          <div
            className="tour-shade"
            style={{
              top: geometry.target.top,
              left: geometry.target.left + geometry.target.width,
              right: 0,
              height: geometry.target.height,
            }}
          />
          <div
            className="tour-spotlight"
            style={{ ...geometry.target, pointerEvents: step?.interactive ? 'none' : 'auto' }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="tour-shade tour-loading-shade" />
      )}
      {!ready && (
        <div className="tour-opening" role="status">
          Opening this step…{' '}
          <button type="button" className="text-link" onClick={onClose}>
            Skip tour
          </button>
        </div>
      )}
      <section
        ref={panelRef}
        role="dialog"
        data-tour-coach
        data-step={step?.id}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="tour-coach"
        style={{
          top: geometry?.card.top ?? 12,
          left: geometry?.card.left ?? 12,
          visibility: ready ? 'visible' : 'hidden',
        }}
      >
        <button type="button" className="dialog-close" aria-label="Close tour" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
        <p className="muted small">
          App tour · {index + 1} of {tourSteps.length}
        </p>
        <h2 id={titleId}>{step?.title}</h2>
        <p id={descriptionId}>{screen?.description}</p>
        <div className="tour-progress" aria-label={`Step ${index + 1} of ${tourSteps.length}`}>
          {tourSteps.map((item, i) => (
            <span key={item.id} className={i === index ? 'active' : ''} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Skip tour
          </button>
          <div className="row">
            {index > 0 && (
              <button type="button" className="button button-secondary" onClick={onBack}>
                Back
              </button>
            )}
            <button type="button" className="button button-primary" onClick={onNext}>
              {index === tourSteps.length - 1 ? 'Finish tour' : 'Next'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
