import { useState } from 'react';
import { api } from '../api.js';
import { Avatar, Sheet } from './ui.jsx';

const REL_TYPES = [
  ['neutral', 'Neutral'],
  ['ally', 'Ally'],
  ['enemy', 'Enemy'],
  ['friend', 'Friend'],
  ['family', 'Family'],
  ['love', 'Love'],
  ['rival', 'Rival'],
];
const STATUS = ['active', 'injured', 'captured', 'missing', 'dead'];

export function CastList({ characters, onOpen, onAdd, onGroup }) {
  const groups = new Map();
  for (const c of characters) {
    const key = c.faction || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

  return (
    <div className="cast-list">
      <div className="cast-actions">
        <button className="btn small" onClick={onAdd}>Add character</button>
        <button className="btn small" onClick={onGroup} disabled={characters.length < 2}>Group or split</button>
      </div>
      {ordered.map(([faction, members]) => (
        <section key={faction}>
          {(faction || groups.size > 1) && <h3>{faction || 'No group'}</h3>}
          {members.map((c) => (
            <button key={c._id} className="cast-row" onClick={() => onOpen(c)}>
              <Avatar character={c} />
              <span className="cast-text">
                <strong>{c.name}</strong>
                <small>{c.role || 'Tap to add details'}</small>
              </span>
              {c.status !== 'active' && <span className={`tag ${c.status}`}>{c.status}</span>}
              {c.control === 'user' && <span className="tag">You</span>}
            </button>
          ))}
        </section>
      ))}
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
  });
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
        const { character: created } = await api.post(url, form);
        onSaved([...characters, created]);
      } else {
        onSaved((await api.patch(`${url}/${character._id}`, form)).characters);
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
        <label>Appearance<textarea rows={2} value={form.description} onChange={set('description')} /></label>

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

export function SceneSheet({ characters, selected, onChange, onClose }) {
  const [picked, setPicked] = useState(selected);
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);
  const living = characters.filter((c) => c.status !== 'dead');

  return (
    <Sheet title="Who is in this scene?" onClose={onClose}>
      <p className="muted sheet-hint">The AI will only use the characters you tick. Leave all unticked to use everyone.</p>
      <div className="pick-list">
        {living.map((c) => (
          <label key={c._id} className="pick">
            <input type="checkbox" checked={picked.includes(c._id)} onChange={() => toggle(c._id)} />
            <Avatar character={c} size={28} />
            <span className="pick-name">
              {c.name}
              {c.role && <small>{c.role}</small>}
            </span>
          </label>
        ))}
      </div>
      <div className="sheet-actions">
        <button className="btn" onClick={() => setPicked([])} disabled={!picked.length}>Clear</button>
        <button
          className="btn primary"
          onClick={() => {
            onChange(picked);
            onClose();
          }}
        >
          {picked.length ? `Use ${picked.length} in scene` : 'Use everyone'}
        </button>
      </div>
    </Sheet>
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
