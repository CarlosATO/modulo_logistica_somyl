import React from 'react';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';

export default function ReportesMenu({ onNavigate, onBack }) {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Botón Volver */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6 font-medium transition-colors"
      >
        <ArrowLeft size={20} /> Volver al Panel
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Reportes Disponibles</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Tarjeta Cierre Telefónica */}
        <button 
          onClick={() => onNavigate('inventory_report')}
          className="flex items-center p-4 bg-white rounded-lg shadow-sm border border-slate-200 hover:border-green-400 hover:shadow-md transition-all text-left"
        >
          <div className="p-3 bg-green-50 rounded-lg mr-4">
            <FileSpreadsheet size={24} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Cierre Telefónica</h3>
            <p className="text-xs text-slate-500">Control de inventarios FOT/FON</p>
          </div>
        </button>

        {/* Placeholder para futuros reportes */}
        <div className="flex items-center p-4 bg-slate-50 rounded-lg border border-slate-200 border-dashed opacity-60">
          <div className="p-3 bg-slate-200 rounded-lg mr-4">
            <FileSpreadsheet size={24} className="text-slate-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-500">Próximamente</h3>
            <p className="text-xs text-slate-400">Más reportes...</p>
          </div>
        </div>
      </div>
    </div>
  );
}