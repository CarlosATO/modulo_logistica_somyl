import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Filter, Camera, Image as ImageIcon, Loader, LayoutGrid, 
  List as ListIcon, X, Plus, Edit, Trash2, Save, Building, Users,
  ChevronLeft, ChevronRight, ZoomIn
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
  const [filterClient, setFilterClient] = useState('ALL');

  const [viewMode, setViewMode] = useState('list');
  const [uploading, setUploading] = useState(null);

  // Estados Modal
  const [showModal, setShowModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [formData, setFormData] = useState({ code: '', description: '', unit: 'UN', client_name: '', category: '' });
  
  // Estados Galería Modal
  const [modalImages, setModalImages] = useState([]);
  const [modalImageIndex, setModalImageIndex] = useState(0);
  
  // Estado Lightbox (ver imagen grande)
  const [lightboxImage, setLightboxImage] = useState(null);

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

      // 3. FOTOS Y STOCK (ahora con images array)
      const { data: localData } = await supabase
        .from('products')
        .select('code, image_url, images, current_stock, location');

      const allMaterials = [...purchaseMaterials, ...assignedMaterials].map(item => {
        const localInfo = localData?.find(l => l.code === item.code);
        // Parsear images si es string JSON
        let imagesArray = [];
        if (localInfo?.images) {
          try {
            imagesArray = typeof localInfo.images === 'string' ? JSON.parse(localInfo.images) : localInfo.images;
          } catch { imagesArray = []; }
        }
        // Fallback: si no hay images pero sí image_url, usar ese
        if (imagesArray.length === 0 && localInfo?.image_url) {
          imagesArray = [{ url: localInfo.image_url, path: null }];
        }
        return {
          ...item,
          image_url: localInfo?.image_url || null,
          images: imagesArray,
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

  // Abrir modal y cargar galería del producto
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
      setModalImages(material.images || []);
      setModalImageIndex(0);
    } else {
      setEditingMaterial(null);
      setFormData({ code: '', description: '', unit: 'UN', client_name: '', category: '' });
      setModalImages([]);
      setModalImageIndex(0);
    }
    setShowModal(true);
  };

  const handleSaveAssigned = async (e) => {
    e.preventDefault();
    if (!formData.client_name) return alert("Selecciona un cliente");
    
    // FORZAR MAYÚSCULAS en descripción y código
    const upperDescription = formData.description ? formData.description.toUpperCase() : '';
    const upperCode = formData.code ? formData.code.toUpperCase() : '';
    const upperCategory = formData.category ? formData.category.toUpperCase() : '';
    const upperUnit = formData.unit ? formData.unit.toUpperCase() : 'UN';
    
    try {
      const payload = {
        code: upperCode,
        description: upperDescription,
        unit: upperUnit,
        client_name: formData.client_name,
        category: upperCategory
      };
      
      if (editingMaterial) {
        await supabase.from('assigned_materials').update(payload).eq('id', editingMaterial.origin_id);
        // Actualizar products también
        await supabase.from('products').upsert({ 
          code: upperCode, 
          name: upperDescription, 
          unit: upperUnit,
          images: JSON.stringify(modalImages)
        }, { onConflict: 'code' });
      } else {
        await supabase.from('assigned_materials').insert([payload]);
        // Crear registro en products para poder adjuntar imágenes
        await supabase.from('products').upsert({ 
          code: upperCode, 
          name: upperDescription, 
          unit: upperUnit,
          images: JSON.stringify(modalImages)
        }, { onConflict: 'code' });
      }
      
      setShowModal(false);
      fetchCombinedData();
      alert(editingMaterial ? 'Actualizado' : 'Creado');
    } catch (error) {
      console.error('Error guardando:', error);
      alert('Error al guardar.');
    }
  };

  const handleDeleteAssigned = async (id) => {
    if(!window.confirm('¿Eliminar material?')) return;
    const { error } = await supabase.from('assigned_materials').update({ is_active: false }).eq('id', id);
    if (!error) fetchCombinedData();
  };

  // SUBIR IMÁGENES (galería real)
  const handleImageUpload = async (event, materialCod, materialName) => {
    const upperCode = materialCod?.toUpperCase() || '';
    const upperName = materialName?.toUpperCase() || '';
    
    try {
      setUploading(upperCode);
      const files = Array.from(event.target.files || []);
      if (files.length === 0) {
        alert('No se seleccionó ningún archivo.');
        return;
      }

      // Obtener imágenes actuales del producto
      const { data: prodData } = await supabase.from('products').select('images').eq('code', upperCode).maybeSingle();
      let currentImages = [];
      if (prodData?.images) {
        try {
          currentImages = typeof prodData.images === 'string' ? JSON.parse(prodData.images) : prodData.images;
        } catch { currentImages = []; }
      }

      for (const file of files) {
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${upperCode}-${Date.now()}-${Math.random().toString(36).substr(2,6)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('material-images').upload(fileName, file);
          if (uploadError) throw uploadError;
          
          const { data: publicUrlData } = supabase.storage.from('material-images').getPublicUrl(fileName);
          const publicUrl = publicUrlData?.publicUrl || null;
          
          if (publicUrl) {
            currentImages.push({ url: publicUrl, path: fileName });
          }
        } catch (fileErr) {
          console.error('Error subiendo archivo:', fileErr);
          alert('Error subiendo archivo: ' + (fileErr.message || fileErr));
        }
      }

      // Guardar array actualizado en products
      const mainImageUrl = currentImages.length > 0 ? currentImages[0].url : null;
      await supabase.from('products').upsert({ 
        code: upperCode, 
        name: upperName, 
        image_url: mainImageUrl,
        images: JSON.stringify(currentImages)
      }, { onConflict: 'code' });
      
      // Actualizar estado local
      setMaterials(prev => prev.map(m => m.code === upperCode ? { ...m, image_url: mainImageUrl, images: currentImages } : m));
      setModalImages(currentImages);
      
      alert(`${files.length} imagen(es) subida(s) correctamente`);
    } catch (error) {
      console.error("Error imagen:", error);
      alert('Error al subir imagen. Revisa la consola para más detalles.');
    } finally {
      setUploading(null);
      // Reset input
      event.target.value = '';
    }
  };

  // ELIMINAR UNA IMAGEN de la galería
  const deleteImage = async (materialCod, imageIndex) => {
    const upperCode = materialCod?.toUpperCase() || '';
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    
    try {
      // Obtener imágenes actuales
      const { data: prodData } = await supabase.from('products').select('images, name').eq('code', upperCode).maybeSingle();
      let currentImages = [];
      if (prodData?.images) {
        try {
          currentImages = typeof prodData.images === 'string' ? JSON.parse(prodData.images) : prodData.images;
        } catch { currentImages = []; }
      }
      
      // Eliminar del storage si tiene path
      const imageToDelete = currentImages[imageIndex];
      if (imageToDelete?.path) {
        await supabase.storage.from('material-images').remove([imageToDelete.path]);
      }
      
      // Quitar del array
      currentImages.splice(imageIndex, 1);
      
      // Actualizar BD
      const mainImageUrl = currentImages.length > 0 ? currentImages[0].url : null;
      await supabase.from('products').update({ 
        image_url: mainImageUrl,
        images: JSON.stringify(currentImages)
      }).eq('code', upperCode);
      
      // Actualizar estado
      setMaterials(prev => prev.map(m => m.code === upperCode ? { ...m, image_url: mainImageUrl, images: currentImages } : m));
      setModalImages(currentImages);
      if (modalImageIndex >= currentImages.length) {
        setModalImageIndex(Math.max(0, currentImages.length - 1));
      }
      
      alert('Imagen eliminada');
    } catch (err) {
      console.error('Error eliminando imagen:', err);
      alert('No se pudo eliminar la imagen. Revisa la consola.');
    }
  };

  // Navegar galería
  const nextImage = () => {
    if (modalImages.length > 1) {
      setModalImageIndex((prev) => (prev + 1) % modalImages.length);
    }
  };
  const prevImage = () => {
    if (modalImages.length > 1) {
      setModalImageIndex((prev) => (prev - 1 + modalImages.length) % modalImages.length);
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
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center relative border overflow-hidden group cursor-pointer"
                                         onClick={() => item.images?.length > 0 && setLightboxImage(item.images[0].url)}>
                                        {item.images?.length > 0 ? (
                                          <>
                                            <img src={item.images[0].url} className="w-full h-full object-cover"/>
                                            {item.images.length > 1 && (
                                              <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl">
                                                +{item.images.length - 1}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <ImageIcon size={20} className="text-slate-300"/>
                                        )}
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                                               onClick={(e) => e.stopPropagation()}>
                                          <Camera size={16} className="text-white"/>
                                          <input type="file" className="sr-only" multiple accept="image/*" onChange={(e)=>handleImageUpload(e, item.code, item.name)}/>
                                        </label>
                                        {uploading === item.code?.toUpperCase() && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader size={16} className="animate-spin text-blue-600"/></div>}
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
                                    <div className="flex justify-end gap-2">
                                        <button onClick={()=>handleOpenModal(item)} className="p-2 hover:bg-blue-50 text-blue-600 rounded-full transition-colors" title="Ver / Editar"><Edit size={16}/></button>
                                        {item.is_editable && (
                                            <button onClick={()=>handleDeleteAssigned(item.origin_id)} className="p-2 hover:bg-red-50 text-red-600 rounded-full transition-colors" title="Eliminar"><Trash2 size={16}/></button>
                                        )}
                                    </div>
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
                        <div className="aspect-square bg-slate-100 rounded-lg mb-3 flex items-center justify-center relative overflow-hidden cursor-pointer"
                             onClick={() => item.images?.length > 0 && setLightboxImage(item.images[0].url)}>
                             {item.images?.length > 0 ? (
                               <>
                                 <img src={item.images[0].url} className="w-full h-full object-cover"/>
                                 {item.images.length > 1 && (
                                   <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                                     +{item.images.length - 1} más
                                   </span>
                                 )}
                               </>
                             ) : (
                               <ImageIcon size={32} className="text-slate-300"/>
                             )}
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

      {/* Modal Crear/Editar con Galería */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b bg-slate-50 flex justify-between items-center sticky top-0 z-10">
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
                             <input required className="w-full border rounded-lg px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-100 outline-none uppercase" placeholder="Ej: MAT-001" value={formData.code} onChange={e=>setFormData({...formData, code: e.target.value.toUpperCase()})}/>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Unidad</label>
                             <input required className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none uppercase" placeholder="UN, M, KG..." value={formData.unit} onChange={e=>setFormData({...formData, unit: e.target.value.toUpperCase()})}/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descripción del Material</label>
                        <input required className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none font-bold uppercase" placeholder="Ej: Guantes de Seguridad Nitrilo" value={formData.description} onChange={e=>setFormData({...formData, description: e.target.value.toUpperCase()})}/>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Categoría / Familia</label>
                        <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-100 outline-none uppercase" placeholder="Ej: EPP, HERRAMIENTAS..." value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value.toUpperCase()})}/>
                    </div>

                    {/* GALERÍA DE IMÁGENES */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Galería de Imágenes ({modalImages.length})</label>
                        
                        {/* Carrusel principal */}
                        <div className="relative bg-slate-100 rounded-lg overflow-hidden aspect-video mb-3">
                          {modalImages.length > 0 ? (
                            <>
                              <img 
                                src={modalImages[modalImageIndex]?.url} 
                                className="w-full h-full object-contain cursor-zoom-in"
                                onClick={() => setLightboxImage(modalImages[modalImageIndex]?.url)}
                              />
                              {/* Navegación */}
                              {modalImages.length > 1 && (
                                <>
                                  <button type="button" onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all">
                                    <ChevronLeft size={20}/>
                                  </button>
                                  <button type="button" onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all">
                                    <ChevronRight size={20}/>
                                  </button>
                                </>
                              )}
                              {/* Contador */}
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full">
                                {modalImageIndex + 1} / {modalImages.length}
                              </div>
                              {/* Botón eliminar imagen actual */}
                              <button type="button" onClick={() => deleteImage(formData.code, modalImageIndex)} 
                                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full shadow-lg transition-all">
                                <Trash2 size={16}/>
                              </button>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                              <ImageIcon size={48} className="mb-2"/>
                              <span className="text-sm">Sin imágenes</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Miniaturas */}
                        {modalImages.length > 1 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {modalImages.map((img, idx) => (
                              <button 
                                key={idx} 
                                type="button"
                                onClick={() => setModalImageIndex(idx)}
                                className={`w-16 h-16 rounded-md overflow-hidden border-2 flex-shrink-0 transition-all ${idx === modalImageIndex ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-slate-400'}`}
                              >
                                <img src={img.url} className="w-full h-full object-cover"/>
                              </button>
                            ))}
                          </div>
                        )}
                        
                        {/* Botón subir */}
                        <div className="flex items-center gap-3 mt-3">
                          <label className="inline-flex items-center gap-2 cursor-pointer bg-slate-900 hover:bg-black text-white px-4 py-2.5 rounded-lg transition-all">
                            <Camera size={16}/> 
                            <span className="text-sm font-bold">Agregar Imágenes</span>
                            <input type="file" className="sr-only" multiple accept="image/*" onChange={(e)=>{
                              if (!formData.code) return alert('Completa el Código antes de subir imágenes.');
                              handleImageUpload(e, formData.code, formData.description);
                            }} />
                          </label>
                          {uploading && <Loader size={20} className="animate-spin text-indigo-600"/>}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">Puedes subir varias imágenes. Haz clic en una imagen para verla en grande.</p>
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 mt-4">
                        {editingMaterial ? 'Guardar Cambios' : 'Crear Material'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Lightbox para ver imagen grande */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-red-400 transition-colors" onClick={() => setLightboxImage(null)}>
            <X size={32}/>
          </button>
          <img src={lightboxImage} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}/>
        </div>
      )}
    </div>
  );
}