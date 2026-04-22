import { Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/ProtectedRoute'
import AccountListPage from '@/pages/AccountListPage'
import AnnouncementPage from '@/pages/AnnouncementPage'
import AutoMonthlyAccountingPage from '@/pages/AutoMonthlyAccountingPage'
import BankProcessListPage from '@/pages/BankProcessListPage'
import CustomerReportPage from '@/pages/CustomerReportPage'
import DashboardPage from '@/pages/DashboardPage'
import DataCapturePage from '@/pages/DataCapturePage'
import DataCaptureSummaryPage from '@/pages/DataCaptureSummaryPage'
import DomainPage from '@/pages/DomainPage'
import DomainReportPage from '@/pages/DomainReportPage'
import FormulaMaintenancePage from '@/pages/FormulaMaintenancePage'
import GamesProcessListPage from '@/pages/GamesProcessListPage'
import LoginPage from '@/pages/LoginPage'
import {
  BankprocessMaintenancePage,
  CaptureMaintenancePage,
  PaymentMaintenancePage,
  TransactionMaintenancePage,
} from '@/pages/MaintenancePages'
import MemberPage from '@/pages/MemberPage'
import OwnerSecondaryPasswordPage from '@/pages/OwnerSecondaryPasswordPage'
import OwnershipPage from '@/pages/OwnershipPage'
import ProcessListPage from '@/pages/ProcessListPage'
import ResetPasswordPlaceholderPage from '@/pages/ResetPasswordPlaceholderPage'
import SystemModulesPage from '@/pages/SystemModulesPage'
import TransactionPage from '@/pages/TransactionPage'
import UserAccessPage from '@/pages/UserAccessPage'
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
        path="/modules/announcement"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <AnnouncementPage />
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
      <Route
        path="/modules/user-access"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <UserAccessPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/customer-report"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <CustomerReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/domain-report"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <DomainReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/bank-process-list"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <BankProcessListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/bankprocess-maintenance"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <BankprocessMaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/capture-maintenance"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <CaptureMaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/datacapture"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <DataCapturePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/datacapture-summary"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <DataCaptureSummaryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/domain"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <DomainPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/formula-maintenance"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <FormulaMaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/games-process-list"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <GamesProcessListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/ownership"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <OwnershipPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/payment-maintenance"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <PaymentMaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/transaction-maintenance"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <TransactionMaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/auto-monthly-accounting"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <AutoMonthlyAccountingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/modules/owner-secondary-password"
        element={
          <ProtectedRoute allowedRoles={[...adminRoles]}>
            <OwnerSecondaryPasswordPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
