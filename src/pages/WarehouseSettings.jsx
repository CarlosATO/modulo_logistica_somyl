import React, { useState, useEffect } from 'react';
import {
  Plus, MapPin, User, Warehouse, Edit, Power,
  Save, X, Copy, Map, List, LayoutGrid, Building
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import GoogleSearchBar from '../components/GoogleSearchBar';
import { toast } from 'sonner';

export default function WarehouseSettings() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'

  // Estado para el Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    commune: '',
    georef: '',
    manager: '',
    is_active: true
  });

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setWarehouses(data);
    } catch (error) {
      console.error('Error cargando bodegas:', error);
      toast.error('Error cargando bodegas');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (warehouse = null) => {
    if (warehouse) {
      setEditingId(warehouse.id);
      setFormData({
        name: warehouse.name,
        code: warehouse.code,
        address: warehouse.address || '',
        commune: warehouse.commune || '',
        georef: warehouse.georef || '',
        manager: warehouse.manager || '',
        is_active: warehouse.is_active
      });
    } else {
      setEditingId(null);
      setFormData({
        name: '', code: '', address: '',
        commune: '', georef: '', manager: '',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };

      let error;
      if (editingId) {
        const { error: updateError } = await supabase.from('warehouses').update(payload).eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase.from('warehouses').insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      await fetchWarehouses();
      setShowModal(false);
      toast.success(editingId ? 'Bodega actualizada' : 'Bodega creada');

    } catch (error) {
      console.error('Error guardando:', error);
      toast.error('Error al guardar');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    // Optimistic Update
    setWarehouses(prev => prev.map(w => w.id === id ? { ...w, is_active: !currentStatus } : w));

    try {
      const { error } = await supabase.from('warehouses').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
      toast.success(currentStatus ? 'Bodega desactivada' : 'Bodega activada');
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast.error('Error cambiando estado');
      setWarehouses(prev => prev.map(w => w.id === id ? { ...w, is_active: currentStatus } : w)); // Revert
    }
  };

  const handleCopyInfo = (w) => {
    const textToCopy = `📍 ${w.name} (${w.code})\nDir: ${w.address || 'S/N'}, ${w.commune || '-'}\nEncargado: ${w.manager || 'No asignado'}`;
    navigator.clipboard.writeText(textToCopy)
      .then(() => toast.success('Datos copiados'))
      .catch(() => toast.error('Error al copiar'));
  };

  const filteredWarehouses = warehouses.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.commune && w.commune.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-3 font-sans text-slate-800">

      {/* Header: Buscador + Acciones */}
      <div className="flex flex-col lg:flex-row gap-2 items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
        <div className="w-full lg:flex-1">
          <GoogleSearchBar
            placeholder="Buscar bodega (Nombre, Código, Comuna...)"
            onSearch={(val) => setSearchTerm(val)}
            className="w-full"
          />
        </div>
        <div className="flex w-full lg:w-auto gap-2 items-center justify-start lg:justify-end overflow-x-auto lg:overflow-visible no-scrollbar">
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Lista"><List size={16} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Cuadrícula"><LayoutGrid size={16} /></button>
          </div>
          <button onClick={() => handleOpenModal()} className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95 whitespace-nowrap shrink-0">
            <Plus size={14} /> Nueva
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 h-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          {filteredWarehouses.length} Bodegas Encontradas
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium">Cargando...</div>
      ) : filteredWarehouses.length === 0 ? (
        <div className="py-20 text-center text-slate-400 text-xs font-medium">No se encontraron resultados.</div>
      ) : (
        <div className="animate-in fade-in">
          {viewMode === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-2 w-16">Estado</th>
                      <th className="px-3 py-2">Nombre / Código</th>
                      <th className="px-3 py-2">Ubicación</th>
                      <th className="px-3 py-2">Encargado</th>
                      <th className="px-3 py-2 w-24 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {filteredWarehouses.map(w => (
                      <tr key={w.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-3 py-2">
                          <div className={`w-2 h-2 rounded-full mx-auto ${w.is_active ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]' : 'bg-slate-300'}`} title={w.is_active ? 'Activa' : 'Inactiva'}></div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-700">{w.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{w.code}</div>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate max-w-[200px]" title={w.address}>{w.address || 'S/N'}</span>
                          </div>
                          {w.commune && <div className="text-[10px] text-slate-400 pl-4">{w.commune}</div>}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-slate-400 shrink-0" />
                            <span>{w.manager || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleCopyInfo(w)} className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded" title="Copiar"><Copy size={12} /></button>
                            <button onClick={() => handleOpenModal(w)} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded" title="Editar"><Edit size={12} /></button>
                            <button onClick={() => handleToggleStatus(w.id, w.is_active)} className={`p-1.5 rounded transition-colors ${w.is_active ? 'text-slate-400 hover:text-red-600 bg-slate-100 hover:bg-red-50' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`} title={w.is_active ? "Desactivar" : "Activar"}><Power size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredWarehouses.map(w => (
                <div key={w.id} className={`bg-white rounded-lg border p-3 flex flex-col gap-2 relative group hover:shadow-md transition-all ${w.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${w.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Warehouse size={16} />
                      </div>
                      <div>
                        <h3 className="font-bold text-xs text-slate-700 leading-tight">{w.name}</h3>
                        <p className="text-[10px] text-slate-400 font-mono">{w.code}</p>
                      </div>
                    </div>
                    <span className={`w-1.5 h-1.5 rounded-full ${w.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                  </div>

                  <div className="space-y-1 mt-1 border-t border-slate-50 pt-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <MapPin size={10} className="text-slate-400" />
                      <span className="truncate">{w.address || 'S/N'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <Map size={10} className="text-slate-400" />
                      <span className="truncate">{w.commune || '-'}</span>
                    </div>
                  </div>

                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded-lg shadow-sm">
                    <button onClick={() => handleOpenModal(w)} className="p-1 hover:text-indigo-600"><Edit size={12} /></button>
                    <button onClick={() => handleToggleStatus(w.id, w.is_active)} className="p-1 hover:text-red-500"><Power size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-xl shrink-0">
              <h3 className="font-bold text-sm text-slate-800">{editingId ? 'Editar Bodega' : 'Nueva Bodega'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Nombre de Fantasía</label>
                  <input required type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Obra Parque Central" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Código (Único)</label>
                  <input required type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono uppercase bg-slate-50" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} placeholder="BOD-XYZ" disabled={!!editingId} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Comuna</label>
                  <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100" value={formData.commune} onChange={(e) => setFormData({ ...formData, commune: e.target.value })} placeholder="Ej: San Miguel" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Dirección</label>
                  <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Calle o referencia..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase flex items-center gap-1"><Map size={10} /> Coordenadas</label>
                  <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100 font-mono" value={formData.georef} onChange={(e) => setFormData({ ...formData, georef: e.target.value })} placeholder="-33.XXX, -70.XXX" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Encargado</label>
                  <input type="text" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100" value={formData.manager} onChange={(e) => setFormData({ ...formData, manager: e.target.value })} placeholder="Nombre completo" />
                </div>
              </div>

              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2 mt-4">
                <Save size={16} /> Guardar Bodega
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}