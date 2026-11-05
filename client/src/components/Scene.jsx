import { useState } from 'react';
import { Avatar } from './ui.jsx';

function Beat({ beat, character, fresh, delay, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const style = fresh ? { animationDelay: `${delay}ms` } : undefined;
  const cls = `beat ${beat.type}${fresh ? ' fresh' : ''}`;

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

  if (beat.type === 'dialogue' || beat.type === 'thought') {
    return (
      <div className={cls} style={style}>
        <Avatar character={character} name={beat.speaker} />
        <div className="bubble-wrap">
          <span className="speaker" style={{ color: character?.color }}>{beat.speaker}</span>
          <button className="bubble" onClick={toggle} aria-expanded={open}>{beat.text}</button>
          {tools}
        </div>
      </div>
    );
  }
  return (
    <div className={cls} style={{ ...style, '--who': character?.color }}>
      <button className="prose" onClick={toggle} aria-expanded={open}>{beat.text}</button>
      {tools}
    </div>
  );
}

const USER_LABEL = { direct: 'You directed', continue: 'You directed', chapter: 'New chapter', ending: 'Your ending' };

export function Scene({ turn, characters, fresh, chapterHeading, onRetry, onDelete, onSaveBeat, onDeleteBeat }) {
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
      {turn.beats.map((beat, i) => (
        <Beat
          key={beat._id}
          beat={beat}
          character={byId.get(beat.character)}
          fresh={fresh}
          delay={Math.min(i * 140, 1800)}
          onSave={(text) => onSaveBeat(turn, beat, text)}
          onDelete={() => onDeleteBeat(turn, beat)}
        />
      ))}
      <div className="scene-tools">
        <button onClick={() => onRetry(turn)}>Try again</button>
        {turn.mode !== 'opening' && <button onClick={() => onDelete(turn)}>Delete scene</button>}
      </div>
    </article>
  );
}
