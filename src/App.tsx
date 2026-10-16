import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import { Snackbar } from './components/overlay';
import { AppShell } from './components/shell';
import { OurWallet, MyWallet } from './screens/Shopping';
import { ItemDetail } from './screens/ItemDetail';
import { Charts } from './screens/Charts';
import { TaskDetail } from './screens/TaskDetail';
import { Tasks } from './screens/Tasks';
import { SettingsScreen } from './screens/SettingsScreen';
import { SheetHost } from './sheets/SheetHost';
import { initSyncAuth } from './lib/sync';

import type { FinanceScope, TxType } from './lib/types';
import { useStore } from './store';
import { openSheet } from './store/ui';

/** New screens start at the top; going back keeps the browser's restored scroll position. */
function ScrollOnNavigate() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}

function RootRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const action = searchParams.get('action');
  if (
    action === 'quick-add' ||
    action === 'new-transaction' ||
    searchParams.has('quick-add') ||
    searchParams.has('new') ||
    searchParams.has('amount') ||
    searchParams.has('note')
  ) {
    const scope = (searchParams.get('scope') as FinanceScope) || 'household';
    const target = scope === 'personal' ? '/my-wallet' : '/our-wallet';
    return <Navigate to={`${target}${location.search}`} replace />;
  }
  return <Navigate to="/tasks" replace />;
}

function QuickAddRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const scope = (searchParams.get('scope') as FinanceScope) || 'household';
  const target = scope === 'personal' ? '/my-wallet' : '/our-wallet';
  return <Navigate to={`${target}${location.search}`} replace />;
}

/** Parses iOS Shortcut / Deep link query parameters to trigger quick add transaction */
function QuickAddUrlListener() {
  const location = useLocation();

  useEffect(() => {
    try {
      const search = location.search;
      const params = new URLSearchParams(search);
      const pathname = location.pathname;

      const isQuickAddRoute = pathname === '/quick-add' || pathname === '/new-transaction' || pathname === '/scan';
      const action = params.get('action');
      const amountStr = params.get('amount');
      const note = params.get('note');
      const category = params.get('category');
      const type = (params.get('type') as TxType) || 'expense';
      const scope = (params.get('scope') as FinanceScope) || (pathname.includes('my-wallet') ? 'personal' : 'household');

      const shouldTrigger =
        isQuickAddRoute ||
        action === 'quick-add' ||
        action === 'new-transaction' ||
        params.has('quick-add') ||
        params.has('new') ||
        Boolean(amountStr) ||
        Boolean(note);

      if (shouldTrigger) {
        const amount = amountStr ? parseInt(amountStr.replace(/\D/g, ''), 10) : undefined;
        const categories = useStore.getState().moneyCategories;
        let matchedCatId: string | undefined = undefined;
        if (category) {
          const found = categories.find((c) => c.name.toLowerCase().includes(category.toLowerCase()));
          if (found) matchedCatId = found.id;
        }

        openSheet({
          type: 'transaction',
          txType: type,
          scope,
          initialValues: {
            amount: amount && !isNaN(amount) ? amount : undefined,
            note: note || undefined,
            categoryId: matchedCatId,
          },
        });

        // Clean query parameters from URL so refreshes don't re-trigger unnecessarily
        if (search) {
          window.history.replaceState({}, document.title, location.pathname);
        }
      }
    } catch (err) {
      console.warn('Failed to parse quick-add URL params:', err);
    }
  }, [location.pathname, location.search]);

  return null;
}

export default function App() {
  useEffect(() => {
    const unsub = initSyncAuth();
    return () => unsub();
  }, []);

  return (
    <AppShell>
      <ScrollOnNavigate />
      <QuickAddUrlListener />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/quick-add" element={<QuickAddRedirect />} />
        <Route path="/new-transaction" element={<QuickAddRedirect />} />
        <Route path="/scan" element={<QuickAddRedirect />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/our-wallet" element={<OurWallet />} />
        <Route path="/my-wallet" element={<MyWallet />} />
        <Route path="/shopping" element={<Navigate to="/our-wallet" replace />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/charts" element={<Charts />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/spending" element={<Navigate to="/charts" replace />} />
        <Route path="*" element={<Navigate to="/tasks" replace />} />
      </Routes>
      <SheetHost />
      <Snackbar />
    </AppShell>
  );
}
