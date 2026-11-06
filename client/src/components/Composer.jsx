import { useEffect, useRef } from 'react';
import { Avatar } from './ui.jsx';

export default function Composer({ text, setText, speakerId, setSpeakerId, characters, busy, retry, onCancelRetry, onSend }) {
  const box = useRef(null);
  const speaker = characters.find((c) => c._id === speakerId);
  const hasText = Boolean(text.trim());
  const blocked = busy || Boolean(speaker && !hasText);

  useEffect(() => {
    const el = box.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    if (retry) box.current.focus();
  }, [retry]);

  const keyDown = (e) => {
    const hasKeyboard = window.matchMedia('(hover: hover)').matches;
    if (e.key === 'Enter' && !e.shiftKey && hasKeyboard) {
      e.preventDefault();
      if (!blocked) onSend();
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
      <div className="composer-box">
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
        <div className="composer-bar">
          <label className="speaker-pick">
            {speaker ? <Avatar character={speaker} size={22} /> : <span className="director" aria-hidden="true">✦</span>}
            <span className="speaker-name">{speaker ? speaker.name : 'Director'}</span>
            <span className="caret" aria-hidden="true">▾</span>
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
          <button
            className={`send${hasText || retry ? ' round' : ''}`}
            disabled={blocked}
            aria-label={retry ? 'Retry scene' : hasText ? 'Send' : 'Continue the story'}
            onClick={onSend}
          >
            {hasText || retry ? (
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
