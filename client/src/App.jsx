import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import Library from './pages/Library.jsx';
import NewStory from './pages/NewStory.jsx';
import StoryPage from './pages/StoryPage.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  if (user === undefined) return <div className="splash">Brain Brand</div>;

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {user ? (
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<NewStory />} />
          <Route path="/story/:id" element={<StoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
        <AuthPage />
      )}
    </AuthContext.Provider>
  );
}
