import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { setBackButton } from './max.js';
import { ErrorState, Loader, Toast } from './ui.jsx';
import CheckScreen from './screens/CheckScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import ProfileScreen from './screens/ProfileScreen.jsx';
import ReportScreen from './screens/ReportScreen.jsx';
import TasksScreen from './screens/TasksScreen.jsx';

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([{ name: 'home' }]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  const screen = history[history.length - 1];

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, m] = await Promise.all([api.catalog(), api.me()]);
      setCatalog(c);
      setMe(m);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      setError(err);
    }
  }, []);

  const notify = useCallback((text, tone = 'info') => {
    clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const go = useCallback((next, { replace = false } = {}) => {
    setHistory((h) => (replace ? [...h.slice(0, -1), next] : [...h, next]));
    window.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));
    refresh();
  }, [refresh]);

  const home = useCallback(() => {
    setHistory([{ name: 'home' }]);
    refresh();
  }, [refresh]);

  // Системная кнопка «Назад» в MAX.
  useEffect(() => setBackButton(history.length > 1 ? back : null), [history.length, back]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!catalog || !me) return <Loader />;

  const props = { catalog, me, go, back, home, refresh, notify };
  let content;
  switch (screen.name) {
    case 'profile':
      content = <ProfileScreen {...props} />;
      break;
    case 'check':
      content = <CheckScreen {...props} />;
      break;
    case 'report':
      content = <ReportScreen {...props} checkId={screen.checkId} />;
      break;
    case 'tasks':
      content = <TasksScreen {...props} />;
      break;
    default:
      content = <HomeScreen {...props} />;
  }

  return (
    <>
      {content}
      <Toast toast={toast} />
    </>
  );
}
