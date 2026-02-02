import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserCircle, Box, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function WMSTopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Títulos según la ruta
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/gestion': return 'Panel de Control';
      case '/gestion/catalogo': return 'Catálogo de Materiales';
      case '/gestion/ingreso': return 'Registro de Ingreso (Recepción)';
      case '/gestion/historial-ingresos': return 'Historial de Ingresos Directos';
      case '/gestion/salida': return 'Registro de Salida (Despacho)';
      case '/gestion/solicitudes': return 'Despacho Solicitudes RRHH';
      case '/gestion/orden': return 'Orden de Bodega (Put Away)';
      case '/gestion/kardex': return 'Movimientos y Kardex';
      case '/gestion/bodegas': return 'Mantenedor de Bodegas';
      case '/gestion/proyectos': return 'Gestión de Proyectos';
      case '/gestion/proveedores': return 'Directorio de Proveedores';
      default: return 'Gestión Logística';
    }
  };

  // Lógica inteligente de retorno
  const handleBack = () => {
    if (location.pathname === '/gestion') {
      // Si ya estamos en el Dashboard, salimos al menú principal (Reportes/Gestión)
      navigate('/');
    } else {
      // Si estamos en cualquier otra pantalla interna, volvemos al Dashboard
      navigate('/gestion');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 sticky top-0 z-20 shadow-sm font-sans">

      {/* ZONA IZQUIERDA: Navegación */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleBack}
          className="text-slate-400 hover:text-slate-800 hover:bg-slate-100 p-2 rounded-full transition-colors"
          title={location.pathname === '/gestion' ? "Salir al Menú Principal" : "Volver al Panel"}
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 font-medium flex items-center gap-1">
            <Box size={16} className="text-orange-600" /> Logística
          </span>
          <ChevronRight size={16} className="text-slate-300" />
          <h1 className="text-slate-800 font-bold text-base truncate">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* ZONA DERECHA: Perfil */}
      <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
        <div className="text-right hidden md:block">
          <p className="text-sm font-bold text-slate-700 leading-tight">{user?.user_metadata?.full_name || 'Usuario'}</p>
          <p className="text-xs text-slate-400 font-medium truncate max-w-[150px]">{user?.email || ''}</p>
        </div>
        <div className="bg-slate-100 p-2 rounded-full text-slate-600 border border-slate-200">
          <UserCircle size={24} />
        </div>
      </div>
    </header>
  );
}