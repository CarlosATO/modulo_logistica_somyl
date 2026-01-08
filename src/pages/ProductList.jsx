import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Camera, Image as ImageIcon, Loader, LayoutGrid, 
  List as ListIcon, X, Plus, Edit, Trash2, Save, Building, Users
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar';
import Combobox from '../components/Combobox';
import { supabaseProcurement } from '../services/procurementClient';
import { supabase } from '../services/supabaseClient';

const EXCLUDED_KEYWORDS = ['servicios', 'hospedaje', 'arriendo', 'retroexcavadora', 'grua', 'sub contrato', 'cursos', 'examenes', 'laboratorio'];

export default function ProductList() {
  const [materials, setMaterials] = useState([]);
  const [clientsList, setClientsList] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); 
  const [filterClient, setFilterClient] = useState('ALL'); // <--- NUEVO ESTADO PARA CLIENTE

  const [viewMode, setViewMode] = useState('list');
  const [uploading, setUploading] = useState(null);

  // Estados Modal
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [formData, setFormData] = useState({ code: '', description: '', unit: 'UN', client_name: '', category: '' });

  useEffect(() => {
    fetchCombinedData();
    fetchExternalClients(); 
  }, []);

  // Resetear el filtro de cliente si cambiamos a "Solo Compras"
  useEffect(() => {
    if (filterType === 'COMPRA') {
      setFilterClient('ALL');
    }
  }, [filterType]);

  const fetchExternalClients = async () => {
    try {
      const { data } = await supabaseProcurement
        .from('proyectos')
        .select('cliente')
        .not('cliente', 'is', null);
      
      const uniqueClients = [...new Set(data?.map(p => p.cliente))].sort();
      setClientsList(uniqueClients);
    } catch (err) {
      console.error("Error cargando clientes externos:", err);
    }
  };

  const fetchCombinedData = async () => {
    try {
      setLoading(true);

      // 1. COMPRAS
      const { data: extData } = await supabaseProcurement
        .from('materiales')
        .select('id, cod, material, item')
        .order('material', { ascending: true });

      const purchaseMaterials = (extData || []).filter(m => {
        if (!m.item) return true;
        return !EXCLUDED_KEYWORDS.some(k => m.item.toLowerCase().includes(k));
      }).map(m => ({
        id: `P-${m.id}`,
        origin_id: m.id,
        code: m.cod,
        name: m.material,
        category: m.item,
        origin: 'COMPRA',
        client: null, // Compras no tiene cliente asignado
        is_editable: false
      }));

      // 2. ASIGNADOS
      const { data: assignData } = await supabase
        .from('assigned_materials')
        .select('*')
        .eq('is_active', true)
        .order('description', { ascending: true });

      const assignedMaterials = (assignData || []).map(m => ({
        id: `A-${m.id}`,
        origin_id: m.id,
        code: m.code,
        name: m.description,
        category: m.category || 'ASIGNADO',
        client: m.client_name,
        origin: 'ASIGNADO',
        is_editable: true,
        unit: m.unit
      }));

      // 3. FOTOS Y STOCK
      const { data: localData } = await supabase
        .from('products')
        .select('code, image_url, current_stock, location');

      const allMaterials = [...purchaseMaterials, ...assignedMaterials].map(item => {
        const localInfo = localData?.find(l => l.code === item.code);
        return {
          ...item,
          image_url: localInfo?.image_url || null,
          current_stock: localInfo?.current_stock || 0,
          location: localInfo?.location || 'Sin asignar'
        };
      });

      setMaterials(allMaterials);

    } catch (error) {
      console.error("Error cargando catálogo:", error);
    } finally {
      setLoading(false);
    }
  };

  // ... Funciones CRUD (handleOpenModal, handleSaveAssigned, etc.) se mantienen igual ...
  const handleOpenModal = (material = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        code: material.code,
        description: material.name,
        unit: material.unit || 'UN',
        client_name: material.client || '',
        category: material.category
      });
    } else {
      setEditingMaterial(null);
      setFormData({ code: '', description: '', unit: 'UN', client_name: '', category: '' });
    }
    setShowModal(true);
  };

  const handleSaveAssigned = async (e) => {
    e.preventDefault();
    if (!formData.client_name) return alert("Selecciona un cliente");
    try {
      const payload = {
        code: formData.code,
        description: formData.description,
        unit: formData.unit,
        client_name: formData.client_name,
        category: formData.category
      };
      if (editingMaterial) {
        await supabase.from('assigned_materials').update(payload).eq('id', editingMaterial.origin_id);
      } else {
        await supabase.from('assigned_materials').insert([payload]);
      }
      setShowModal(false);
      fetchCombinedData();
      alert(editingMaterial ? 'Actualizado' : 'Creado');
    } catch (error) {
      alert('Error al guardar.');
    }
  };

  const handleDeleteAssigned = async (id) => {
    if(!window.confirm('¿Eliminar material?')) return;
    const { error } = await supabase.from('assigned_materials').update({ is_active: false }).eq('id', id);
    if (!error) fetchCombinedData();
  };

  const handleImageUpload = async (event, materialCod, materialName) => {
    try {
      setUploading(materialCod);
      const file = event.target.files[0];
      if (!file) return;
      const fileExt = file.name.split('.').pop();
      const fileName = `${materialCod}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      const { error: uploadError } = await supabase.storage.from('material-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('material-images').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;
      await supabase.from('products').upsert({ code: materialCod, name: materialName, image_url: publicUrl }, { onConflict: 'code' });
      setMaterials(prev => prev.map(m => m.code === materialCod ? { ...m, image_url: publicUrl } : m));
      alert('Imagen actualizada');
    } catch (error) {
      console.error("Error imagen:", error);
    } finally {
      setUploading(null);
    }
  };

  // --- LÓGICA DE FILTRADO ACTUALIZADA ---
  const filteredMaterials = useMemo(() => {
    return materials.filter(item => {
      // 1. Filtro Texto
      const matchesSearch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.code || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Filtro Tipo (Origen)
      const matchesType = filterType === 'ALL' || 
                          (filterType === 'COMPRA' && item.origin === 'COMPRA') ||
                          (filterType === 'ASIGNADO' && item.origin === 'ASIGNADO');

      // 3. Filtro Cliente (Solo aplica si tiene cliente, obvio)
      const matchesClient = filterClient === 'ALL' || item.client === filterClient;

      return matchesSearch && matchesType && matchesClient;
    });
  }, [materials, searchTerm, filterType, filterClient]);


  return (
    <div className="space-y-6">
      
      {/* BUSCADOR */}
      <div className="mb-8">
          <GoogleSearchBar 
              placeholder="¿Qué material buscas? (Ej: Disco, Guantes, 3045...)" 
              onSearch={(val) => setSearchTerm(val)} 
          />
      </div>

      {/* BARRA DE FILTROS Y ACCIONES */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center mb-6">
          <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Filter size={20} className="text-indigo-600"/> Filtros de Catálogo
              </h2>
              <p className="text-xs text-slate-500">
                Mostrando {filteredMaterials.length} materiales
              </p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto">
               
               {/* FILTRO 1: TIPO (Corregido 'value' en lugar de 'selected') */}
               <div className="w-full md:w-48">
                 <Combobox
                    options={[
                      { id: 'ALL', name: 'Todo el Catálogo' },
                      { id: 'COMPRA', name: 'Solo Compras' },
                      { id: 'ASIGNADO', name: 'Solo Asignados' }
                    ]}
                    value={filterType} // <--- CORREGIDO AQUÍ
                    onChange={setFilterType}
                    placeholder="Tipo de Origen"
                 />
               </div>

               {/* FILTRO 2: CLIENTE (Nuevo) */}
               <div className="w-full md:w-56">
                 <Combobox
                    options={[{ id: 'ALL', name: 'Todos los Clientes' }, ...clientsList.map(c => ({ id: c, name: c }))]}
                    value={filterClient}
                    onChange={setFilterClient}
                    placeholder="Filtrar por Cliente"
                    disabled={filterType === 'COMPRA'} // Deshabilitado si es Compra
                    label={filterType === 'COMPRA' ? "No aplica en Compras" : ""} 
                 />
               </div>

                <div className="h-10 w-px bg-slate-200 hidden md:block mx-2"></div>

                {/* BOTONES VISTA */}
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0 self-start md:self-auto">
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ListIcon size={20}/></button>
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={20}/></button>
                </div>

                {/* BOTÓN NUEVO */}
                <button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all active:scale-95 shrink-0 w-full md:w-auto">
                    <Plus size={18} /> Nuevo Asignado
                </button>
          </div>
      </div>

      {/* CONTENIDO (TABLA O GRID) */}
      {loading ? <div className="py-20 text-center"><Loader className="animate-spin mx-auto text-indigo-600" size={40}/><p className="text-slate-400 mt-4 text-sm font-medium">Cargando catálogo maestro...</p></div> : 
        viewMode === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-in fade-in">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 font-bold text-slate-600 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4">Imagen</th>
                            <th className="px-6 py-4">Código</th>
                            <th className="px-6 py-4">Descripción / Categoría</th>
                            <th className="px-6 py-4">Cliente / Origen</th>
                            <th className="px-6 py-4 text-center">Stock Físico</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredMaterials.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center relative border overflow-hidden group">
                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={20} className="text-slate-300"/>}
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                            <Camera size={16} className="text-white"/>
                                            <input type="file" className="hidden" accept="image/*" onChange={(e)=>handleImageUpload(e, item.code, item.name)}/>
                                        </label>
                                        {uploading === item.code && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader size={16} className="animate-spin text-blue-600"/></div>}
                                    </div>
                                </td>
                                <td className="px-6 py-3">
                                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{item.code}</span>
                                </td>
                                <td className="px-6 py-3">
                                    <p className="font-bold text-slate-800">{item.name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">{item.category}</p>
                                </td>
                                <td className="px-6 py-3">
                                    {item.origin==='ASIGNADO' ? (
                                        <div className="flex items-center gap-2">
                                            <Users size={14} className="text-indigo-400"/>
                                            <span className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100">{item.client}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Building size={14} className="text-slate-400"/>
                                            <span className="px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 text-xs font-bold shadow-sm">COMPRA</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-3 text-center">
                                    <span className={`text-sm font-bold ${item.current_stock > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                                        {item.current_stock}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-right">
                                    {item.is_editable && (
                                        <div className="flex justify-end gap-2">
                                            <button onClick={()=>handleOpenModal(item)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-full transition-colors"><Edit size={16}/></button>
                                            <button onClick={()=>handleDeleteAssigned(item.origin_id)} className="p-2 hover:bg-red-50 text-red-600 rounded-full transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr><td colSpan="6" className="py-12 text-center text-slate-400 italic">No se encontraron materiales con estos filtros.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in">
                {filteredMaterials.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 hover:shadow-lg hover:border-blue-200 transition-all group relative">
                        <div className="aspect-square bg-slate-100 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden">
                             {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={32} className="text-slate-300"/>}
                             {item.origin === 'ASIGNADO' && <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">ASIGNADO</div>}
                        </div>
                        <h3 className="font-bold text-sm text-slate-800 line-clamp-2 min-h-[40px] leading-tight mb-1" title={item.name}>{item.name}</h3>
                        <p className="text-xs font-mono text-slate-400 mb-2">{item.code}</p>
                        <div className="flex justify-between items-end border-t pt-2 mt-2">
                             <div className="text-[10px] font-bold uppercase text-slate-400 truncate max-w-[100px]">{item.client || 'COMPRA'}</div>
                             <div className="text-right font-black text-slate-800">{item.current_stock} <span className="text-[9px] font-normal text-slate-400">UN</span></div>
                        </div>
                        {item.is_editable && <button onClick={()=>handleOpenModal(item)} className="absolute top-2 left-2 p-1.5 bg-white/90 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-600"><Edit size={14}/></button>}
                    </div>
                ))}
            </div>
        )
      }

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-slate-800">{editingMaterial ? 'Editar Material' : 'Nuevo Material Asignado'}</h3>
                    <button onClick={()=>setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={20}/></button>
                </div>
                <form onSubmit={handleSaveAssigned} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Cliente Propietario</label>
                        <Combobox
                            options={clientsList.map(c => ({ id: c, name: c }))}
                            value={formData.client_name}
                            onChange={(id) => setFormData({...formData, client_name: id})}
                            placeholder="-- Seleccionar Cliente --"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Este material será exclusivo de este cliente.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Código Interno</label>
                             <input required className="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="Ej: MAT-001" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})}/>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Unidad</label>
                             <input required className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="UN, M, KG..." value={formData.unit} onChange={e=>setFormData({...formData, unit: e.target.value})}/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descripción del Material</label>
                        <input required className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none font-bold" placeholder="Ej: Guantes de Seguridad Nitrilo" value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})}/>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Categoría / Familia</label>
                        <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="Ej: EPP, HERRAMIENTAS..." value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})}/>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 mt-2">
                        {editingMaterial ? 'Guardar Cambios' : 'Crear Material'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}