import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, MapPin, User, Warehouse, 
  Edit, Power, Save, X, Copy, Map, Share2 
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

export default function WarehouseSettings() {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estado para el Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    commune: '', // NUEVO
    georef: '',  // NUEVO
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
        commune: warehouse.commune || '', // NUEVO
        georef: warehouse.georef || '',   // NUEVO
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
        const { error: updateError } = await supabase
          .from('warehouses')
          .update(payload)
          .eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('warehouses')
          .insert([payload]);
        error = insertError;
      }

      if (error) throw error;

      await fetchWarehouses();
      setShowModal(false);
      alert(editingId ? 'Bodega actualizada' : 'Bodega creada exitosamente');

    } catch (error) {
      console.error('Error guardando:', error);
      alert('Error al guardar. Verifica los datos.');
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const action = currentStatus ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Estás seguro de que quieres ${action} esta bodega?`)) return;

    try {
      const { error } = await supabase
        .from('warehouses')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      fetchWarehouses();
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  };

  // --- FUNCIÓN DE COPIAR DATOS ---
  const handleCopyInfo = (w) => {
    // Formato amigable para WhatsApp/Email
    const textToCopy = `
📍 *DATOS DE BODEGA*
🏠 *${w.name}* (${w.code})
-------------------------
🗺️ *Dirección:* ${w.address || 'S/N'}
🏙️ *Comuna:* ${w.commune || '-'}
📌 *Coordenadas:* ${w.georef || 'No registradas'}
👤 *Encargado:* ${w.manager || 'No asignado'}
    `.trim();

    navigator.clipboard.writeText(textToCopy)
      .then(() => alert('📋 ¡Datos copiados al portapapeles!'))
      .catch(err => console.error('Error al copiar:', err));
  };

  const filteredWarehouses = warehouses.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.commune && w.commune.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Maestro de Bodegas</h2>
           <p className="text-xs text-slate-500">Gestión de almacenes y ubicaciones geográficas</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, código o comuna..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm">
            <Plus size={18} /> Nueva Bodega
          </button>
        </div>
      </div>

      {/* Grid de Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
           <p className="text-slate-400 col-span-full text-center py-8">Cargando bodegas...</p>
        ) : filteredWarehouses.length === 0 ? (
           <p className="text-slate-400 col-span-full text-center py-8">No se encontraron bodegas.</p>
        ) : (
          filteredWarehouses.map((w) => (
            <div key={w.id} className={`bg-white p-5 rounded-xl border transition-all hover:shadow-md group relative overflow-hidden flex flex-col ${!w.is_active ? 'opacity-70 grayscale border-slate-200' : 'border-slate-200'}`}>
                
                {/* Badge Estado */}
                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold uppercase tracking-wider ${w.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {w.is_active ? 'Activa' : 'Inactiva'}
                </div>

                {/* Encabezado Tarjeta */}
                <div className="flex items-center gap-4 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${w.is_active ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Warehouse size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 leading-tight">{w.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-mono bg-slate-100 px-1.5 rounded text-slate-500">{w.code}</span>
                            {w.commune && <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 rounded border border-orange-100 font-bold uppercase">{w.commune}</span>}
                        </div>
                    </div>
                </div>

                {/* Detalles */}
                <div className="space-y-2 text-sm text-slate-600 mb-4 flex-1">
                    <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-slate-400 mt-0.5 shrink-0"/>
                        <span className="break-words leading-tight">{w.address || 'Sin dirección'}</span>
                    </div>
                    {w.georef && (
                         <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded w-fit" title="Georreferenciación">
                            <Map size={14} className="shrink-0"/>
                            <span className="font-mono truncate max-w-[200px]">{w.georef}</span>
                         </div>
                    )}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-50 mt-2">
                        <User size={16} className="text-slate-400"/>
                        <span className="truncate text-slate-500">{w.manager || 'Sin encargado'}</span>
                    </div>
                </div>

                {/* Botonera de Acciones */}
                <div className="pt-3 border-t border-slate-100 flex gap-2 justify-between items-center">
                    {/* Botón COPIAR (El nuevo) */}
                    <button 
                        onClick={() => handleCopyInfo(w)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 hover:border-blue-200"
                        title="Copiar datos para compartir"
                    >
                        <Copy size={14} /> Copiar Datos
                    </button>

                    <div className="flex gap-1">
                        <button onClick={() => handleOpenModal(w)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                            <Edit size={18} />
                        </button>
                        <button onClick={() => handleToggleStatus(w.id, w.is_active)} className={`p-2 rounded-lg transition-colors ${w.is_active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50'}`} title={w.is_active ? "Desactivar" : "Reactivar"}>
                            <Power size={18} />
                        </button>
                    </div>
                </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                    <h3 className="font-bold text-lg text-slate-800">{editingId ? 'Editar Bodega' : 'Nueva Bodega'}</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre de Fantasía</label>
                            <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Ej: Obra Parque Central" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Código (Único)</label>
                            <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase" value={formData.code} onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})} placeholder="BOD-XYZ" disabled={!!editingId} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Comuna</label>
                            <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={formData.commune} onChange={(e) => setFormData({...formData, commune: e.target.value})} placeholder="Ej: San Miguel" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Dirección Referencial</label>
                        <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="Calle o referencia..." />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-2">
                            <Map size={14} className="text-blue-500"/> Georreferenciación (Lat, Lng)
                        </label>
                        <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" value={formData.georef} onChange={(e) => setFormData({...formData, georef: e.target.value})} placeholder="-33.4372, -70.6506" />
                        <p className="text-[10px] text-slate-400 mt-1">Copia y pega las coordenadas desde Google Maps.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Encargado Responsable</label>
                        <input type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" value={formData.manager} onChange={(e) => setFormData({...formData, manager: e.target.value})} placeholder="Nombre completo" />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex justify-center gap-2 items-center font-medium shadow-sm"><Save size={18} /> Guardar</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}