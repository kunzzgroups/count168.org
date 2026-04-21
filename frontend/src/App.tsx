import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import AccountListPage from '@/pages/AccountListPage'
import SystemModulesPage from '@/pages/SystemModulesPage'
import MemberPage from '@/pages/MemberPage'
import ProcessListPage from '@/pages/ProcessListPage'
import TransactionPage from '@/pages/TransactionPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules"
        element={
          <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
            <SystemModulesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/transaction"
        element={
          <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
            <TransactionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/account-list"
        element={
          <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
            <AccountListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/member"
        element={
          <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
            <MemberPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/process-list"
        element={
          <ProtectedRoute allowedRoles={['owner', 'admin', 'manager']}>
            <ProcessListPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
