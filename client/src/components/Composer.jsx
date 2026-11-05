import { useEffect, useRef } from 'react';
import { Avatar } from './ui.jsx';

export default function Composer({ text, setText, speakerId, setSpeakerId, characters, suggestions, busy, retry, onCancelRetry, onSend }) {
  const box = useRef(null);
  const speaker = characters.find((c) => c._id === speakerId);

  useEffect(() => {
    const el = box.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (retry) box.current.focus();
  }, [retry]);

  const keyDown = (e) => {
    const hasKeyboard = window.matchMedia('(hover: hover)').matches;
    if (e.key === 'Enter' && !e.shiftKey && hasKeyboard) {
      e.preventDefault();
      if (!busy && !(speaker && !text.trim())) onSend();
    }
  };

  const placeholder = retry
    ? 'Change your direction'
    : speaker
      ? `${speaker.name} says or does…`
      : 'What happens next?';

  return (
    <div className="composer">
      {retry && (
        <div className="retry-note">
          <span>Writing this scene again</span>
          <button className="link" onClick={onCancelRetry}>Cancel</button>
        </div>
      )}
      {!retry && !busy && suggestions?.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => setText(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="composer-row">
        <label className="speaker-pick" title="Who are you writing as?">
          {speaker ? <Avatar character={speaker} size={30} /> : <span className="director" aria-hidden="true">✦</span>}
          <select
            aria-label="Write as"
            value={speakerId}
            disabled={Boolean(retry)}
            onChange={(e) => setSpeakerId(e.target.value)}
          >
            <option value="">Director (AI plays everyone)</option>
            {characters.filter((c) => c.status !== 'dead').map((c) => (
              <option key={c._id} value={c._id}>Speak as {c.name}</option>
            ))}
          </select>
        </label>
        <textarea
          ref={box}
          rows={1}
          value={text}
          maxLength={4000}
          placeholder={placeholder}
          aria-label="Your direction"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keyDown}
        />
        <button className="send" disabled={busy || Boolean(speaker && !text.trim())} onClick={onSend}>
          {retry ? 'Retry' : text.trim() ? 'Send' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
