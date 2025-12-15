import React, { useState, useEffect } from 'react';
import { 
  Search, Truck, Phone, Mail, Building, 
  Copy, List as ListIcon, LayoutGrid, Loader, CreditCard, User
} from 'lucide-react';
import { supabaseProcurement } from '../services/procurementClient';

export default function SupplierSettings() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' o 'grid'

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      // Conexión a Base Externa (Adquisiciones)
      const { data, error } = await supabaseProcurement
        .from('proveedores')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setSuppliers(data);
    } catch (error) {
      console.error('Error cargando proveedores:', error);
    } finally {
      setLoading(false);
    }
  };

  // Función para copiar datos (Formato WhatsApp)
  const handleCopyInfo = (p) => {
    const textToCopy = `
🚛 *DATOS DEL PROVEEDOR*
🏢 *${p.nombre}*
🆔 RUT: ${p.rut}
-------------------------
📞 Fono: ${p.fono || 'S/I'}
📧 Email: ${p.correo || 'S/I'}
👤 Contacto: ${p.contacto || 'Generico'}
📍 Dirección: ${p.direccion || ''} ${p.comuna || ''}
🏦 Banco: ${p.banco || '-'}
💰 Cuenta: ${p.cuenta || '-'}
    `.trim();

    navigator.clipboard.writeText(textToCopy)
      .then(() => alert('📋 ¡Datos copiados al portapapeles!'))
      .catch(err => console.error('Error al copiar:', err));
  };

  // Filtro
  const filteredSuppliers = suppliers.filter(s => 
    (s.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.rut || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.contacto || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      
      {/* Header y Controles */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Directorio de Proveedores</h2>
           <p className="text-xs text-slate-500">
             Total: {suppliers.length} | Fuente: Adquisiciones
           </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          {/* Buscador */}
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por Nombre, RUT o Contacto..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Toggle Vistas */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button 
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Vista de Lista"
            >
                <ListIcon size={18} />
            </button>
            <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                title="Vista de Tarjetas"
            >
                <LayoutGrid size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">
            <Loader className="animate-spin mx-auto mb-2" size={32}/> 
            <p>Cargando directorio...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="py-20 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <Truck className="mx-auto mb-2 opacity-50" size={48}/>
            <p>No se encontraron proveedores.</p>
        </div>
      ) : (
        <>
            {/* === VISTA LISTA (TABLA) === */}
            {viewMode === 'list' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">RUT</th>
                            <th className="px-6 py-4">Razón Social</th>
                            <th className="px-6 py-4">Contacto Comercial</th>
                            <th className="px-6 py-4">Teléfono / Email</th>
                            <th className="px-6 py-4">Ubicación</th>
                            <th className="px-6 py-4 text-right">Acción</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {filteredSuppliers.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{s.rut}</td>
                                <td className="px-6 py-3 font-medium text-slate-700">
                                    {s.nombre}
                                    {s.banco && <span className="block text-[10px] text-slate-400 font-normal">{s.banco}</span>}
                                </td>
                                <td className="px-6 py-3 text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <User size={14} className="text-slate-300"/>
                                        {s.contacto || '-'}
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <div className="flex flex-col gap-0.5">
                                        {s.fono && <span className="flex items-center gap-1 text-xs"><Phone size={12} className="text-emerald-500"/> {s.fono}</span>}
                                        {s.correo && <span className="flex items-center gap-1 text-xs text-blue-600"><Mail size={12}/> {s.correo}</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-slate-500 text-xs">
                                    {s.comuna ? `${s.comuna}` : '-'}
                                </td>
                                <td className="px-6 py-3 text-right">
                                    <button 
                                        onClick={() => handleCopyInfo(s)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                        title="Copiar datos"
                                    >
                                        <Copy size={16}/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {/* === VISTA TARJETAS (GRID) === */}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredSuppliers.map((s) => (
                        <div key={s.id} className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all group flex flex-col relative overflow-hidden">
                            
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                                    <Building size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-slate-800 leading-snug truncate" title={s.nombre}>{s.nombre}</h3>
                                    <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 mt-1 inline-block">{s.rut}</span>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-slate-600 mb-4 flex-1">
                                <div className="flex items-center gap-2">
                                    <User size={14} className="text-slate-400 shrink-0"/>
                                    <span className="truncate">{s.contacto || 'Sin contacto'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone size={14} className="text-slate-400 shrink-0"/>
                                    <span className="truncate">{s.fono || '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Mail size={14} className="text-slate-400 shrink-0"/>
                                    <span className="truncate text-blue-600 text-xs" title={s.correo}>{s.correo || '-'}</span>
                                </div>
                                {s.banco && (
                                    <div className="flex items-center gap-2 text-xs pt-2 mt-2 border-t border-slate-50 text-slate-500">
                                        <CreditCard size={14} className="shrink-0"/>
                                        <span className="truncate">{s.banco} • {s.cuenta}</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto pt-3 border-t border-slate-100 flex justify-end">
                                <button 
                                    onClick={() => handleCopyInfo(s)}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <Copy size={14} /> Copiar Ficha
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
      )}
    </div>
  );
}