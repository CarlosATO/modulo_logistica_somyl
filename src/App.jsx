import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';

// --- COMPONENTES VISUALES ---
import WMSTopBar from './components/WMSTopBar';
import Sidebar from './components/layout/Sidebar';

// --- VISTAS DE GESTIÓN (Desde carpeta pages) ---
import InventoryDashboard from './pages/InventoryDashboard';
import ProductList from './pages/ProductList';
import InboundReception from './pages/InboundReception';
import OutboundDispatch from './pages/OutboundDispatch';
import ProjectSettings from './pages/ProjectSettings';
import SupplierSettings from './pages/SupplierSettings';
import WarehouseSettings from './pages/WarehouseSettings'; // ✅ Singular (Corregido)
import InventoryViewer from './pages/InventoryViewer';
import PutAway from './pages/PutAway';
import LocationSettings from './pages/LocationSettings';
import TransferMaterial from './pages/TransferMaterial';
import DirectInboundList from './pages/DirectInboundList';
import InventoryAdjustments from './pages/InventoryAdjustments';
import PendingRequests from './pages/PendingRequests';

// --- REPORTES (Desde raíz src, según tu foto) ---
import InventoryReport from './InventoryReport'; // ✅ Importado desde raíz src/

// --- CAPTURADOR DE SESIÓN DEL PORTAL ---
// Este componente invisible lee el token de la URL si viene del portal
const SSOHandler = () => {
  const { signInWithToken } = useAuth(); // Asumiendo que tu AuthContext tiene esto, o similar
  const navigate = useNavigate();

  useEffect(() => {
    // Buscar token en la URL (Ej: logistica.somyl.cl?token=eyJ...)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      // Guardamos el token manualmente para que AuthContext lo detecte
      localStorage.setItem('supabase.auth.token', token); // O el nombre de key que uses
      localStorage.setItem('sso_token', token);

      // Limpiamos la URL para que no se vea feo
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  return null; // No renderiza nada visual
};

// --- LAYOUT CON SIDEBAR + BARRA SUPERIOR ---
const GestionLayout = () => {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">Cargando Sistema...</p>
      </div>
    </div>
  );

  // Si no hay usuario, mostramos mensaje de acceso denegado (Modo Satélite)
  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Restringido</h1>
        <p className="text-slate-500 mb-6">Por favor ingresa desde el Portal Central.</p>
        <a href="http://localhost:5173" className="text-indigo-600 font-bold hover:underline">Volver al Portal</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main Content Area */}
      <div className="lg:ml-64 transition-all duration-300">
        {/* Top Bar */}
        <WMSTopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

        {/* Page Content */}
        <main className="p-4 md:p-6 max-w-7xl mx-auto animate-in fade-in duration-300">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" richColors expand={true} />
      <SSOHandler /> {/* Captura el token antes de renderizar rutas */}
      <Routes>

        {/* Redirección: Al entrar a la raíz, vamos directo a gestión (Dashboard) */}
        <Route path="/" element={<Navigate to="/gestion" replace />} />

        {/* RUTAS DEL SISTEMA */}
        <Route path="/gestion" element={<GestionLayout />}>

          {/* 1. Dashboard Principal (Pantalla de Iconos) */}
          <Route index element={<InventoryDashboard />} />

          {/* 2. Operaciones */}
          <Route path="ingreso" element={<InboundReception />} />
          <Route path="salida" element={<OutboundDispatch />} />
          <Route path="orden" element={<PutAway />} />
          <Route path="ordenar" element={<PutAway />} /> {/* Alias por seguridad */}
          <Route path="solicitudes" element={<PendingRequests />} />

          <Route path="ubicaciones" element={<LocationSettings />} />
          <Route path="inventario" element={<InventoryViewer />} />
          <Route path="visor" element={<InventoryViewer />} />

          <Route path="traspasos" element={<TransferMaterial />} />
          <Route path="catalogo" element={<ProductList />} />
          <Route path="ajustes" element={<InventoryAdjustments />} />
          <Route path="historial-ingresos" element={<DirectInboundList />} />

          {/* 3. Mantenedores */}
          <Route path="bodegas" element={<WarehouseSettings />} />
          <Route path="proveedores" element={<SupplierSettings />} />
          <Route path="proyectos" element={<ProjectSettings />} />

          {/* 4. Reportes */}
          <Route path="reportes" element={<InventoryReport />} />

        </Route>

        {/* Cualquier ruta rota vuelve al Dashboard */}
        <Route path="*" element={<Navigate to="/gestion" replace />} />

      </Routes>
    </AuthProvider>
  );
}