import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { Snackbar } from './components/overlay';
import { AppShell } from './components/shell';
import { Home } from './screens/Home';
import { ItemDetail } from './screens/ItemDetail';
import { Shopping } from './screens/Shopping';
import { Charts } from './screens/Charts';
import { TaskDetail } from './screens/TaskDetail';
import { Tasks } from './screens/Tasks';
import { SheetHost } from './sheets/SheetHost';

/** New screens start at the top; going back keeps the browser's restored scroll position. */
function ScrollOnNavigate() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}

export default function App() {
  return (
    <AppShell>
      <ScrollOnNavigate />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/spending" element={<Navigate to="/charts" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SheetHost />
      <Snackbar />
    </AppShell>
  );
}
