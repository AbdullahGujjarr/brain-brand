import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

export default function Library() {
  const { user, setUser } = useAuth();
  const [stories, setStories] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stories').then((d) => setStories(d.stories)).catch((e) => setError(e.message));
  }, []);

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  return (
    <div className="page">
      <header className="lib-head">
        <div className="brand"><img src="/icon.svg" alt="" width="30" height="30" /> Brain Brand</div>
        <button className="link" onClick={logout}>Sign out</button>
      </header>

      <div className="lib-title">
        <div>
          <h1>Your stories</h1>
          <p className="muted">Welcome, {user.name.split(' ')[0]}.</p>
        </div>
        <Link className="btn primary" to="/new">New story</Link>
      </div>

      {error && <p className="form-error">{error}</p>}
      {stories === null && !error && <p className="muted">Loading…</p>}
      {stories?.length === 0 && (
        <div className="empty">
          <h2>Your first story starts with a few lines</h2>
          <p className="muted">Name some people, say what is happening, and the AI builds the scene.</p>
          <Link className="btn primary" to="/new">Start a story</Link>
        </div>
      )}
      <div className="story-grid">
        {stories?.map((s) => (
          <Link key={s._id} className="story-card" to={`/story/${s._id}`}>
            <h2>{s.title}</h2>
            <p>{s.premise}</p>
            <div className="meta">
              <span>Chapter {s.chapter}</span>
              <span>{s.castCount} {s.castCount === 1 ? 'character' : 'characters'}</span>
              {s.status === 'ended' && <span className="tag">Ended</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
