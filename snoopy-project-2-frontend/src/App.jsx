// Archivo: src/App.jsx
// Propósito: definir las rutas principales del frontend sin cierre automático por inactividad.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import CashBoxes from './pages/CashBoxes.jsx';
import Balances from './pages/Balances.jsx';
import { CashBoxProvider } from './context/CashBoxContext.jsx';

function App() {
  return (
    <BrowserRouter>
      <CashBoxProvider>
        <Routes>
        <Route path="/" element={<Navigate to="/inicio" replace />} />

        <Route path="/login" element={<Login />} />
        <Route path="/inicio" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cajas" element={<Navigate to="/configuracion/cajas" replace />} />
        <Route path="/configuracion/cajas" element={<CashBoxes />} />
        <Route path="/balanza" element={<Balances />} />

        {/* Rutas separadas para reportes desde el menú desplegable del header */}
        <Route path="/reports" element={<Navigate to="/reports/ingresos" replace />} />
        <Route path="/reports/ingresos" element={<Reports reportType="ingreso" />} />
        <Route path="/reports/egresos" element={<Reports reportType="egreso" />} />
        <Route path="/reports/cancelados" element={<Reports reportType="cancelado" />} />

        <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </CashBoxProvider>
    </BrowserRouter>
  );
}

export default App;
