import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Filter, Camera, Image as ImageIcon, Loader, LayoutGrid, 
  List as ListIcon, X, Plus, Edit, Trash2, Save, Building
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar';
import { supabaseProcurement } from '../services/procurementClient';
import { supabase } from '../services/supabaseClient';

const EXCLUDED_KEYWORDS = ['servicios', 'hospedaje', 'arriendo', 'retroexcavadora', 'grua', 'sub contrato', 'cursos', 'examenes', 'laboratorio'];

export default function ProductList() {
  const [materials, setMaterials] = useState([]);
  const [clientsList, setClientsList] = useState([]); // Clientes externos
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); 
  const [viewMode, setViewMode] = useState('list');
  const [uploading, setUploading] = useState(null);

  // Estados Modal
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [formData, setFormData] = useState({ code: '', description: '', unit: 'UN', client_name: '', category: '' });

  useEffect(() => {
    fetchCombinedData();
    fetchExternalClients(); // <--- Cargar clientes desde Proyectos
  }, []);

  // --- NUEVO: Obtener clientes únicos desde la BD Externa ---
  const fetchExternalClients = async () => {
    try {
      const { data } = await supabaseProcurement
        .from('proyectos')
        .select('cliente')
        .not('cliente', 'is', null);
      
      // Filtrar únicos y ordenar
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

  // ... (Resto de funciones CRUD e Imágenes igual que antes) ...
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
    // ... (Mismo código de imagen anterior) ...
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

  const filteredMaterials = materials.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (item.code || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || 
                        (filterType === 'COMPRA' && item.origin === 'COMPRA') ||
                        (filterType === 'ASIGNADO' && item.origin === 'ASIGNADO');
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
          {/* --- BUSCADOR MODERNO --- */}
      <div className="mb-8">
          <GoogleSearchBar 
              placeholder="¿Qué material buscas? (Ej: Disco, Guantes, 3045...)" 
              onSearch={(val) => setSearchTerm(val)} // <--- Conecta directo con tu estado existente
          />
      </div>

      {/* Header con Filtros (Simplificado) */}
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-center mb-6">
          <div>
              <h2 className="text-xl font-bold text-slate-800">Maestro de Materiales</h2>
              <p className="text-xs text-slate-500">Unificado: Compras + Asignados</p>
          </div>
          <div className="flex gap-3">
               {/* ... (Mantén tus selectores de filtros y botones de vista aquí) ... */}
               <select className="px-3 py-2 border rounded-lg bg-slate-50 text-slate-700 text-sm" onChange={(e) => setFilterType(e.target.value)}>
                  <option value="ALL">Todo el Catálogo</option>
                  <option value="COMPRA">Solo Compras</option>
                  <option value="ASIGNADO">Solo Asignados</option>
                </select>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                  <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><ListIcon size={18}/></button>
                  <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><LayoutGrid size={18}/></button>
                </div>
                <button onClick={() => handleOpenModal()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-sm shrink-0"><Plus size={18} /> Asignado</button>
          </div>
      </div>

      {/* Contenido (Tabla/Grid) - Simplificado para el ejemplo, es igual al anterior */}
      {loading ? <div className="py-20 text-center"><Loader className="animate-spin mx-auto"/></div> : 
        viewMode === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 font-medium"><tr><th className="px-6 py-4">Foto</th><th className="px-6 py-4">Código</th><th className="px-6 py-4">Descripción</th><th className="px-6 py-4">Cliente/Origen</th><th className="px-6 py-4 text-center">Stock</th><th className="px-6 py-4 text-right"></th></tr></thead>
                    <tbody>
                        {filteredMaterials.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50 border-b last:border-0">
                                <td className="px-6 py-3"><div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center relative">{item.image_url ? <img src={item.image_url} className="w-full h-full object-cover rounded"/> : <ImageIcon size={16}/>}
                                <label className="absolute inset-0 cursor-pointer opacity-0"><input type="file" className="hidden" accept="image/*" onChange={(e)=>handleImageUpload(e, item.code, item.name)}/></label></div></td>
                                <td className="px-6 py-3 font-mono text-xs">{item.code}</td>
                                <td className="px-6 py-3 font-medium">{item.name}</td>
                                <td className="px-6 py-3">{item.origin==='ASIGNADO' ? <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-bold">{item.client}</span> : <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-bold">COMPRA</span>}</td>
                                <td className="px-6 py-3 text-center font-bold">{item.current_stock}</td>
                                <td className="px-6 py-3 text-right">{item.is_editable && <div className="flex justify-end gap-2"><button onClick={()=>handleOpenModal(item)} className="text-blue-600"><Edit size={16}/></button><button onClick={()=>handleDeleteAssigned(item.origin_id)} className="text-red-600"><Trash2 size={16}/></button></div>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {filteredMaterials.map(item => (
                    <div key={item.id} className="bg-white p-4 rounded-xl border hover:shadow-md">
                        <div className="aspect-square bg-slate-100 rounded mb-3 flex items-center justify-center relative overflow-hidden">{item.image_url ? <img src={item.image_url} className="w-full h-full object-cover"/> : <ImageIcon size={32} className="text-slate-300"/>}</div>
                        <h3 className="font-bold text-sm truncate">{item.name}</h3>
                        <p className="text-xs text-slate-500">{item.code}</p>
                    </div>
                ))}
            </div>
        )
      }

      {/* Modal Crear */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200">
                <div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold">Material Asignado</h3><button onClick={()=>setShowModal(false)}><X size={20}/></button></div>
                <form onSubmit={handleSaveAssigned} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Cliente (Fuente: Proyectos)</label>
                        <select required className="w-full border rounded-lg px-3 py-2 bg-slate-50" value={formData.client_name} onChange={e=>setFormData({...formData, client_name: e.target.value})}>
                            <option value="">-- Seleccionar --</option>
                            {clientsList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    {/* ... Resto de inputs iguales ... */}
                    <input required className="w-full border rounded px-3 py-2 font-mono" placeholder="Código" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value})}/>
                    <input required className="w-full border rounded px-3 py-2" placeholder="Descripción" value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value})}/>
                    <input className="w-full border rounded px-3 py-2" placeholder="Categoría" value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})}/>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold">Guardar</button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}