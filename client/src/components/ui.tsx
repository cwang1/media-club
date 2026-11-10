import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { initials } from '../format';

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/** Read-only star display; supports fractional averages. */
export function StarDisplay({ value, size = 16 }: { value: number | null; size?: number }) {
  const pct = value == null ? 0 : (value / 5) * 100;
  return (
    <span
      className="stars"
      style={{ fontSize: size }}
      role="img"
      aria-label={value == null ? 'No rating yet' : `${value.toFixed(1)} out of 5 stars`}
    >
      <span className="stars-empty">★★★★★</span>
      <span className="stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  );
}

/** Clickable 1-5 star input. Clicking the current value clears it. */
export function StarInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="star-input" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= shown ? 'on' : ''}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
      {value != null && (
        <button type="button" className="link small" onClick={() => onChange(null)}>
          clear
        </button>
      )}
    </div>
  );
}

const modalStack: object[] = [];

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const token = {};
    modalStack.push(token);
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // only the top-most dialog reacts to Escape
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      if (modalStack.length === 0) document.body.classList.remove('no-scroll');
      prev?.focus?.();
    };
  }, []);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
      >
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{message}</p>
      <div className="form-actions">
        <button className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
