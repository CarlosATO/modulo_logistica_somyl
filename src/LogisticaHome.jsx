import React from 'react';
import { FileText, Truck, ArrowLeft, LayoutGrid, Box } from 'lucide-react';

export default function LogisticaHome({ onNavigate }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* --- TOP BAR --- */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          
          {/* Identidad del Módulo */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-400 to-orange-600 p-2 rounded-lg shadow-sm text-white">
              <Box size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Logística</h1>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Módulo Satélite</p>
            </div>
          </div>

          {/* Botón de Retorno Elegante */}
          <a
            href="http://localhost:5173"
            className="group flex items-center gap-2 px-5 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-800 hover:text-white rounded-full transition-all duration-300 ease-out shadow-sm hover:shadow-md"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-300" />
            <span>Volver al Portal</span>
          </a>
        </div>
      </header>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <main className="flex-grow p-6 md:p-12">
        <div className="max-w-5xl mx-auto">
          
          {/* Hero Section */}
          <div className="text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Centro de Operaciones
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Gestiona el inventario unificado, supervisa la flota y genera reportes de cierre desde un único punto de control.
            </p>
          </div>

          {/* Grid de Opciones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Tarjeta Reportes */}
            <button 
              onClick={() => onNavigate('reports_menu')}
              className="group relative bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                <FileText size={120} className="text-blue-600" />
              </div>
              
              <div className="relative z-10">
                <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors duration-300">
                  <FileText size={28} className="text-blue-600 group-hover:text-white transition-colors duration-300" />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-blue-700 transition-colors">
                  Reportes e Informes
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6 group-hover:text-slate-600">
                  Accede a los cierres de inventario (FOT/FON), análisis de discrepancias y exportación de datos.
                </p>
                
                <div className="flex items-center text-blue-600 font-semibold text-sm">
                  Ver Reportes <ArrowLeft className="rotate-180 ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

            {/* Tarjeta Gestión */}
            <button 
              onClick={() => onNavigate('gestion')}
              className="group relative bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:border-orange-300 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110 duration-500">
                <Truck size={120} className="text-orange-600" />
              </div>

              <div className="relative z-10">
                <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-orange-600 transition-colors duration-300">
                  <Truck size={28} className="text-orange-600 group-hover:text-white transition-colors duration-300" />
                </div>
                
                <h3 className="text-2xl font-bold text-slate-800 mb-2 group-hover:text-orange-700 transition-colors">
                  Gestión Logística
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-6 group-hover:text-slate-600">
                  Administración de recursos, asignación de flota y control de herramientas en terreno.
                </p>

                <div className="flex items-center text-orange-600 font-semibold text-sm">
                  Gestionar <ArrowLeft className="rotate-180 ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </button>

          </div>
        </div>
      </main>

      {/* Footer Simple */}
      <footer className="py-6 text-center text-slate-400 text-xs border-t border-slate-100">
        © 2025 Somyl S.A. - Infraestructura Segura
      </footer>
    </div>
  );
}