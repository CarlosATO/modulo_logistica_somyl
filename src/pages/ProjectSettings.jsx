import React, { useState, useEffect } from 'react';
import {
  Briefcase, User, Calendar, DollarSign, Copy,
  CheckCircle, XCircle, Info, Loader, List, LayoutGrid
} from 'lucide-react';
import { supabaseProcurement } from '../services/procurementClient';
import Combobox from '../components/Combobox';
import GoogleSearchBar from '../components/GoogleSearchBar';
import { toast } from 'sonner';

export default function ProjectSettings() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVO');
  const [viewMode, setViewMode] = useState('list');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, viewMode]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseProcurement
        .from('proyectos')
        .select('*')
        .order('proyecto', { ascending: true });

      if (error) throw error;
      setProjects(data);
    } catch (error) {
      console.error('Error cargando proyectos:', error);
      toast.error('Error cargando proyectos');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const handleCopyInfo = (p) => {
    const textToCopy = `🏗️ ${p.proyecto}\nCliente: ${p.cliente || 'S/I'}\nPresupuesto: ${formatCurrency(p.presupuesto_total)}\nEstado: ${p.estado_proyecto || (p.activo ? 'Activo' : 'Inactivo')}`;
    navigator.clipboard.writeText(textToCopy)
      .then(() => toast.success('Ficha copiada'))
      .catch(() => toast.error('Error al copiar'));
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch =
      (p.proyecto || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cliente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.estado_proyecto || '').toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'ACTIVO') {
      matchesStatus = p.activo === true;
    } else if (statusFilter === 'Inactivo') {
      matchesStatus = p.activo === false;
    }

    return matchesSearch && matchesStatus;
  });

  // Paginación
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = filteredProjects.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-3 font-sans text-slate-800">

      {/* Header Standard */}
      <div className="flex flex-col lg:flex-row gap-2 items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
        <div className="w-full lg:flex-1 flex gap-2">
          <div className="w-40 shrink-0">
            <Combobox
              options={[
                { id: 'ACTIVO', name: 'Activos' },
                { id: 'Inactivo', name: 'Inactivos' },
                { id: 'TODOS', name: 'Todos' }
              ]}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="Estado"
            />
          </div>
          <GoogleSearchBar
            placeholder="Buscar proyecto..."
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
            <span className="font-bold text-slate-700 mr-1">{filteredProjects.length}</span> Proyectos
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium">Sincronizando proyectos...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-100 rounded-xl">No se encontraron proyectos.</div>
      ) : (
        <div className="animate-in fade-in space-y-4">
          {viewMode === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 w-24">Estado</th>
                      <th className="px-3 py-2">Proyecto</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Fechas</th>
                      <th className="px-3 py-2">Presupuesto</th>
                      <th className="px-3 py-2 w-16 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {currentItems.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-3 py-2">
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase border
                                        ${p.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                            {p.activo ? <CheckCircle size={8} /> : <XCircle size={8} />}
                            {p.estado_proyecto || (p.activo ? 'Activo' : 'Inactivo')}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-700 truncate max-w-[250px]" title={p.proyecto}>{p.proyecto}</div>
                          {p.observacion && (
                            <div className="flex items-center gap-1 text-[10px] text-yellow-600 mt-0.5">
                              <Info size={10} className="shrink-0" />
                              <span className="truncate max-w-[200px]">{p.observacion}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600 font-medium">
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{p.cliente || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          <div className="flex flex-col gap-0.5 text-[10px]">
                            <span className="flex items-center gap-1"><Calendar size={8} className="text-slate-400" /> {formatDate(p.fecha_inicio)}</span>
                            <span className="flex items-center gap-1"><Calendar size={8} className="text-slate-400" /> {formatDate(p.fecha_termino)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                          {formatCurrency(p.presupuesto_total)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleCopyInfo(p)}
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
              {currentItems.map((p) => (
                <div key={p.id} className="bg-white p-3 rounded-lg border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all group flex flex-col relative overflow-hidden h-full">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                        <Briefcase size={16} />
                      </div>
                      <div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border mb-0.5 inline-block
                                            ${p.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                          {p.estado_proyecto || (p.activo ? 'Activo' : 'Inactivo')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <h3 className="font-bold text-xs text-slate-800 leading-tight line-clamp-2 mb-1" title={p.proyecto}>{p.proyecto}</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-2">
                    <User size={10} className="text-slate-400 shrink-0" />
                    <span className="truncate">{p.cliente || 'Sin cliente'}</span>
                  </div>

                  <div className="space-y-1.5 flex-1 border-t border-slate-50 pt-2 mt-auto">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Inicio</span>
                      <span className="font-medium text-slate-600">{formatDate(p.fecha_inicio)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Presupuesto</span>
                      <span className="font-mono font-bold text-slate-700">{formatCurrency(p.presupuesto_total)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleCopyInfo(p)}
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