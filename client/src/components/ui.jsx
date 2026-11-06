import { useEffect, useRef } from 'react';
import { standing, tierOf } from '../game.js';
import { portrait } from '../portrait.js';

function badgeFor(character) {
  if (!character) return '';
  if (character.status === 'dead') return '✝';
  if (character.power === undefined) return '?';
  if (tierOf(character).key === 'legend') return '★';
  if (character.villainsSlain > 0) return '⚔';
  return character.kills > 0 ? '☠' : '';
}

/** A character's icon. Rank, alignment and deeds all show on it. */
export function Avatar({ character, name, size = 36, onClick }) {
  const label = character?.name ?? name ?? '?';
  const initials = label.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const badge = size >= 28 ? badgeFor(character) : '';
  const classes = [
    'avatar',
    `tier-${tierOf(character).key}`,
    `align-${character?.alignment ?? 'unknown'}`,
    character?.status === 'dead' ? 'dead' : '',
    character && standing(character) === 'Feared' ? 'feared' : '',
    character && standing(character) === 'Respected' ? 'respected' : '',
  ].join(' ');
  const face = (
    <span className={classes} style={{ width: size, height: size, background: character?.color ?? '#8a7f70', fontSize: size * 0.38 }}>
      {character ? <img src={portrait(character)} alt="" /> : initials}
      {badge && <span className="avatar-badge" style={{ fontSize: Math.max(size * 0.3, 10) }}>{badge}</span>}
    </span>
  );
  if (!onClick) return <span aria-hidden="true" className="avatar-holder">{face}</span>;
  return <button type="button" className="avatar-holder" aria-label={`Open ${label}'s profile`} onClick={onClick}>{face}</button>;
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
