import { HashRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ScopeFilterProvider } from './state/ScopeFilterProvider';
import { ToastProvider } from './state/ToastProvider';
import { EntryProvider } from './state/EntryProvider';
import { HomePage } from './features/home/HomePage';
import { TransactionsPage } from './features/transactions/TransactionsPage';
import { ActivitiesPage } from './features/activities/ActivitiesPage';
import { MorePage } from './features/more/MorePage';
import { ComingSoon } from './features/more/ComingSoon';
import { AccountsPage } from './features/accounts/AccountsPage';
import { RecurringPage } from './features/recurring/RecurringPage';

export default function App() {
  return (
    <ScopeFilterProvider>
      <ToastProvider>
        <EntryProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="movimenti" element={<TransactionsPage />} />
                <Route path="scadenze" element={<RecurringPage />} />
                <Route path="report" element={<ComingSoon what="Report e grafici" />} />
                <Route path="altro" element={<MorePage />} />
                <Route path="altro/attivita" element={<ActivitiesPage />} />
                <Route path="altro/conti" element={<AccountsPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </EntryProvider>
      </ToastProvider>
    </ScopeFilterProvider>
  );
}
