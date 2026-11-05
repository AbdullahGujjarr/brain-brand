import { useState } from 'react';
import { tierOf } from '../game.js';
import { Avatar } from './ui.jsx';

/** Shows *italics* and **bold** from the AI as real text styles, never as raw HTML. */
function Rich({ text }) {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*.+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const isSpoken = (beat) => beat?.type === 'dialogue' || beat?.type === 'thought';

function Beat({ beat, character, continued, fresh, delay, onOpen, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const style = fresh ? { animationDelay: `${delay}ms` } : undefined;
  const cls = `beat ${beat.type}${continued ? ' continued' : ''}${fresh ? ' fresh' : ''}`;

  if (draft !== null) {
    return (
      <div className="beat editing">
        <textarea rows={3} autoFocus value={draft} aria-label="Edit line" onChange={(e) => setDraft(e.target.value)} />
        <div className="beat-tools">
          <button onClick={() => setDraft(null)}>Cancel</button>
          <button
            onClick={() => {
              onSave(draft);
              setDraft(null);
              setOpen(false);
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  const tools = open && (
    <div className="beat-tools">
      <button onClick={() => setDraft(beat.text)}>Edit</button>
      <button onClick={onDelete}>Delete</button>
    </div>
  );
  const toggle = () => setOpen(!open);

  if (isSpoken(beat)) {
    return (
      <div className={cls} style={style}>
        {continued ? (
          <span className="avatar-gap" />
        ) : (
          <Avatar character={character} name={beat.speaker} size={32} onClick={character ? () => onOpen(character) : undefined} />
        )}
        <div className="bubble-wrap">
          {!continued && (
            <span className="speaker" style={{ color: character?.color }}>
              {beat.speaker}{beat.type === 'thought' && <span className="thinks"> thinks</span>}
              {character?.title && <span className="speaker-title">{character.title}</span>}
            </span>
          )}
          <button
            className={`bubble voice-${character?.alignment ?? 'unknown'} voice-${tierOf(character).key}`}
            style={{ '--who': character?.color }}
            onClick={toggle}
            aria-expanded={open}
          >
            <Rich text={beat.text} />
          </button>
          {tools}
        </div>
      </div>
    );
  }
  return (
    <div className={cls} style={{ ...style, '--who': character?.color }}>
      <button className="prose" onClick={toggle} aria-expanded={open}><Rich text={beat.text} /></button>
      {tools}
    </div>
  );
}

const USER_LABEL = { direct: 'You directed', continue: 'You directed', chapter: 'New chapter', ending: 'Your ending' };

const EFFECT_ICONS = { fame: '✦', kill: '💀', combat: '⚔️', power: '▲', loss: '▼', bond: '🤝', secret: '🔓', title: '🏅', rank: '👑', align: '🎭', chapter: '📖' };

function SceneResults({ effects, fresh }) {
  if (!effects?.length) return null;
  return (
    <section className={`scene-results${fresh ? ' fresh' : ''}`} aria-label="Scene results">
      <h4>Scene results</h4>
      <ul>
        {effects.map((e, i) => (
          <li key={i} className={`effect-${e.kind}`}><span aria-hidden="true">{EFFECT_ICONS[e.kind] ?? '•'}</span>{e.text}</li>
        ))}
      </ul>
    </section>
  );
}

export function Scene({ turn, characters, fresh, chapterHeading, readOnly, onOpen, onRetry, onDelete, onSaveBeat, onDeleteBeat }) {
  const byId = new Map(characters.map((c) => [c._id, c]));
  return (
    <article className="scene">
      {chapterHeading && <h2 className="chapter-mark">{chapterHeading}</h2>}
      {turn.input && (
        <div className="user-line">
          <span>{turn.mode === 'speak' ? `You, as ${turn.speakerName}` : USER_LABEL[turn.mode]}</span>
          <p>{turn.input}</p>
        </div>
      )}
      {turn.heading && <h3 className="scene-title">{turn.heading}</h3>}
      {turn.sceneCast?.length > 0 && (
        <p className="scene-cast">
          In this scene: {turn.sceneCast.map((id) => byId.get(id)?.name).filter(Boolean).join(', ')}
        </p>
      )}
      {turn.beats.map((beat, i) => {
        const prev = turn.beats[i - 1];
        const continued = isSpoken(beat) && isSpoken(prev) && prev.speaker === beat.speaker && prev.type === beat.type;
        return (
          <Beat
            key={beat._id}
            beat={beat}
            character={byId.get(beat.character)}
            continued={continued}
            fresh={fresh}
            delay={Math.min(i * 140, 1800)}
            onOpen={onOpen}
            onSave={(text) => onSaveBeat(turn, beat, text)}
            onDelete={() => onDeleteBeat(turn, beat)}
          />
        );
      })}
      <SceneResults effects={turn.effects} fresh={fresh} />
      {!readOnly && (
        <div className="scene-tools">
          <button onClick={() => onRetry(turn)}>Try again</button>
          {turn.mode !== 'opening' && <button onClick={() => onDelete(turn)}>Delete scene</button>}
        </div>
      )}
    </article>
  );
}
