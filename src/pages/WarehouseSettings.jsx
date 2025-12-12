import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Warehouse, MapPin, Plus, Edit, Search, LayoutGrid, List as ListIcon, Archive, CheckCircle, XCircle } from 'lucide-react';

const WarehouseSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros y Vistas
  const [viewMode, setViewMode] = useState('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, ACTIVE, INACTIVE

  // Estado Modal
  const [showModal, setShowModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null);
  const [formData, setFormData] = useState({ 
      name: '', code: '', location: '', type: 'CENTRAL', description: '', is_active: true 
  });

  // 1. Cargar Bodegas
  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) {
          const { data, error } = await supabase
            .from('logis_warehouses')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .order('is_active', { ascending: false }) // Activas primero
            .order('name');
          
          if (error) throw error;
          setWarehouses(data || []);
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) fetchWarehouses(); }, [user, fetchWarehouses]);

  // 2. Filtrado Inteligente
  const filteredWarehouses = useMemo(() => {
      return warehouses.filter(w => {
          const matchText = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            w.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            w.location?.toLowerCase().includes(searchTerm.toLowerCase());
          
          let matchStatus = true;
          if (filterStatus === 'ACTIVE') matchStatus = w.is_active === true;
          if (filterStatus === 'INACTIVE') matchStatus = w.is_active === false;

          return matchText && matchStatus;
      });
  }, [warehouses, searchTerm, filterStatus]);

  // 3. Handlers CRUD
  const handleOpenCreate = () => {
      setEditingWarehouse(null);
      setFormData({ name: '', code: '', location: '', type: 'CENTRAL', description: '', is_active: true });
      setShowModal(true);
  };

  const handleOpenEdit = (wh) => {
      setEditingWarehouse(wh);
      setFormData({
          name: wh.name,
          code: wh.code || '',
          location: wh.location || '',
          type: wh.type,
          description: wh.description || '',
          is_active: wh.is_active
      });
      setShowModal(true);
  };

  const handleSave = async (e) => {
      e.preventDefault();
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          
          const payload = {
              organization_id: profile.organization_id,
              name: formData.name,
              code: formData.code.toUpperCase(), // Códigos siempre en mayúscula
              location: formData.location,
              type: formData.type,
              description: formData.description,
              is_active: formData.is_active
          };

          if (editingWarehouse) {
              const { error } = await supabase.from('logis_warehouses').update(payload).eq('id', editingWarehouse.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('logis_warehouses').insert(payload);
              if (error) throw error;
          }

          alert("Ubicación guardada correctamente.");
          setShowModal(false);
          fetchWarehouses();
      } catch (error) { alert("Error: " + error.message); }
  };

  // Helpers de UI
  const getTypeBadge = (type) => {
      switch (type) {
          case 'CENTRAL': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'OBRA': return 'bg-orange-100 text-orange-700 border-orange-200';
          case 'MOVIL': return 'bg-purple-100 text-purple-700 border-purple-200';
          default: return 'bg-gray-100 border-gray-200';
      }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 text-stone-400" size={18} />
                    <input type="text" placeholder="Buscar bodega o código..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-stone-300 rounded-lg w-full focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-stone-300 p-2 rounded-lg text-sm bg-stone-50 font-medium">
                    <option value="ALL">Todos los Estados</option>
                    <option value="ACTIVE">Operativas</option>
                    <option value="INACTIVE">Cerradas / Inactivas</option>
                </select>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-lg">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}><LayoutGrid size={18} /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}><ListIcon size={18} /></button>
            </div>
        </div>

        {/* --- VISTA GRILLA --- */}
        {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredWarehouses.map(w => (
                    <div key={w.id} className={`bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-all group relative ${!w.is_active ? 'opacity-75 bg-stone-50' : 'border-stone-200'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className={`p-3 rounded-lg border ${!w.is_active ? 'bg-gray-200 text-gray-500 border-gray-300' : getTypeBadge(w.type).replace('text-', 'bg-').split(' ')[0] + ' text-white'}`}>
                                <Warehouse size={24} />
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${getTypeBadge(w.type)}`}>{w.type}</span>
                                {!w.is_active && <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-red-100 text-red-600 border border-red-200">Cerrada</span>}
                            </div>
                        </div>
                        
                        <h3 className="text-lg font-bold text-stone-800 mb-0 flex items-center gap-2">
                            {w.name}
                        </h3>
                        <span className="text-xs font-mono text-stone-400 bg-stone-100 px-1.5 rounded">{w.code || 'S/C'}</span>
                        
                        <div className="flex items-start gap-2 text-stone-500 text-sm mt-4">
                            <MapPin size={16} className="mt-0.5 flex-shrink-0" />
                            <span>{w.location || 'Sin dirección registrada'}</span>
                        </div>

                        <button onClick={() => handleOpenEdit(w)} className="absolute top-4 right-4 text-stone-300 hover:text-blue-600 transition-colors" title="Editar / Gestionar">
                            <Edit size={18} />
                        </button>
                    </div>
                ))}
            </div>
        )}

        {/* --- VISTA LISTA --- */}
        {viewMode === 'list' && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-stone-50 text-xs uppercase font-bold text-stone-500 border-b">
                        <tr>
                            <th className="p-4">Estado</th>
                            <th className="p-4">Código</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4">Tipo</th>
                            <th className="p-4">Ubicación</th>
                            <th className="p-4 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-sm">
                        {filteredWarehouses.map(w => (
                            <tr key={w.id} className={`hover:bg-stone-50 ${!w.is_active ? 'bg-stone-50 text-stone-400' : ''}`}>
                                <td className="p-4">
                                    {w.is_active 
                                        ? <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs"><CheckCircle size={14}/> Operativa</span>
                                        : <span className="flex items-center gap-1 text-red-500 font-bold text-xs"><XCircle size={14}/> Cerrada</span>
                                    }
                                </td>
                                <td className="p-4 font-mono">{w.code || '-'}</td>
                                <td className="p-4 font-bold">{w.name}</td>
                                <td className="p-4"><span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${getTypeBadge(w.type)}`}>{w.type}</span></td>
                                <td className="p-4 text-stone-500">{w.location}</td>
                                <td className="p-4 text-right"><button onClick={() => handleOpenEdit(w)} className="text-stone-400 hover:text-blue-600"><Edit size={16} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {/* MODAL DE EDICIÓN/CREACIÓN */}
        {showModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
                    <div className="p-5 border-b bg-stone-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-stone-800">{editingWarehouse ? 'Gestión de Bodega' : 'Nueva Ubicación'}</h3>
                        <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-red-500 font-bold text-xl">×</button>
                    </div>
                    <form onSubmit={handleSave} className="p-6 space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Nombre</label>
                                <input required className="w-full border p-2 rounded-lg" placeholder="Bodega Central" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Código</label>
                                <input className="w-full border p-2 rounded-lg font-mono uppercase" placeholder="CEN-01" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Tipo</label>
                                <select className="w-full border p-2 rounded-lg bg-white" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                    <option value="CENTRAL">Bodega Central</option>
                                    <option value="OBRA">Obra / Proyecto</option>
                                    <option value="MOVIL">Móvil (Vehículo)</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer bg-stone-100 p-2 rounded-lg w-full border border-stone-200 hover:bg-stone-200 transition-colors">
                                    <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="w-4 h-4 text-emerald-600 rounded" />
                                    <span className={`text-sm font-bold ${formData.is_active ? 'text-emerald-700' : 'text-stone-500'}`}>
                                        {formData.is_active ? 'OPERATIVA' : 'INACTIVA'}
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Dirección / Ubicación</label>
                            <input className="w-full border p-2 rounded-lg" placeholder="Av. Industrial 550..." value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Descripción (Opcional)</label>
                            <textarea className="w-full border p-2 rounded-lg text-sm" rows="2" placeholder="Notas adicionales..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                        </div>

                        <button className="w-full bg-stone-900 text-white py-3 rounded-lg font-bold hover:bg-black shadow-lg transition-all active:scale-95">
                            {editingWarehouse ? 'Guardar Cambios' : 'Crear Bodega'}
                        </button>
                    </form>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default WarehouseSettings;