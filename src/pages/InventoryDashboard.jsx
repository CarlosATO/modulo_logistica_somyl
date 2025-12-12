import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, ArrowDownCircle, ArrowUpCircle, ClipboardList, 
  LayoutList, Settings, Truck, Warehouse, Box
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

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
      title: "Movimientos", 
      desc: "Kardex y Stock real", 
      path: "/gestion/kardex", 
      icon: <LayoutList size={32} />, 
      color: "bg-violet-50 text-violet-600 border-violet-100" 
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
  ];

  return (
    <div>
      {/* Saludo */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Hola, {user?.user_metadata?.full_name || 'Usuario'}</h2>
        <p className="text-slate-500">Selecciona un módulo para comenzar a trabajar.</p>
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