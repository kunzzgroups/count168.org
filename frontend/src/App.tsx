import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import { protectedPlaceholderRoutes } from '@/config/legacyModuleRegistry'
import AccountListPage from '@/pages/AccountListPage'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import MemberPage from '@/pages/MemberPage'
import ModuleMigrationPlaceholderPage from '@/pages/ModuleMigrationPlaceholderPage'
import ProcessListPage from '@/pages/ProcessListPage'
import ResetPasswordPlaceholderPage from '@/pages/ResetPasswordPlaceholderPage'
import SystemModulesPage from '@/pages/SystemModulesPage'
import TransactionPage from '@/pages/TransactionPage'
import UserListPage from '@/pages/UserListPage'

const adminRoles = ['owner', 'admin', 'manager'] as const

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPlaceholderPage />} />
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
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <SystemModulesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/transaction"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <TransactionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/account-list"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <AccountListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/member"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <MemberPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/process-list"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <ProcessListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/user-list"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <UserListPage />
          </ProtectedRoute>
        }
      />
      {protectedPlaceholderRoutes.map(({ path, i18nKey }) => (
        <Route
          key={path}
          path={path}
          element={
            <ProtectedRoute allowedRoles={[...adminRoles]}>
              <ModuleMigrationPlaceholderPage i18nKey={i18nKey} />
            </ProtectedRoute>
          }
        />
      ))}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
