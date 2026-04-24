import { Navigate, Route, Routes } from 'react-router-dom'
import { DashboardPage } from './pages/DashboardPage'
import { DataCapturePage } from './pages/DataCapturePage'
import { DataCaptureSummaryPage } from './pages/DataCaptureSummaryPage'
import { AccountListPage } from './pages/AccountListPage'
import { ProcessListPage } from './pages/ProcessListPage'
import { TransactionPage } from './pages/TransactionPage'
import { LoginPage } from './pages/LoginPage'
import { OwnerSecondaryPasswordPage } from './pages/OwnerSecondaryPasswordPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route
        path="/owner-secondary-password"
        element={<OwnerSecondaryPasswordPage />}
      />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/datacapture" element={<DataCapturePage />} />
      <Route path="/datacapturesummary" element={<DataCaptureSummaryPage />} />
      <Route path="/accounts" element={<AccountListPage />} />
      <Route path="/processlist" element={<ProcessListPage />} />
      <Route path="/transaction" element={<TransactionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
