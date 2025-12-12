import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// --- Contexto ---
import { AuthProvider } from './context/AuthContext';

// --- Vistas del Portal ---
import LogisticaHome from './LogisticaHome';
import ReportesMenu from './ReportesMenu';
import InventoryReport from './InventoryReport';

// --- VISTAS DE GESTIÓN (WMS) ---
import InventoryDashboard from './pages/InventoryDashboard';
import ProductList from './pages/ProductList';      // Catálogo
import InboundReception from './pages/InboundReception'; // Ingreso
import OutboundDispatch from './pages/OutboundDispatch'; // Salida
import ProjectSettings from './pages/ProjectSettings';   // Proyectos
import SupplierSettings from './pages/SupplierSettings'; // Proveedores
import WarehouseSettings from './pages/WarehouseSettings'; // Bodega
import InventoryView from './pages/InventoryView';       // Movimientos/Kardex
import PutAway from './pages/PutAway';                   // Orden de Bodega

// --- TopBar ---
import WMSTopBar from './components/WMSTopBar';

// Layout Limpio
const GestionLayout = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <WMSTopBar />
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 relative animate-fade-in">
            {children}
      </main>
    </div>
  );
};

function App() {
  const [authorized, setAuthorized] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token'); 
    if (token) {
        localStorage.setItem('sso_token', token);
        window.history.replaceState({}, document.title, window.location.pathname); 
        setAuthorized(true);
    } else {
        const storedToken = localStorage.getItem('sso_token');
        if (storedToken) setAuthorized(true);
        else setAuthorized(false);
    }
  }, []);

  if (!authorized) return <div className="flex h-screen items-center justify-center">Acceso Restringido</div>;

  return (
    <AuthProvider>
      <Routes>
        {/* Portal y Reportes */}
        <Route path="/" element={<LogisticaHome onNavigate={(view) => {
            if (view === 'reports_menu') navigate('/reportes');
            if (view === 'gestion') navigate('/gestion');
        }} />} />
        <Route path="/reportes" element={<ReportesMenu onNavigate={(view) => {if (view === 'inventory_report') navigate('/reportes/cierre');}} onBack={() => navigate('/')} />} />
        <Route path="/reportes/cierre" element={<div className="p-4"><InventoryReport /></div>} />

        {/* --- RUTAS DE GESTIÓN LOGÍSTICA --- */}
        <Route path="/gestion" element={<GestionLayout><InventoryDashboard /></GestionLayout>} />
        
        {/* Operaciones Diarias */}
        <Route path="/gestion/catalogo" element={<GestionLayout><ProductList /></GestionLayout>} />
        <Route path="/gestion/ingreso" element={<GestionLayout><InboundReception /></GestionLayout>} />
        <Route path="/gestion/salida" element={<GestionLayout><OutboundDispatch /></GestionLayout>} />
        <Route path="/gestion/orden" element={<GestionLayout><PutAway /></GestionLayout>} />
        <Route path="/gestion/kardex" element={<GestionLayout><InventoryView /></GestionLayout>} />
        
        {/* Mantenedores */}
        <Route path="/gestion/bodegas" element={<GestionLayout><WarehouseSettings /></GestionLayout>} />
        <Route path="/gestion/proyectos" element={<GestionLayout><ProjectSettings /></GestionLayout>} />
        <Route path="/gestion/proveedores" element={<GestionLayout><SupplierSettings /></GestionLayout>} />
        
      </Routes>
    </AuthProvider>
  );
}

export default App;