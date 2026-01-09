import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, ArrowDownCircle, ArrowUpCircle, ClipboardList, 
  Settings, Truck, Warehouse, Box, Grid, Layers, ArrowRightLeft,
  FileText, History, FileBarChart, ArrowLeft, PlayCircle, Database, LayoutDashboard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleBackToPortal = () => {
    const portalUrl = import.meta.env.VITE_PORTAL_URL || 'http://localhost:5173';
    window.location.href = portalUrl; 
  };

  // --- SECCIÓN 1: OPERACIONES PRINCIPALES (Lo que más se usa) ---
  const operationsModules = [
    { 
      title: "Recepción (Ingreso)", 
      desc: "Registrar entrada de materiales", 
      path: "/gestion/ingreso", 
      icon: <ArrowDownCircle size={28} />, 
      color: "text-emerald-600 bg-emerald-50 border-emerald-100" 
    },
    { 
      title: "Despacho (Salida)", 
      desc: "Entregar materiales a terreno", 
      path: "/gestion/salida", 
      icon: <ArrowUpCircle size={28} />, 
      color: "text-orange-600 bg-orange-50 border-orange-100" 
    },
    { 
      title: "Put Away (Ordenar)", 
      desc: "Ubicar stock pendiente en Racks", 
      path: "/gestion/orden", 
      icon: <ClipboardList size={28} />, 
      color: "text-blue-600 bg-blue-50 border-blue-100" 
    },
    { 
      title: "Traspasos", 
      desc: "Mover entre bodegas", 
      path: "/gestion/traspasos", 
      icon: <ArrowRightLeft size={28} />, 
      color: "text-purple-600 bg-purple-50 border-purple-100" 
    },
  ];

  // --- SECCIÓN 2: CONSULTAS Y CONTROL (Visibilidad) ---
  const analyticsModules = [
    { 
      title: "Visor de Inventario", 
      desc: "Stock Global, Físico y Kárdex", 
      path: "/gestion/visor", 
      icon: <Layers size={24} />, 
      color: "text-indigo-600 bg-white border-indigo-100 hover:border-indigo-300" 
    },
    { 
      title: "Historial de Ingresos", 
      desc: "Auditoría de recepciones", 
      path: "/gestion/historial-ingresos", 
      icon: <History size={24} />, 
      color: "text-indigo-600 bg-white border-indigo-100 hover:border-indigo-300" 
    },
    { 
      title: "Reportes Financieros", 
      desc: "Valorización y Cierres", 
      path: "/gestion/reportes", 
      icon: <FileBarChart size={24} />, 
      color: "text-cyan-600 bg-white border-cyan-100 hover:border-cyan-300" 
    },
  ];

  // --- SECCIÓN 3: CONFIGURACIÓN Y MAESTROS (Base de Datos) ---
  const configModules = [
    { title: "Catálogo", path: "/gestion/catalogo", icon: <Package size={20}/> },
    { title: "Mapa Bodega", path: "/gestion/ubicaciones", icon: <Grid size={20}/> },
    { title: "Bodegas", path: "/gestion/bodegas", icon: <Warehouse size={20}/> },
    { title: "Proveedores", path: "/gestion/proveedores", icon: <Truck size={20}/> },
    { title: "Proyectos", path: "/gestion/proyectos", icon: <Settings size={20}/> },
  ];

  return (
    <div className="pb-20">
      
      {/* HEADER PRINCIPAL */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
            <div className="bg-slate-900 text-white p-3 rounded-xl">
                <LayoutDashboard size={32}/>
            </div>
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
                <p className="text-slate-500 text-sm">Bienvenido, <span className="font-semibold text-slate-700">{user?.user_metadata?.full_name || 'Usuario'}</span></p>
            </div>
        </div>
        
        <button 
            onClick={handleBackToPortal}
            className="flex items-center gap-2 bg-slate-50 text-slate-600 hover:text-red-600 hover:bg-red-50 px-5 py-2.5 rounded-xl border border-slate-200 transition-all font-bold text-sm"
        >
            <ArrowLeft size={18} />
            Salir al Portal
        </button>
      </div>

      {/* BLOQUE 1: OPERACIONES (TARJETAS GRANDES) */}
      <div className="mb-10">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <PlayCircle size={16}/> Operaciones Diarias
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {operationsModules.map((mod, idx) => (
              <button 
                key={idx}
                onClick={() => navigate(mod.path)}
                className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all text-left relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${mod.color.replace('bg-', 'text-')}`}>
                    {mod.icon}
                </div>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${mod.color}`}>
                  {mod.icon}
                </div>
                <h3 className="font-bold text-slate-800 text-lg mb-1 group-hover:text-black">{mod.title}</h3>
                <p className="text-sm text-slate-500 leading-snug">{mod.desc}</p>
              </button>
            ))}
          </div>
      </div>

      {/* BLOQUE 2: ANALÍTICA (TARJETAS MEDIANAS) */}
      <div className="mb-10">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FileBarChart size={16}/> Consultas e Informes
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {analyticsModules.map((mod, idx) => (
              <button 
                key={idx}
                onClick={() => navigate(mod.path)}
                className={`flex items-center gap-4 p-5 rounded-xl border shadow-sm transition-all hover:shadow-md group ${mod.color}`}
              >
                <div className="bg-slate-50 p-3 rounded-lg text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                    {mod.icon}
                </div>
                <div className="text-left">
                    <h3 className="font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">{mod.title}</h3>
                    <p className="text-xs text-slate-400">{mod.desc}</p>
                </div>
              </button>
            ))}
          </div>
      </div>

      {/* BLOQUE 3: CONFIGURACIÓN (TARJETAS COMPACTAS) */}
      <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Database size={16}/> Maestros y Configuración
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {configModules.map((mod, idx) => (
              <button 
                key={idx}
                onClick={() => navigate(mod.path)}
                className="bg-slate-50 hover:bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all text-center flex flex-col items-center justify-center gap-2 group"
              >
                <div className="text-slate-400 group-hover:text-slate-800 transition-colors">
                    {mod.icon}
                </div>
                <span className="font-bold text-sm text-slate-600 group-hover:text-slate-900">{mod.title}</span>
              </button>
            ))}
          </div>
      </div>
      
      {/* Footer */}
      <div className="mt-16 pt-8 border-t border-slate-100 text-center">
         <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-2">
            <Box size={14}/> SOMYL S.A. • Sistema de Gestión Logística v2.1
         </p>
      </div>

    </div>
  );
}