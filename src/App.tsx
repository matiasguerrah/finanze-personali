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
import { BudgetsPage } from './features/budgets/BudgetsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { AlertWatcher } from './state/AlertWatcher';

export default function App() {
  return (
    <ScopeFilterProvider>
      <ToastProvider>
        <AlertWatcher />
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
                <Route path="altro/soglie" element={<BudgetsPage />} />
                <Route path="altro/profilo" element={<ProfilePage />} />
              </Route>
            </Routes>
          </HashRouter>
        </EntryProvider>
      </ToastProvider>
    </ScopeFilterProvider>
  );
}
