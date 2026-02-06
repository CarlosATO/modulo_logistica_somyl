import React, { useState, useEffect } from 'react';
import {
  Truck, Phone, Mail, Building, Copy, List,
  LayoutGrid, Loader, CreditCard, User, MapPin
} from 'lucide-react';
import { supabaseProcurement } from '../services/procurementClient';
import GoogleSearchBar from '../components/GoogleSearchBar';
import { toast } from 'sonner';

export default function SupplierSettings() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, viewMode]);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseProcurement
        .from('proveedores')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setSuppliers(data);
    } catch (error) {
      console.error('Error cargando proveedores:', error);
      toast.error('Error cargando proveedores');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInfo = (p) => {
    const textToCopy = `🚛 ${p.nombre}\nRUT: ${p.rut}\nFono: ${p.fono || 'S/I'} / Email: ${p.correo || 'S/I'}\nContacto: ${p.contacto || 'Generico'}`;
    navigator.clipboard.writeText(textToCopy)
      .then(() => toast.success('Datos copiados'))
      .catch(() => toast.error('Error al copiar'));
  };

  const filteredSuppliers = suppliers.filter(s =>
    (s.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.rut || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.contacto || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculo Paginación
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = filteredSuppliers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredSuppliers.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-3 font-sans text-slate-800">

      {/* Header Standard */}
      <div className="flex flex-col lg:flex-row gap-2 items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
        <div className="w-full lg:flex-1">
          <GoogleSearchBar
            placeholder="Buscar proveedor (Nombre, RUT, Contacto...)"
            onSearch={(val) => setSearchTerm(val)}
            className="w-full"
          />
        </div>
        <div className="flex w-full lg:w-auto gap-2 items-center justify-start lg:justify-end overflow-x-auto lg:overflow-visible no-scrollbar">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Lista"><List size={16} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Cuadrícula"><LayoutGrid size={16} /></button>
          </div>
          <div className="flex items-center px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-medium text-slate-500 shrink-0">
            <span className="font-bold text-slate-700 mr-1">{filteredSuppliers.length}</span> Proveedores
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium">Cargando directorio...</div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-100 rounded-xl">No se encontraron proveedores.</div>
      ) : (
        <div className="animate-in fade-in space-y-4">
          {viewMode === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 w-32">RUT</th>
                      <th className="px-3 py-2">Razón Social</th>
                      <th className="px-3 py-2">Contacto</th>
                      <th className="px-3 py-2">Datos contacto</th>
                      <th className="px-3 py-2">Ubicación</th>
                      <th className="px-3 py-2 w-16 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {currentItems.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-3 py-2">
                          <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200 whitespace-nowrap">{s.rut}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-700">{s.nombre}</div>
                          <div className="text-[10px] text-slate-400">{s.banco ? `${s.banco} • ${s.cuenta}` : 'Sin datos bancarios'}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{s.contacto || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            {s.fono && <span className="flex items-center gap-1.5 text-[10px] text-slate-600"><Phone size={10} className="text-emerald-500 shrink-0" /> {s.fono}</span>}
                            {s.correo && <span className="flex items-center gap-1.5 text-[10px] text-blue-600 max-w-[200px] truncate"><Mail size={10} className="shrink-0" /> {s.correo}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          <div className="flex items-center gap-1.5">
                            {s.comuna && <><MapPin size={10} className="text-slate-400 shrink-0" /> <span>{s.comuna}</span></>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleCopyInfo(s)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                            title="Copiar datos"
                          >
                            <Copy size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {currentItems.map((s) => (
                <div key={s.id} className="bg-white p-3 rounded-lg border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all group flex flex-col relative overflow-hidden h-full">
                  <div className="flex items-start gap-3 mb-2">
                    <div className="w-8 h-8 rounded bg-slate-50 text-slate-400 flex items-center justify-center shrink-0 border border-slate-100">
                      <Building size={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-xs text-slate-800 leading-tight truncate" title={s.nombre}>{s.nombre}</h3>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">{s.rut}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1 border-t border-slate-50 pt-2 mt-1">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <User size={10} className="text-slate-400 shrink-0" />
                      <span className="truncate">{s.contacto || 'Sin contacto'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <Phone size={10} className="text-slate-400 shrink-0" />
                      <span className="truncate">{s.fono || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <Mail size={10} className="text-slate-400 shrink-0" />
                      <span className="truncate text-blue-600" title={s.correo}>{s.correo || '-'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyInfo(s)}
                    className="absolute top-2 right-2 p-1 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* CONTROLES DE PAGINACIÓN */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm mt-4">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>

              <span className="text-xs font-medium text-slate-500">
                Página {currentPage} de {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}