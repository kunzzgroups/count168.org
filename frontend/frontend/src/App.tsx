import { Route, Routes } from 'react-router-dom'
import { RootLayout } from '@/layouts/RootLayout'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { CaptureMaintenancePage } from '@/pages/CaptureMaintenancePage'
import { DataCaptureSummaryPage } from '@/pages/DataCaptureSummaryPage'
import { StockPage } from '@/pages/StockPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<RootLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/capture-maintenance" element={<CaptureMaintenancePage />} />
        <Route
          path="/datacapture-summary"
          element={<DataCaptureSummaryPage />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
