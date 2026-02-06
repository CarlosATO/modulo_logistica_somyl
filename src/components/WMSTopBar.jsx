import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserCircle, Box, ChevronRight, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function WMSTopBar({ onMenuClick }) {
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
      case '/gestion/visor': return 'Visor de Inventario';
      case '/gestion/traspasos': return 'Traspasos entre Bodegas';
      case '/gestion/ajustes': return 'Ajustes de Inventario';
      case '/gestion/ubicaciones': return 'Mapa de Ubicaciones';
      case '/gestion/reportes': return 'Reportes Financieros';
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
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-sm font-sans">

      {/* ZONA IZQUIERDA: Navegación */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Hamburger Menu (Mobile Only) */}
        <button
          onClick={onMenuClick}
          className="lg:hidden text-slate-600 hover:text-slate-800 hover:bg-slate-100 p-2 rounded-xl transition-colors"
          title="Abrir menú"
        >
          <Menu size={22} />
        </button>



        <div className="flex items-center gap-2 text-sm">
          <span className="hidden md:flex text-slate-500 font-medium items-center gap-1">
            <Box size={16} className="text-indigo-600" /> Logística
          </span>
          <ChevronRight size={16} className="hidden md:block text-slate-300" />
          <h1 className="text-slate-800 font-bold text-base truncate max-w-[200px] md:max-w-none">
            {getPageTitle()}
          </h1>
        </div>
      </div>

      {/* ZONA DERECHA: Perfil */}
      <div className="flex items-center gap-3 pl-4 md:pl-6 border-l border-slate-100">
        <div className="text-right hidden md:block">
          <p className="text-sm font-bold text-slate-700 leading-tight">{user?.user_metadata?.full_name || 'Usuario'}</p>
          <p className="text-xs text-slate-400 font-medium truncate max-w-[150px]">{user?.email || ''}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-100 to-purple-100 p-2 rounded-full text-indigo-600 border border-indigo-200">
          <UserCircle size={24} />
        </div>
      </div>
    </header>
  );
}