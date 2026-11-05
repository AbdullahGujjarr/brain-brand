import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const GENRES = ['Action', 'Fantasy', 'Romance', 'Mystery', 'Horror', 'Sci-fi', 'Crime', 'Drama', 'Comedy'];
export const FREEDOM = [
  ['strict', 'Only my ideas', 'The AI adds no new people or twists.'],
  ['balanced', 'Stay close', 'Small extras when a scene needs them.'],
  ['free', 'Surprise me', 'Twists, betrayals and new arrivals.'],
];

export default function NewStory() {
  const navigate = useNavigate();
  const [premise, setPremise] = useState('');
  const [genre, setGenre] = useState('');
  const [freedom, setFreedom] = useState('balanced');
  const [characters, setCharacters] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateCharacter = (i, key, value) =>
    setCharacters(characters.map((c, n) => (n === i ? { ...c, [key]: value } : c)));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { story } = await api.post('/stories', { premise, genre, freedom, characters });
      navigate(`/story/${story._id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <header className="lib-head">
        <Link className="link" to="/">‹ Your stories</Link>
      </header>
      <h1>What happens in your story?</h1>
      <p className="muted">A few lines are enough. Mention names and relationships, and the AI brings those people in.</p>

      <form onSubmit={submit} className="new-form">
        <textarea
          className="premise"
          rows={5}
          autoFocus
          required
          maxLength={4000}
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          placeholder="Zara, a street fighter, finds out her brother Ali has joined the gang that killed their father. Tonight she walks into their hideout."
        />

        <fieldset>
          <legend>Genre <span className="muted">(optional)</span></legend>
          <div className="chips">
            {GENRES.map((g) => (
              <button
                type="button"
                key={g}
                className={`chip${genre === g ? ' on' : ''}`}
                aria-pressed={genre === g}
                onClick={() => setGenre(genre === g ? '' : g)}
              >
                {g}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>How much can the AI add?</legend>
          <div className="choice-row">
            {FREEDOM.map(([value, label, hint]) => (
              <button
                type="button"
                key={value}
                className={`choice${freedom === value ? ' on' : ''}`}
                aria-pressed={freedom === value}
                onClick={() => setFreedom(value)}
              >
                <strong>{label}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Add characters yourself <span className="muted">(optional)</span></legend>
          {characters.map((c, i) => (
            <div className="char-row" key={i}>
              <input
                placeholder="Name"
                aria-label="Character name"
                value={c.name}
                onChange={(e) => updateCharacter(i, 'name', e.target.value)}
              />
              <input
                placeholder="Who are they?"
                aria-label="Character role"
                value={c.role}
                onChange={(e) => updateCharacter(i, 'role', e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove character"
                onClick={() => setCharacters(characters.filter((_, n) => n !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setCharacters([...characters, { name: '', role: '' }])}>
            Add a character
          </button>
        </fieldset>

        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy || !premise.trim()}>
          {busy ? 'Writing your opening scene…' : 'Start the story'}
        </button>
      </form>
    </div>
  );
}
