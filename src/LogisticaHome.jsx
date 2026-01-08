import React, { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, Grid, Layers, Plus, Trash2, Edit, Save, X, Box, 
  ArrowRight, CheckCircle, Search, AlertCircle
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import Combobox from '../components/Combobox';
import { toast } from 'sonner';

export default function LocationSettings() {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // --- FILTROS (Estado Inicial Vacío para obligar selección) ---
  const [filterZone, setFilterZone] = useState(''); // Vacío por defecto
  const [filterRow, setFilterRow] = useState('ALL');
  
  // Modal y Formulario
  const [showModal, setShowModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState(null);
  const [formData, setFormData] = useState({
    zone: '',
    aisle: '',
    rack: '',
    level: '',
    position: ''
  });

  // 1. Cargar Bodegas
  useEffect(() => {
    const fetchWarehouses = async () => {
      const { data } = await supabase.from('warehouses').select('*').eq('is_active', true);
      setWarehouses(data || []);
      if (data && data.length > 0) setSelectedWarehouse(data[0].id);
    };
    fetchWarehouses();
  }, []);

  // 2. Cargar Ubicaciones (Solo de la bodega seleccionada)
  useEffect(() => {
    if (!selectedWarehouse) return;
    
    const fetchLocations = async () => {
      setLoading(true);
      // Resetear filtros al cambiar de bodega
      setFilterZone(''); 
      setFilterRow('ALL');

      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('warehouse_id', selectedWarehouse)
        .order('full_code', { ascending: true });
        
      if (error) {
        console.error(error);
        toast.error('Error cargando ubicaciones');
      } else {
        setLocations(data || []);
      }
      setLoading(false);
    };
    
    fetchLocations();
  }, [selectedWarehouse]);

  // --- LÓGICA DE FILTRADO ---
  const filteredLocations = useMemo(() => {
    // REGLA: Si no hay Zona seleccionada, NO mostrar nada.
    if (!filterZone) return [];

    return locations.filter(loc => {
      const matchZone = loc.zone === filterZone;
      // El filtro de Pasillo sí permite 'ALL' (Todos los pasillos de ESTA zona)
      const matchRow = filterRow === 'ALL' || loc.aisle === filterRow;
      return matchZone && matchRow;
    });
  }, [locations, filterZone, filterRow]);

  // Obtener listas únicas para los filtros (Dinámicas)
  const uniqueZones = useMemo(() => [...new Set(locations.map(l => l.zone))].sort(), [locations]);
  
  const uniqueRows = useMemo(() => {
    if (!filterZone) return [];
    return [...new Set(locations.filter(l => l.zone === filterZone).map(l => l.aisle))].sort();
  }, [locations, filterZone]);


  // --- CRUD (Mantener lógica igual) ---
  const handleOpenModal = (loc = null) => {
    if (loc) {
      setEditingLoc(loc);
      setFormData({
        zone: loc.zone, aisle: loc.aisle, rack: loc.rack, level: loc.level, position: loc.position
      });
    } else {
      setEditingLoc(null);
      setFormData({ zone: '', aisle: '', rack: '', level: '', position: '' });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedWarehouse) return;
    
    const fullCode = `${formData.zone}-${formData.aisle}-${formData.rack}-${formData.level}-${formData.position}`;
    
    const payload = {
      warehouse_id: selectedWarehouse,
      zone: formData.zone.toUpperCase(),
      aisle: formData.aisle.toUpperCase(),
      rack: formData.rack.toUpperCase(),
      level: formData.level.toUpperCase(),
      position: formData.position.toUpperCase(),
      full_code: fullCode.toUpperCase()
    };

    try {
      if (editingLoc) {
        const { error } = await supabase.from('locations').update(payload).eq('id', editingLoc.id);
        if (error) throw error;
        toast.success('Ubicación actualizada');
      } else {
        const { error } = await supabase.from('locations').insert(payload);
        if (error) throw error;
        toast.success('Ubicación creada');
      }
      
      const { data } = await supabase.from('locations').select('*').eq('warehouse_id', selectedWarehouse).order('full_code');
      setLocations(data || []);
      setShowModal(false);
    } catch (err) {
      toast.error('Error al guardar: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta ubicación?')) return;
    try {
      const { error } = await supabase.from('locations').delete().eq('id', id);
      if (error) throw error;
      setLocations(prev => prev.filter(l => l.id !== id));
      toast.success('Eliminado');
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  return (
    <div className="pb-20 space-y-6">
      
      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="text-blue-600"/> Mapa de Bodega
            </h1>
            <p className="text-xs text-slate-500">Configuración de Racks y Ubicaciones</p>
          </div>
          
          <div className="flex gap-4 items-center w-full md:w-auto">
             <div className="w-full md:w-64">
                <Combobox
                    options={warehouses}
                    value={selectedWarehouse} // <--- CORREGIDO (Era selected)
                    onChange={setSelectedWarehouse}
                    placeholder="Seleccionar Bodega"
                    label="Bodega Activa"
                />
             </div>
             <button onClick={() => handleOpenModal()} className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg shadow-lg transition-all" title="Crear nueva ubicación">
                <Plus size={24}/>
             </button>
          </div>
        </div>
      </div>

      {/* FILTROS Y VISTA */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* SIDEBAR FILTROS */}
        <div className="bg-white p-5 rounded-xl shadow-sm border h-fit">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Search size={16}/> Filtros de Vista</h3>
            
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Zona (Obligatorio)</label>
                    <Combobox
                        // Eliminamos la opción "Todas las Zonas" para forzar selección específica
                        options={uniqueZones.map(z => ({id: z, name: `Zona ${z}`}))} 
                        value={filterZone} // <--- CORREGIDO
                        onChange={(val) => { setFilterZone(val); setFilterRow('ALL'); }}
                        placeholder="-- Selecciona Zona --"
                    />
                </div>
                
                <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Pasillo / Fila</label>
                    <Combobox
                        options={[{id: 'ALL', name: 'Todos los Pasillos'}, ...uniqueRows.map(r => ({id: r, name: `Pasillo ${r}`}))]}
                        value={filterRow} // <--- CORREGIDO
                        onChange={setFilterRow}
                        placeholder="Filtrar Pasillo"
                        disabled={!filterZone} // Desactivado si no hay zona
                    />
                </div>
            </div>

            {filterZone && (
                <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-100 animate-in fade-in">
                    <p className="text-xs text-blue-800 font-bold mb-1">Ubicaciones Visibles</p>
                    <p className="text-2xl font-black text-blue-600">{filteredLocations.length}</p>
                </div>
            )}
        </div>

        {/* LISTADO DE UBICACIONES */}
        <div className="lg:col-span-3">
            {loading ? (
                <div className="text-center py-20"><Search className="animate-spin mx-auto text-slate-300"/></div>
            ) : !filterZone ? (
                // MENSJE CUANDO NO HAY FILTRO APLICADO
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-16 text-center">
                    <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MapPin size={32} className="text-slate-300"/>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700">Selecciona una Zona</h3>
                    <p className="text-slate-400 max-w-md mx-auto mt-2">
                        Para visualizar y gestionar las ubicaciones, primero debes seleccionar una Zona en el panel de la izquierda.
                    </p>
                </div>
            ) : filteredLocations.length === 0 ? (
                // MENSAJE CUANDO FILTRO NO TRAE NADA
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-400">
                    <Grid size={48} className="mx-auto mb-4 opacity-20"/>
                    <p>No hay ubicaciones creadas en esta Zona/Pasillo.</p>
                </div>
            ) : (
                // GRID DE RESULTADOS
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in">
                    {filteredLocations.map(loc => (
                        <div key={loc.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group relative">
                            <div className="flex justify-between items-start mb-2">
                                <div className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded uppercase">
                                    Zona {loc.zone}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleOpenModal(loc)} className="p-1 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors"><Edit size={14}/></button>
                                    <button onClick={() => handleDelete(loc.id)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"><Trash2 size={14}/></button>
                                </div>
                            </div>
                            <h3 className="text-lg font-black text-slate-800 text-center my-2 tracking-tight">{loc.full_code}</h3>
                            <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-slate-400 font-mono mt-3 border-t pt-2 border-slate-50">
                                <div><span className="block font-bold text-slate-600">{loc.aisle}</span>Pasillo</div>
                                <div><span className="block font-bold text-slate-600">{loc.rack}</span>Rack</div>
                                <div><span className="block font-bold text-slate-600">{loc.level}</span>Nivel</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

      </div>

      {/* MODAL EDITAR/CREAR */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">{editingLoc ? 'Editar Ubicación' : 'Nueva Ubicación'}</h3>
                        <p className="text-xs text-slate-500">Define las coordenadas físicas</p>
                    </div>
                    <button onClick={()=>setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={handleSave} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Zona</label>
                            <input required className="w-full border-2 border-slate-200 p-2 rounded-lg font-bold focus:border-blue-500 outline-none transition-colors" placeholder="A" value={formData.zone} onChange={e=>setFormData({...formData, zone:e.target.value})}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Pasillo</label>
                            <input required className="w-full border-2 border-slate-200 p-2 rounded-lg font-bold focus:border-blue-500 outline-none transition-colors" placeholder="01" value={formData.aisle} onChange={e=>setFormData({...formData, aisle:e.target.value})}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Rack</label>
                            <input required className="w-full border-2 border-slate-200 p-2 rounded-lg font-bold focus:border-blue-500 outline-none transition-colors" placeholder="01" value={formData.rack} onChange={e=>setFormData({...formData, rack:e.target.value})}/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nivel</label>
                            <input required className="w-full border-2 border-slate-200 p-2 rounded-lg font-bold focus:border-blue-500 outline-none transition-colors" placeholder="A" value={formData.level} onChange={e=>setFormData({...formData, level:e.target.value})}/>
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Posición</label>
                            <input required className="w-full border-2 border-slate-200 p-2 rounded-lg font-bold focus:border-blue-500 outline-none transition-colors" placeholder="01" value={formData.position} onChange={e=>setFormData({...formData, position:e.target.value})}/>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                        <span className="text-xs text-slate-400 uppercase font-bold block mb-1">Código Resultante</span>
                        <span className="text-xl font-black text-blue-600 tracking-widest">
                            {formData.zone || '?'}-{formData.aisle || '?'}-{formData.rack || '?'}-{formData.level || '?'}-{formData.position || '?'}
                        </span>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
                        {editingLoc ? 'Guardar Cambios' : 'Crear Ubicación'}
                    </button>
                </form>
             </div>
        </div>
      )}

    </div>
  );
}