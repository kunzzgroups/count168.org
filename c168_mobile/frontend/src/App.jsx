import { Navigate, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/dashboard/DashboardPage.jsx";
import LoginPage from "./pages/login/LoginPage.jsx";
import StubPage from "./pages/StubPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="/member" element={<StubPage title="会员 Win/Loss" backTo="/login" />} />
      <Route path="/report" element={<StubPage title="报表 Report" backTo="/dashboard" />} />
      <Route path="/transaction" element={<StubPage title="交易 Transaction" backTo="/dashboard" />} />
      <Route path="/more" element={<StubPage title="更多功能" backTo="/dashboard" />} />
      <Route path="/reset-password" element={<StubPage title="重置密码" />} />
      <Route
        path="/owner-secondary-password"
        element={<StubPage title="业主二级密码" backTo="/login" />}
      />
      <Route
        path="/user-secondary-password"
        element={<StubPage title="用户二级密码" backTo="/login" />}
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
