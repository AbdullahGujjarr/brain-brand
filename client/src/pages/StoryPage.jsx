import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Composer from '../components/Composer.jsx';
import { CastList, CharacterSheet, GroupSheet } from '../components/Cast.jsx';
import { Scene } from '../components/Scene.jsx';
import { Confirm, Sheet } from '../components/ui.jsx';
import { FREEDOM } from './NewStory.jsx';

const LENGTHS = [['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']];

export default function StoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const base = `/stories/${id}`;

  const [story, setStory] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [turns, setTurns] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [text, setText] = useState('');
  const [speakerId, setSpeakerId] = useState('');
  const [retry, setRetry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [freshId, setFreshId] = useState(null);

  // One of: cast, settings, group, character (with .character), confirm (with fields).
  const [panel, setPanel] = useState(null);
  const feed = useRef(null);
  const scrollTarget = useRef('bottom');

  useEffect(() => {
    api.get(base)
      .then((d) => {
        // A brand-new story is read from the top; a longer one resumes at the end.
        scrollTarget.current = d.turns.length === 1 ? d.turns[0]._id : 'bottom';
        setStory(d.story);
        setCharacters(d.characters);
        setTurns(d.turns);
        setHasMore(d.hasMore);
      })
      .catch((e) => (e.status === 404 ? navigate('/', { replace: true }) : setLoadError(e.message)));
  }, [base, navigate]);

  useLayoutEffect(() => {
    const el = feed.current;
    if (!el || !scrollTarget.current) return;
    if (scrollTarget.current === 'bottom') {
      el.scrollTop = el.scrollHeight;
    } else {
      el.querySelector(`[data-turn="${scrollTarget.current}"]`)?.scrollIntoView({ block: 'start' });
    }
    scrollTarget.current = null;
  }, [turns, busy, story]);

  const attempt = useCallback(async (work) => {
    setError('');
    try {
      await work();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  /** Runs an AI request. The text stays in the box until a scene really arrives. */
  async function write(request, keepBelow) {
    setBusy(true);
    setPanel(null);
    scrollTarget.current = 'bottom';
    const ok = await attempt(async () => {
      const res = await request();
      setStory(res.story);
      setCharacters(res.characters);
      setTurns((prev) => [...prev.filter((t) => keepBelow === undefined || t.index < keepBelow), res.turn]);
      setFreshId(res.turn._id);
      scrollTarget.current = res.turn._id;
    });
    setBusy(false);
    return ok;
  }

  async function send() {
    const body = { input: text };
    if (retry) {
      const ok = await write(() => api.post(`${base}/turns/${retry._id}/retry`, body), retry.index);
      if (ok) {
        setRetry(null);
        setText('');
      }
      return;
    }
    if (speakerId) body.speakerId = speakerId;
    if (await write(() => api.post(`${base}/turns`, body))) setText('');
  }

  const laterCount = (turn) => (story?.nextIndex ?? 0) - turn.index - 1;
  const scenesAfter = (n) => (n === 1 ? 'the scene' : `the ${n} scenes`);

  function startRetry(turn) {
    const begin = () => {
      setPanel(null);
      setRetry(turn);
      setText(turn.input);
      setSpeakerId('');
    };
    const later = laterCount(turn);
    if (!later) {
      begin();
      return;
    }
    setPanel({
      type: 'confirm',
      title: 'Go back to this scene?',
      message: `Trying again here also removes ${scenesAfter(later)} after it.`,
      action: 'Go back',
      onConfirm: begin,
    });
  }

  function deleteScene(turn) {
    const later = laterCount(turn);
    setPanel({
      type: 'confirm',
      title: 'Delete this scene?',
      message: later
        ? `This also removes ${scenesAfter(later)} after it, and any characters they added.`
        : 'Any characters it added are removed too.',
      action: 'Delete',
      onConfirm: async () => {
        setPanel(null);
        await attempt(async () => {
          const res = await api.del(`${base}/turns/${turn._id}`);
          setStory(res.story);
          setCharacters(res.characters);
          setTurns((prev) => prev.filter((t) => t.index < res.removedFrom));
          setText(turn.input);
        });
      },
    });
  }

  const replaceTurn = (updated) => setTurns((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));

  const saveBeat = (turn, beat, value) =>
    attempt(async () => replaceTurn((await api.patch(`${base}/turns/${turn._id}/beats/${beat._id}`, { text: value })).turn));

  const deleteBeat = (turn, beat) =>
    attempt(async () => replaceTurn((await api.del(`${base}/turns/${turn._id}/beats/${beat._id}`)).turn));

  async function loadEarlier() {
    await attempt(async () => {
      const first = turns[0];
      const res = await api.get(`${base}?before=${first.index}`);
      setTurns([...res.turns, ...turns]);
      setHasMore(res.hasMore);
      scrollTarget.current = first._id;
    });
  }

  const saveSettings = (patch) => attempt(async () => setStory((await api.patch(base, patch)).story));
  const newChapter = (title, input) => write(() => api.post(`${base}/chapters`, { title, input }));
  const endStory = (input) => write(() => api.post(`${base}/end`, { input }));
  const reopen = () => attempt(async () => setStory((await api.post(`${base}/reopen`)).story));

  const deleteStory = () =>
    setPanel({
      type: 'confirm',
      title: 'Delete this story?',
      message: 'The whole story and its cast are deleted. This cannot be undone.',
      action: 'Delete story',
      onConfirm: () =>
        attempt(async () => {
          await api.del(base);
          navigate('/', { replace: true });
        }),
    });

  if (loadError) {
    return (
      <div className="page">
        <p className="form-error">{loadError}</p>
        <Link className="link" to="/">Back to your stories</Link>
      </div>
    );
  }
  if (!story) return <div className="splash">Opening your story…</div>;

  const last = turns.at(-1);
  const ended = story.status === 'ended';
  const castProps = {
    characters,
    onOpen: (character) => setPanel({ type: 'character', character }),
    onAdd: () => setPanel({ type: 'character', character: null }),
    onGroup: () => setPanel({ type: 'group' }),
  };

  return (
    <div className="story-page">
      <header className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back to your stories">‹</Link>
        <div className="topbar-title">
          <h1>{story.title}</h1>
          <span>Chapter {story.chapter}{ended ? ' · Ended' : ''}</span>
        </div>
        <button className="btn small cast-toggle" onClick={() => setPanel({ type: 'cast' })}>Cast {characters.length}</button>
        <button className="btn small" onClick={() => setPanel({ type: 'settings' })}>Story</button>
      </header>

      <div className="story-layout">
        <div className="story-main">
          <main className="feed" ref={feed}>
            <div className="feed-inner">
              {hasMore && <button className="btn small load-more" onClick={loadEarlier}>Load earlier scenes</button>}
              {turns.map((turn, i) => {
                const startsChapter = i > 0 ? turns[i - 1].chapter !== turn.chapter : !hasMore;
                const title = story.chapterTitles?.[turn.chapter - 1];
                return (
                  <div key={turn._id} data-turn={turn._id}>
                    <Scene
                      turn={turn}
                      characters={characters}
                      fresh={turn._id === freshId}
                      chapterHeading={startsChapter ? `Chapter ${turn.chapter}${title ? `: ${title}` : ''}` : ''}
                      onRetry={startRetry}
                      onDelete={deleteScene}
                      onSaveBeat={saveBeat}
                      onDeleteBeat={deleteBeat}
                    />
                  </div>
                );
              })}
              {!busy && !retry && !ended && last?.suggestions?.length > 0 && (
                <section className="next-ideas" aria-label="Ideas for what happens next">
                  <h3>What happens next?</h3>
                  {last.suggestions.map((idea) => (
                    <button key={idea} className={text === idea ? 'on' : ''} onClick={() => setText(idea)}>{idea}</button>
                  ))}
                </section>
              )}
              {busy && (
                <div className="writing" role="status">
                  <span className="dots"><i /><i /><i /></span> The cast is writing the scene…
                </div>
              )}
            </div>
          </main>

          {error && (
            <div className="toast" role="alert">
              {error}
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setError('')}>×</button>
            </div>
          )}

          {ended && !retry ? (
            <div className="ended-bar">
              <span>The end.</span>
              <button className="btn small" onClick={reopen}>Continue this story</button>
            </div>
          ) : (
            <Composer
              text={text}
              setText={setText}
              speakerId={speakerId}
              setSpeakerId={setSpeakerId}
              characters={characters}
              busy={busy}
              retry={retry}
              onCancelRetry={() => {
                setRetry(null);
                setText('');
              }}
              onSend={send}
            />
          )}
        </div>

        <aside className="cast-panel" aria-label="Cast">
          <h2>Cast</h2>
          <CastList {...castProps} />
        </aside>
      </div>

      {panel?.type === 'cast' && (
        <Sheet title="Cast" onClose={() => setPanel(null)}>
          <CastList {...castProps} />
        </Sheet>
      )}
      {panel?.type === 'character' && (
        <CharacterSheet
          key={panel.character?._id ?? 'new'}
          storyId={id}
          character={panel.character && characters.find((c) => c._id === panel.character._id)}
          characters={characters}
          onSaved={setCharacters}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.type === 'group' && (
        <GroupSheet storyId={id} characters={characters} onSaved={setCharacters} onClose={() => setPanel(null)} />
      )}
      {panel?.type === 'settings' && (
        <StorySettings
          story={story}
          busy={busy}
          onSave={saveSettings}
          onNewChapter={newChapter}
          onEnd={endStory}
          onDelete={deleteStory}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.type === 'confirm' && <Confirm {...panel} onClose={() => setPanel(null)} />}
    </div>
  );
}

function StorySettings({ story, busy, onSave, onNewChapter, onEnd, onDelete, onClose }) {
  const [title, setTitle] = useState(story.title);
  const [chapterTitle, setChapterTitle] = useState('');
  const [note, setNote] = useState('');
  const ended = story.status === 'ended';

  return (
    <Sheet title="Story" onClose={onClose}>
      <div className="char-form">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== story.title && onSave({ title })}
          />
        </label>
        <div className="field">
          <span>How much can the AI add?</span>
          <div className="segmented">
            {FREEDOM.map(([value, label]) => (
              <button key={value} className={story.freedom === value ? 'on' : ''} onClick={() => onSave({ freedom: value })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Scene length</span>
          <div className="segmented">
            {LENGTHS.map(([value, label]) => (
              <button key={value} className={story.length === value ? 'on' : ''} onClick={() => onSave({ length: value })}>{label}</button>
            ))}
          </div>
        </div>

        {!ended && (
          <div className="field divider">
            <span>What happens next?</span>
            <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} placeholder="Chapter title (optional)" aria-label="Chapter title" />
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your idea for the new chapter or ending (optional)" aria-label="Idea for the chapter or ending" />
            <div className="two">
              <button className="btn" disabled={busy} onClick={() => onNewChapter(chapterTitle, note)}>Start new chapter</button>
              <button className="btn" disabled={busy} onClick={() => onEnd(note)}>End the story</button>
            </div>
          </div>
        )}
        <div className="sheet-actions">
          <button className="btn danger-text" onClick={onDelete}>Delete story</button>
        </div>
      </div>
    </Sheet>
  );
}
