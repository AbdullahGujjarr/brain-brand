import { ALIGNMENTS, bondName, rankOf, tierOf } from '../game.js';
import { Avatar, Sheet } from './ui.jsx';

function Meter({ label, value, display, center = false }) {
  const width = center ? Math.abs(value) / 2 : value;
  const left = center ? (value >= 0 ? 50 : 50 - width) : 0;
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><strong>{display ?? value}</strong></div>
      <div className={`meter-track${center ? ' center' : ''}`}>
        <span className={value < 0 ? 'bad' : ''} style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
    </div>
  );
}

function Fact({ label, children }) {
  if (!children) return null;
  return <p className="fact"><span>{label}</span>{children}</p>;
}

function SecretRow({ character }) {
  if (character.secretRevealed && character.secret) {
    return <p className="secret open"><span>Revealed secret</span>{character.secret}</p>;
  }
  if (character.hasSecret && character.secret) {
    return <p className="secret"><span>Your secret for them</span>{character.secret}</p>;
  }
  if (character.hasSecret) {
    return <p className="secret"><span>🔒 Secret</span>They are hiding something. The story will decide when it comes out.</p>;
  }
  return null;
}

export function ProfileSheet({ character, characters, onOpen, onEdit, onClose }) {
  const rank = rankOf(characters, character);
  const tier = tierOf(character);
  const hidden = character.power === undefined;
  const bonds = character.relationships
    .map((r) => ({ ...r, other: characters.find((c) => c._id === r.target) }))
    .filter((r) => r.other)
    .sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0));

  return (
    <Sheet title="Character file" onClose={onClose}>
      <div className="profile">
        <div className="profile-head">
          <Avatar character={character} size={72} />
          <div>
            <h3>{character.name}</h3>
            {character.title && <p className="profile-title">{character.title}</p>}
            <div className="chips-row">
              {rank > 0 && <span className="stat-chip strong">#{rank}</span>}
              <span className={`stat-chip tier-${tier.key}`}>{tier.label}</span>
              <span className={`stat-chip align-${character.alignment}`}>{ALIGNMENTS[character.alignment]}</span>
              {character.status !== 'active' && <span className="stat-chip warn">{character.status}</span>}
            </div>
          </div>
        </div>

        <div className="profile-stats">
          <Meter label="Power" value={hidden ? 0 : character.power} display={hidden ? '???' : undefined} />
          <Meter label="Reputation" value={character.reputation} center />
          <div className="tally">
            <div><strong>{character.kills}</strong><span>Kills</span></div>
            <div><strong>{character.villainsSlain}</strong><span>Villains slain</span></div>
            <div><strong>{character.faction || 'None'}</strong><span>Group</span></div>
          </div>
        </div>

        <SecretRow character={character} />

        <section>
          <h4>Who they are</h4>
          <Fact label="Role">{character.role}</Fact>
          <Fact label="Wants">{character.motive}</Fact>
          <Fact label="Personality">{character.personality}</Fact>
          <Fact label="Voice">{character.voice}</Fact>
          <Fact label="Looks">{character.description}</Fact>
        </section>

        <section>
          <h4>Relationships</h4>
          {!bonds.length && <p className="muted">No bonds yet.</p>}
          {bonds.map(({ other, type, label, score = 0 }) => (
            <div className="bond-row" key={other._id}>
              <Avatar character={other} size={34} onClick={() => onOpen(other)} />
              <div className="bond-info">
                <div className="bond-top">
                  <strong>{other.name}</strong>
                  <span className={`stat-chip bond-${type}`}>{bondName(type)}</span>
                </div>
                {label && <small>{label}</small>}
                <div className="meter-track center small">
                  <span
                    className={score < 0 ? 'bad' : ''}
                    style={{ left: `${score >= 0 ? 50 : 50 - Math.abs(score) / 2}%`, width: `${Math.abs(score) / 2}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </section>

        {character.history?.length > 0 && (
          <section>
            <h4>Their record</h4>
            <ol className="record">
              {[...character.history].reverse().map((h, i) => (
                <li key={i}><span>Ch {h.chapter}</span>{h.text}</li>
              ))}
            </ol>
          </section>
        )}

        <div className="sheet-actions">
          <button className="btn" onClick={onEdit}>Edit character</button>
        </div>
      </div>
    </Sheet>
  );
}
