'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './photo-sharing.module.css';

export function PhotoDialog({
  open,
  title,
  onClose,
  busy = false,
  children,
  viewer = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  viewer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${styles['dialog']} ${viewer ? styles['viewerDialog'] : ''}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className={styles['dialogHeader']}>
        <h2>{title}</h2>
        <button
          type="button"
          className={styles['iconButton']}
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
