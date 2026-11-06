import { useEffect } from 'react';
import { Avatar } from './ui.jsx';

// The biggest thing that happened in a scene gets a moment on screen.
const PRIORITY = ['secret', 'level', 'rank', 'love', 'jealous', 'danger', 'respect', 'shield', 'title', 'kill', 'fall'];
const LABELS = {
  secret: 'Secret revealed',
  level: 'Level up',
  fall: 'Fallen',
  danger: 'Feared',
  respect: 'Respected',
  love: 'Love',
  jealous: 'Jealousy',
  shield: 'Protected',
  rank: 'New number one',
  kill: 'Kill',
  title: 'New title',
};

export function pickMoment(effects = [], characters = []) {
  for (const kind of PRIORITY) {
    const effect = effects.find((e) => e.kind === kind);
    if (effect) {
      return { ...effect, label: LABELS[kind], character: characters.find((c) => c.name === effect.who) };
    }
  }
  return null;
}

export default function Moment({ moment, onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3400);
    return () => clearTimeout(timer);
  }, [moment, onDone]);

  return (
    <button className={`moment moment-${moment.kind}`} onClick={onDone} role="status">
      <span className="moment-rays" aria-hidden="true" />
      {moment.character && <Avatar character={moment.character} size={84} />}
      <strong>{moment.label}</strong>
      <span>{moment.text}</span>
    </button>
  );
}
