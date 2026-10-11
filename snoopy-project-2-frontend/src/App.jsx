// Archivo: src/App.jsx
// Propósito: definir las rutas principales del frontend sin cierre automático por inactividad.
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import CashBoxes from './pages/CashBoxes.jsx';
import Users from './pages/Users.jsx';
import Roles from './pages/Roles.jsx';
import UpdatesGuide from './components/UpdatesGuide.jsx';
import { CashBoxProvider } from './context/CashBoxContext.jsx';
import { getCurrentProfile, isAuthenticated } from './utils/session.js';

function ProtectedRoute({ children }) {
  const location = useLocation();
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  const profile = getCurrentProfile();
  const isOnboardingGuide = location.pathname === '/inicio'
    && new URLSearchParams(location.search).get('guia') === '1';

  if (profile.onboarding_status === 'pendiente' && !isOnboardingGuide) {
    return <Navigate to="/inicio?guia=1" replace />;
  }
  return children;
}

function GlobalGuides() {
  const location = useLocation();
  const isUpdatesGuideOpen = isAuthenticated()
    && new URLSearchParams(location.search).get('novedades') === '1';

  return isUpdatesGuideOpen ? <UpdatesGuide /> : null;
}

function App() {
  return (
    <BrowserRouter>
      <CashBoxProvider>
        <GlobalGuides />
        <Routes>
        <Route path="/" element={<Navigate to="/inicio" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/activar-cuenta" element={<Navigate to="/inicio?guia=1" replace />} />
        <Route path="/inicio" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/cajas" element={<Navigate to="/configuracion/cajas" replace />} />
        <Route path="/configuracion/cajas" element={<ProtectedRoute><CashBoxes /></ProtectedRoute>} />
        <Route path="/configuracion/usuarios" element={<ProtectedRoute><Users /></ProtectedRoute>} />
        <Route path="/configuracion/perfiles" element={<ProtectedRoute><Roles /></ProtectedRoute>} />
        <Route path="/balanza" element={<Navigate to="/inicio" replace />} />

        {/* Rutas separadas para reportes desde el menú desplegable del header */}
        <Route path="/reports" element={<Navigate to="/reports/ingresos" replace />} />
        <Route path="/reports/ingresos" element={<ProtectedRoute><Reports reportType="ingreso" /></ProtectedRoute>} />
        <Route path="/reports/egresos" element={<ProtectedRoute><Reports reportType="egreso" /></ProtectedRoute>} />
        <Route path="/reports/cancelados" element={<ProtectedRoute><Reports reportType="cancelado" /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </CashBoxProvider>
    </BrowserRouter>
  );
}

export default App;
