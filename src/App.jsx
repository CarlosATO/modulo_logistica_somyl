import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

// Importamos las vistas
import LogisticaHome from './LogisticaHome';
import ReportesMenu from './ReportesMenu';
import InventoryReport from './InventoryReport';

function App() {
  const [authorized, setAuthorized] = useState(false);
  const [currentView, setCurrentView] = useState('home'); // home, reports_menu, inventory_report, gestion

  useEffect(() => {
    // 1. Seguridad SSO
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token'); 

    if (token) {
        localStorage.setItem('sso_token', token);
        window.history.replaceState({}, document.title, "/");
        setAuthorized(true);
    } else {
        const storedToken = localStorage.getItem('sso_token');
        if (storedToken) {
            setAuthorized(true);
        } else {
            setAuthorized(false);
        }
    }
  }, []);

  // Bloqueo de seguridad
  if (!authorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100 font-sans">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg border border-slate-200 max-w-md">
            <div className="text-6xl mb-4">⛔</div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Acceso Restringido</h1>
            <p className="text-slate-500 mb-6">Debes ingresar a través del Portal Central.</p>
            <a href="http://localhost:5173" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">Volver al Portal</a>
        </div>
      </div>
    );
  }

  // Renderizador de Vistas
  const renderView = () => {
    switch(currentView) {
      case 'home':
        return <LogisticaHome onNavigate={setCurrentView} />;
      
      case 'reports_menu':
        return <ReportesMenu onNavigate={setCurrentView} onBack={() => setCurrentView('home')} />;
      
      case 'inventory_report':
        return (
          <div className="relative">
            {/* Botón flotante para volver atrás desde el reporte */}
            <div className="bg-slate-100 px-4 pt-4">
                <button 
                    onClick={() => setCurrentView('reports_menu')}
                    className="flex items-center gap-2 text-slate-600 hover:text-blue-600 font-bold bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 transition-all"
                >
                    <ArrowLeft size={18} /> Volver a Reportes
                </button>
            </div>
            <InventoryReport />
          </div>
        );

      case 'gestion':
        return (
          <div className="p-8 max-w-4xl mx-auto text-center">
            <button onClick={() => setCurrentView('home')} className="mb-8 flex items-center gap-2 text-slate-500 hover:text-slate-800"><ArrowLeft size={20}/> Volver</button>
            <div className="p-12 bg-white rounded-xl border border-dashed border-slate-300">
                <h2 className="text-2xl font-bold text-slate-400 mb-2">🚧 Gestión Logística</h2>
                <p className="text-slate-500">Módulo en construcción...</p>
            </div>
          </div>
        );

      default:
        return <LogisticaHome onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {renderView()}
    </div>
  );
}

export default App;