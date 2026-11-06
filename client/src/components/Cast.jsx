import { useState } from 'react';
import { api } from '../api.js';
import { ALIGNMENTS, rankCast, tierOf } from '../game.js';
import { Avatar, Sheet } from './ui.jsx';

const REL_TYPES = [
  ['neutral', 'Neutral'],
  ['trusted', 'Trusted'],
  ['ally', 'Ally'],
  ['enemy', 'Enemy'],
  ['nemesis', 'Nemesis'],
  ['friend', 'Friend'],
  ['family', 'Family'],
  ['love', 'Love'],
  ['crush', 'Crush'],
  ['jealous', 'Jealous'],
  ['rival', 'Rival'],
];
const STATUS = ['active', 'injured', 'captured', 'missing', 'dead'];

function CastRow({ character, rank, onOpen }) {
  const tier = tierOf(character);
  return (
    <button className={`cast-row${rank === 1 ? ' top' : ''}`} onClick={() => onOpen(character)}>
      {rank > 0 && <span className="rank-number">{rank === 1 ? '👑' : rank}</span>}
      <Avatar character={character} />
      <span className="cast-text">
        <strong>{character.name}</strong>
        <small>{character.title || character.role || ALIGNMENTS[character.alignment]}</small>
        {character.power !== undefined && character.status !== 'dead' && (
          <span className={`power-bar tier-${tier.key}`}><i style={{ width: `${character.power}%` }} /></span>
        )}
      </span>
      <span className="cast-side">
        <b>{character.status === 'dead' ? '' : character.power ?? '???'}</b>
        {character.status !== 'active' && <span className={`tag ${character.status}`}>{character.status}</span>}
        {character.control === 'user' && <span className="tag">You</span>}
      </span>
    </button>
  );
}

export function CastList({ characters, onOpen, onAdd, onGroup }) {
  const ranked = rankCast(characters);
  const hidden = characters.filter((c) => c.power === undefined && c.status !== 'dead');
  const fallen = characters.filter((c) => c.status === 'dead');

  return (
    <div className="cast-list">
      <div className="cast-actions">
        <button className="btn small" onClick={onAdd}>Add character</button>
        <button className="btn small" onClick={onGroup} disabled={characters.length < 2}>Group or split</button>
      </div>
      {ranked.map((c, i) => <CastRow key={c._id} character={c} rank={i + 1} onOpen={onOpen} />)}
      {hidden.length > 0 && <h3>Hiding their strength</h3>}
      {hidden.map((c) => <CastRow key={c._id} character={c} rank={0} onOpen={onOpen} />)}
      {fallen.length > 0 && <h3>Fallen</h3>}
      {fallen.map((c) => <CastRow key={c._id} character={c} rank={0} onOpen={onOpen} />)}
      {!characters.length && <p className="muted">No characters yet.</p>}
    </div>
  );
}

