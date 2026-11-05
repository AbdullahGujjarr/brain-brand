import { useEffect, useRef } from 'react';

export function Avatar({ character, name, size = 36 }) {
  const label = character?.name ?? name ?? '?';
  const initials = label.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span
      className={`avatar${character?.status === 'dead' ? ' dead' : ''}`}
      style={{ width: size, height: size, background: character?.color ?? '#8a7f70', fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/** Modal built on <dialog>, shown as a bottom sheet on phones. */
export function Sheet({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function Confirm({ title, message, action, danger = true, onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted">{message}</p>
      <div className="sheet-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{action}</button>
      </div>
    </Sheet>
  );
}
