import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { Snackbar } from './components/overlay';
import { AppShell } from './components/shell';
import { OurWallet, MyWallet } from './screens/Shopping';
import { Inventory } from './screens/Inventory';
import { ItemDetail } from './screens/ItemDetail';
import { TaskDetail } from './screens/TaskDetail';
import { Tasks } from './screens/Tasks';
import { SettingsScreen } from './screens/SettingsScreen';
import { SheetHost } from './sheets/SheetHost';
import { initSyncAuth } from './lib/sync';
import { startNotificationScheduler } from './lib/notificationScheduler';
import { ErrorBoundary } from './components/ErrorBoundary';

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
  useEffect(() => {
    const unsubAuth = initSyncAuth();
    const unsubScheduler = startNotificationScheduler();
    return () => {
      unsubAuth();
      unsubScheduler();
    };
  }, []);

  return (
    <ErrorBoundary>
      <AppShell>
        <ScrollOnNavigate />
        <Routes>
          <Route path="/" element={<Navigate to="/tasks" replace />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/our-wallet" element={<OurWallet />} />
          <Route path="/my-wallet" element={<MyWallet />} />
          <Route path="/shopping" element={<Navigate to="/our-wallet" replace />} />
          <Route path="/items/:id" element={<ItemDetail />} />
          <Route path="/charts" element={<Navigate to="/our-wallet?tab=chart" replace />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/spending" element={<Navigate to="/charts" replace />} />
          <Route path="/wallet" element={<Navigate to="/our-wallet" replace />} />
          <Route path="/finance" element={<Navigate to="/our-wallet" replace />} />
          <Route path="*" element={<Navigate to="/tasks" replace />} />
        </Routes>
        <ErrorBoundary>
          <SheetHost />
        </ErrorBoundary>
        <Snackbar />
      </AppShell>
    </ErrorBoundary>
  );
}
