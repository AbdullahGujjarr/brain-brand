import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

function GoogleButton({ onError }) {
  const { setUser } = useAuth();
  const box = useRef(null);
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    api.get('/auth/config').then((d) => setClientId(d.googleClientId)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const render = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try {
            const { user } = await api.post('/auth/google', { credential });
            setUser(user);
          } catch (err) {
            onError(err.message);
          }
        },
      });
      window.google.accounts.id.renderButton(box.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: Math.min(box.current.offsetWidth || 320, 400),
      });
    };
    if (window.google?.accounts) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [clientId]);

  if (!clientId) return null;
  return (
    <>
      <div ref={box} className="google-box" />
      <div className="or"><span>or</span></div>
    </>
  );
}

export default function AuthPage() {
  const { setUser } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.post(`/auth/${mode}`, form);
      setUser(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-intro">
        <img src="/icon.svg" alt="" width="52" height="52" />
        <h1>Brain Brand</h1>
        <p>You write a few lines. A whole cast answers, argues, fights and surprises you.</p>
      </section>
      <section className="auth-card">
        <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
        <GoogleButton onError={setError} />
        <form onSubmit={submit}>
          {isRegister && (
            <label>
              Name
              <input value={form.name} onChange={set('name')} autoComplete="name" required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={isRegister ? 8 : undefined}
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="switch">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button
            className="link"
            onClick={() => {
              setMode(isRegister ? 'login' : 'register');
              setError('');
            }}
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </section>
    </div>
  );
}