export function CharacterSheet({ storyId, character, characters, onSaved, onClose }) {
  const isNew = !character;
  const [form, setForm] = useState({
    name: character?.name ?? '',
    role: character?.role ?? '',
    description: character?.description ?? '',
    personality: character?.personality ?? '',
    motive: character?.motive ?? '',
    faction: character?.faction ?? '',
    status: character?.status ?? 'active',
    control: character?.control ?? 'ai',
    voice: character?.voice ?? '',
  });
  // The AI's own secrets stay hidden, so only an empty or user-written secret can be edited.
  const canEditSecret = isNew || !character.hasSecret || Boolean(character.secret);
  const [secret, setSecret] = useState(character?.secret ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const url = `/stories/${storyId}/characters`;
  const others = characters.filter((c) => c._id !== character?._id);
  const factions = [...new Set(characters.map((c) => c.faction).filter(Boolean))];

  async function run(work, close = true) {
    setBusy(true);
    setError('');
    try {
      await work();
      if (close) onClose();
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      if (isNew) {
        const { character: created } = await api.post(url, secret ? { ...form, secret } : form);
        onSaved([...characters, created]);
      } else {
        const changedSecret = canEditSecret && secret !== (character.secret ?? '');
        const body = changedSecret ? { ...form, secret } : form;
        onSaved((await api.patch(`${url}/${character._id}`, body)).characters);
      }
    });
  };

  const setBond = (other, type) =>
    run(async () => {
      const relationship = { target: other._id, type };
      onSaved((await api.patch(`${url}/${character._id}`, { relationship })).characters);
    }, false);

  const remove = () => run(async () => onSaved((await api.del(`${url}/${character._id}`)).characters));

  return (
    <Sheet title={isNew ? 'New character' : character.name} onClose={onClose}>
      <form onSubmit={save} className="char-form">
        <label>Name<input value={form.name} onChange={set('name')} required maxLength={80} /></label>
        <label>Who are they?<input value={form.role} onChange={set('role')} placeholder="Zara's older brother" /></label>

        <div className="field">
          <span>Who plays this character?</span>
          <div className="segmented">
            <button type="button" className={form.control === 'ai' ? 'on' : ''} onClick={() => setForm({ ...form, control: 'ai' })}>AI decides</button>
            <button type="button" className={form.control === 'user' ? 'on' : ''} onClick={() => setForm({ ...form, control: 'user' })}>Only me</button>
          </div>
        </div>

        <div className="two">
          <label>
            Group or alliance
            <input value={form.faction} onChange={set('faction')} list="factions" placeholder="None" />
            <datalist id="factions">{factions.map((f) => <option key={f} value={f} />)}</datalist>
          </label>
          <label>
            Condition
            <select value={form.status} onChange={set('status')}>
              {STATUS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </label>
        </div>

        <label>Motive<textarea rows={2} value={form.motive} onChange={set('motive')} placeholder="What do they want?" /></label>
        <label>Personality<textarea rows={2} value={form.personality} onChange={set('personality')} /></label>
        <label>Way of speaking<textarea rows={2} value={form.voice} onChange={set('voice')} placeholder="Short and sharp, never says sorry" /></label>
        <label>Appearance<textarea rows={2} value={form.description} onChange={set('description')} /></label>
        {canEditSecret && (
          <label>Secret<textarea rows={2} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Something only you and the AI know" /></label>
        )}

        {!isNew && others.length > 0 && (
          <div className="field">
            <span>Relationships</span>
            <div className="bonds">
              {others.map((other) => {
                const bond = character.relationships.find((r) => r.target === other._id);
                return (
                  <div key={other._id} className="bond">
                    <Avatar character={other} size={28} />
                    <span className="bond-name">
                      {other.name}
                      {bond?.label && <small>{bond.label}</small>}
                    </span>
                    <select
                      aria-label={`Relationship with ${other.name}`}
                      value={bond?.type ?? 'neutral'}
                      disabled={busy}
                      onChange={(e) => setBond(other, e.target.value)}
                    >
                      {REL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sheet-actions">
          {!isNew && <button type="button" className="btn danger-text" disabled={busy} onClick={remove}>Remove</button>}
          <button className="btn primary" disabled={busy}>{isNew ? 'Add to story' : 'Save'}</button>
        </div>
      </form>
    </Sheet>
  );
}

/** Vertical bar on the side of the story: tap faces to choose who is in the next scene. */
export function SceneRail({ characters, selected, open, onToggle, onChange }) {
  const living = characters.filter((c) => c.status !== 'dead');
  const flip = (id) => onChange((now) => (now.includes(id) ? now.filter((p) => p !== id) : [...now, id]));

  if (!open) {
    return (
      <button className={`rail-handle${selected.length ? ' on' : ''}`} aria-label="Choose who is in this scene" onClick={onToggle}>
        <span className="rail-arrow" aria-hidden="true">›</span>
        <span className="rail-count">{selected.length || 'All'}</span>
      </button>
    );
  }
  return (
    <aside className="scene-rail" aria-label="Who is in this scene">
      <button className="rail-close" aria-label="Close character bar" onClick={onToggle}>‹</button>
      <button className={`rail-all${selected.length ? '' : ' on'}`} aria-pressed={!selected.length} onClick={() => onChange([])}>All</button>
      <div className="rail-list">
        {living.map((c) => {
          const on = selected.includes(c._id);
          return (
            <button key={c._id} className={`rail-item${on ? ' on' : ''}${selected.length && !on ? ' dim' : ''}`} aria-pressed={on} onClick={() => flip(c._id)}>
              <Avatar character={c} size={40} />
              <small>{c.name}</small>
              {on && <span className="rail-tick" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function GroupSheet({ storyId, characters, onSaved, onClose }) {
  const [picked, setPicked] = useState([]);
  const [action, setAction] = useState('alliance');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  async function submit(e) {
    e.preventDefault();
    try {
      const res = await api.post(`/stories/${storyId}/characters/group`, { ids: picked, action, name });
      onSaved(res.characters);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Sheet title="Group or split characters" onClose={onClose}>
      <form onSubmit={submit} className="char-form">
        <div className="segmented">
          <button type="button" className={action === 'alliance' ? 'on' : ''} onClick={() => setAction('alliance')}>Make an alliance</button>
          <button type="button" className={action === 'enemies' ? 'on' : ''} onClick={() => setAction('enemies')}>Make them enemies</button>
        </div>
        <div className="pick-list">
          {characters.map((c) => (
            <label key={c._id} className="pick">
              <input type="checkbox" checked={picked.includes(c._id)} onChange={() => toggle(c._id)} />
              <Avatar character={c} size={28} />
              {c.name}
            </label>
          ))}
        </div>
        {action === 'alliance' && (
          <label>Alliance name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Night Watch" /></label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="sheet-actions">
          <button className="btn primary" disabled={picked.length < 2}>Apply to {picked.length || 'selected'}</button>
        </div>
      </form>
    </Sheet>
  );
}
