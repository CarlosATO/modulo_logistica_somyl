import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, ArrowDownCircle, ArrowUpCircle, ClipboardList, 
  Settings, Truck, Warehouse, Box, Grid, Layers, ArrowRightLeft,
  FileText, History,
  FileBarChart, ArrowLeft // <--- Agregamos la flecha
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Función para volver al Portal Central
  const handleBackToPortal = () => {
    // Redirección absoluta fuera de la app usando variable de entorno
    // En desarrollo: http://localhost:5173
    // En producción: https://portalsomyl-production.up.railway.app
    const portalUrl = import.meta.env.VITE_PORTAL_URL || 'http://localhost:5173';
    window.location.href = portalUrl; 
  };

  // Configuración de los botones
  const modules = [
    { 
      title: "Registro de Ingreso", 
      desc: "Recepción de materiales", 
      path: "/gestion/ingreso", 
      icon: <ArrowDownCircle size={32} />, 
      color: "bg-emerald-50 text-emerald-600 border-emerald-100" 
    },
    { 
      title: "Lista de ingresos",
      desc: "Historial de ingresos directos",
      path: "/gestion/historial-ingresos",
      icon: <FileText size={32} />,
      color: "bg-emerald-50 text-emerald-600 border-emerald-100"
    },
    { 
      title: "Historial de Ingresos", 
      desc: "Consultar y editar recepciones", 
      path: "/gestion/historial-ingresos", 
      icon: <History size={32} />, 
      color: "bg-blue-50 text-blue-700 border-blue-200" 
    },
    { 
      title: "Registro de Salida", 
      desc: "Despacho a terreno", 
      path: "/gestion/salida", 
      icon: <ArrowUpCircle size={32} />, 
      color: "bg-orange-50 text-orange-600 border-orange-100" 
    },
    { 
      title: "Orden de Bodega", 
      desc: "Organizar y ubicar", 
      path: "/gestion/orden", 
      icon: <ClipboardList size={32} />, 
      color: "bg-blue-50 text-blue-600 border-blue-100" 
    },
    { 
      title: "Mapa / Ubicaciones", 
      desc: "Configurar Racks", 
      path: "/gestion/ubicaciones", 
      icon: <Grid size={32} />, 
      color: "bg-indigo-50 text-indigo-600 border-indigo-100" 
    },
    { 
      title: "Visor de Inventario", 
      desc: "Stock Real y Kardex", 
      path: "/gestion/visor", 
      icon: <Layers size={32} />, 
      color: "bg-emerald-50 text-emerald-600 border-emerald-200" 
    },
    { 
      title: "Traspasos", 
      desc: "Mover entre bodegas", 
      path: "/gestion/traspasos", 
      icon: <ArrowRightLeft size={32} />, 
      color: "bg-purple-50 text-purple-600 border-purple-200" 
    },    
    { 
      title: "Catálogo", 
      desc: "Maestro de Materiales", 
      path: "/gestion/catalogo", 
      icon: <Package size={32} />, 
      color: "bg-slate-50 text-slate-600 border-slate-200" 
    },
    { 
      title: "Bodega", 
      desc: "Config. Almacenes", 
      path: "/gestion/bodegas", 
      icon: <Warehouse size={32} />, 
      color: "bg-slate-50 text-slate-600 border-slate-200" 
    },
    { 
      title: "Proveedores", 
      desc: "Directorio de Empresas", 
      path: "/gestion/proveedores", 
      icon: <Truck size={32} />, 
      color: "bg-slate-50 text-slate-600 border-slate-200" 
    },
    { 
      title: "Proyectos", 
      desc: "Centros de Costo", 
      path: "/gestion/proyectos", 
      icon: <Settings size={32} />, 
      color: "bg-slate-50 text-slate-600 border-slate-200" 
    },
    { 
      title: "Reportes e Informes", 
      desc: "Cierres y Valorización", 
      path: "/gestion/reportes", 
      icon: <FileBarChart size={32} />, 
      color: "bg-cyan-50 text-cyan-600 border-cyan-200" 
    },
  ];

  return (
    <div>
      {/* Header con Saludo y Botón Volver */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Hola, {user?.user_metadata?.full_name || 'Usuario'}</h2>
            <p className="text-slate-500">Selecciona un módulo para comenzar a trabajar.</p>
        </div>
        
        {/* BOTÓN DE RETORNO AL PORTAL */}
        <button 
            onClick={handleBackToPortal}
            className="flex items-center gap-2 bg-white text-slate-600 hover:text-red-600 hover:bg-red-50 hover:border-red-200 px-4 py-2 rounded-xl border border-slate-200 shadow-sm transition-all font-bold text-sm"
        >
            <ArrowLeft size={18} />
            Volver al Portal
        </button>
      </div>

      {/* Grid de Módulos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {modules.map((mod, idx) => (
          <button 
            key={idx}
            onClick={() => navigate(mod.path)}
            className={`p-6 rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-1 transition-all text-left flex flex-col justify-between h-40 group bg-white ${mod.color.replace('bg-', 'hover:bg-opacity-80 ')}`}
          >
            <div className={`p-3 rounded-xl w-fit ${mod.color}`}>
              {mod.icon}
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg group-hover:text-black">{mod.title}</h3>
              <p className="text-sm text-slate-500">{mod.desc}</p>
            </div>
          </button>
        ))}
      </div>
      
      {/* Footer simple */}
      <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Box size={16}/> Sistema de Gestión Logística v2.0
      </div>
    </div>
  );
}