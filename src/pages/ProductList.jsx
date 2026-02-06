import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Camera, Image as ImageIcon, Loader, LayoutGrid,
  List as ListIcon, X, Plus, Edit, Trash2, Building, Users,
  ChevronLeft, ChevronRight, Eye, CheckCircle2, Box, RotateCcw,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import GoogleSearchBar from '../components/GoogleSearchBar';
import Combobox from '../components/Combobox';
import { supabaseProcurement } from '../services/procurementClient';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

const EXCLUDED_KEYWORDS = ['servicios', 'hospedaje', 'arriendo', 'retroexcavadora', 'grua', 'sub contrato', 'cursos', 'examenes', 'laboratorio'];
const ITEMS_PER_PAGE = 50;

export default function ProductList() {
  const [materials, setMaterials] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ESTADOS DE FILTROS ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, COMPRA, ASIGNADO, RRHH
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

  // --- PAGINACIÓN ---
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchCombinedData();
    fetchExternalClients();
  }, []);

  // Resetear filtros y paginación
  useEffect(() => {
    if (filterType === 'COMPRA') {
      setFilterClient('ALL');
    }
    setCurrentPage(1); // Reset pagina al filtrar
  }, [filterType, filterClient, searchTerm]);

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
        client: null,
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
        origin: 'ASIGNADO',
        is_editable: true,
        unit: m.unit,
        client: m.client_name
      }));

      // 3. FOTOS Y STOCK
      const { data: localData } = await supabase
        .from('products')
        .select('code, image_url, images, current_stock, location, is_rrhh_visible');

      const allMaterials = [...purchaseMaterials, ...assignedMaterials].map(item => {
        const localInfo = localData?.find(l => l.code === item.code);
        let imagesArray = [];
        if (localInfo?.images) {
          try {
            imagesArray = typeof localInfo.images === 'string' ? JSON.parse(localInfo.images) : localInfo.images;
          } catch { imagesArray = []; }
        }
        if (imagesArray.length === 0 && localInfo?.image_url) {
          imagesArray = [{ url: localInfo.image_url, path: null }];
        }
        return {
          ...item,
          image_url: localInfo?.image_url || null,
          images: imagesArray,
          current_stock: localInfo?.current_stock || 0,
          location: localInfo?.location || 'Sin asignar',
          is_rrhh_visible: localInfo?.is_rrhh_visible || false
        };
      });

      setMaterials(allMaterials);

    } catch (error) {
      console.error("Error cargando catálogo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (material = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        code: material.code,
        description: material.name,
        unit: material.unit || 'UN',
        client_name: material.client || '',
        category: material.category,
        is_rrhh_visible: material.is_rrhh_visible || false
      });
      setModalImages(material.images || []);
      setModalImageIndex(0);
    } else {
      setEditingMaterial(null);
      setFormData({ code: '', description: '', unit: 'UN', client_name: '', category: '', is_rrhh_visible: false });
      setModalImages([]);
      setModalImageIndex(0);
    }
    setShowModal(true);
  };

  const handleSaveAssigned = async (e) => {
    e.preventDefault();
    if (editingMaterial && !editingMaterial.is_editable) {
      try {
        const { error } = await supabase.from('products').upsert({
          code: editingMaterial.code,
          is_rrhh_visible: formData.is_rrhh_visible,
          name: editingMaterial.name,
          images: JSON.stringify(modalImages)
        }, { onConflict: 'code' });

        if (error) throw error;
        setShowModal(false);
        fetchCombinedData();
        toast.success('Configuración actualizada');
      } catch (err) {
        console.error(err);
        toast.error('Error al guardar configuración');
      }
      return;
    }

    if (!formData.client_name) return toast.error("Selecciona un cliente");
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
        const { error: assignError } = await supabase.from('assigned_materials').update(payload).eq('id', editingMaterial.origin_id);
        if (assignError) throw assignError;

        const { error: prodError } = await supabase.from('products').upsert({
          code: upperCode,
          name: upperDescription,
          unit: upperUnit,
          images: JSON.stringify(modalImages),
          is_rrhh_visible: formData.is_rrhh_visible
        }, { onConflict: 'code' });
        if (prodError) throw prodError;

      } else {
        const { error: assignError } = await supabase.from('assigned_materials').insert([payload]);
        if (assignError) throw assignError;

        const { error: prodError } = await supabase.from('products').upsert({
          code: upperCode,
          name: upperDescription,
          unit: upperUnit,
          images: JSON.stringify(modalImages),
          is_rrhh_visible: formData.is_rrhh_visible
        }, { onConflict: 'code' });
        if (prodError) throw prodError;
      }

      setShowModal(false);
      fetchCombinedData();
      toast.success(editingMaterial ? 'Material actualizado' : 'Material creado');
    } catch (error) {
      console.error('Error guardando:', error);
      toast.error('Error al guardar');
    }
  };

  const handleDeleteAssigned = async (id) => {
    if (!window.confirm('¿Eliminar material?')) return;
    const { error } = await supabase.from('assigned_materials').update({ is_active: false }).eq('id', id);
    if (!error) {
      fetchCombinedData();
      toast.success('Material eliminado');
    }
  };

  const handleImageUpload = async (event, materialCod, materialName) => {
    const upperCode = materialCod?.toUpperCase() || '';
    const upperName = materialName?.toUpperCase() || '';
    try {
      setUploading(upperCode);
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

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
          const fileName = `${upperCode}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('material-images').upload(fileName, file);
          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage.from('material-images').getPublicUrl(fileName);
          const publicUrl = publicUrlData?.publicUrl || null;
          if (publicUrl) currentImages.push({ url: publicUrl, path: fileName });
        } catch (fileErr) {
          console.error('Error subiendo archivo:', fileErr);
          toast.error('Error subiendo un archivo');
        }
      }

      const mainImageUrl = currentImages.length > 0 ? currentImages[0].url : null;
      await supabase.from('products').upsert({
        code: upperCode,
        name: upperName,
        image_url: mainImageUrl,
        images: JSON.stringify(currentImages)
      }, { onConflict: 'code' });

      setMaterials(prev => prev.map(m => m.code === upperCode ? { ...m, image_url: mainImageUrl, images: currentImages } : m));
      setModalImages(currentImages);
      toast.success(`${files.length} imagen(es) subida(s)`);
    } catch (error) {
      console.error("Error imagen:", error);
      toast.error('Error general al subir imágenes');
    } finally {
      setUploading(null);
      event.target.value = '';
    }
  };

  const deleteImage = async (materialCod, imageIndex) => {
    const upperCode = materialCod?.toUpperCase() || '';
    if (!window.confirm('¿Eliminar esta imagen?')) return;
    try {
      const { data: prodData } = await supabase.from('products').select('images, name').eq('code', upperCode).maybeSingle();
      let currentImages = [];
      if (prodData?.images) {
        try {
          currentImages = typeof prodData.images === 'string' ? JSON.parse(prodData.images) : prodData.images;
        } catch { currentImages = []; }
      }

      const imageToDelete = currentImages[imageIndex];
      if (imageToDelete?.path) await supabase.storage.from('material-images').remove([imageToDelete.path]);
      currentImages.splice(imageIndex, 1);

      const mainImageUrl = currentImages.length > 0 ? currentImages[0].url : null;
      await supabase.from('products').update({
        image_url: mainImageUrl,
        images: JSON.stringify(currentImages)
      }).eq('code', upperCode);

      setMaterials(prev => prev.map(m => m.code === upperCode ? { ...m, image_url: mainImageUrl, images: currentImages } : m));
      setModalImages(currentImages);
      if (modalImageIndex >= currentImages.length) setModalImageIndex(Math.max(0, currentImages.length - 1));
      toast.success('Imagen eliminada');
    } catch (err) {
      console.error('Error eliminando imagen:', err);
      toast.error('Error al eliminar imagen');
    }
  };

  const handleToggleRRHH = async (item, newValue) => {
    setMaterials(prev => prev.map(m => m.code === item.code ? { ...m, is_rrhh_visible: newValue } : m));
    try {
      const { data: existing } = await supabase.from('products').select('*').eq('code', item.code).maybeSingle();
      const payload = {
        code: item.code,
        name: item.name,
        is_rrhh_visible: newValue,
        ...(existing ? {} : { unit: item.unit || 'UN' })
      };
      const { error: upsertError } = await supabase.from('products').upsert(payload, { onConflict: 'code' });
      if (upsertError) throw upsertError;
      toast.success(newValue ? 'Disponible para RRHH' : 'Oculto de RRHH');
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar');
      setMaterials(prev => prev.map(m => m.code === item.code ? { ...m, is_rrhh_visible: !newValue } : m));
    }
  };

  const nextImage = () => { if (modalImages.length > 1) setModalImageIndex((prev) => (prev + 1) % modalImages.length); };
  const prevImage = () => { if (modalImages.length > 1) setModalImageIndex((prev) => (prev - 1 + modalImages.length) % modalImages.length); };

  const filteredMaterials = useMemo(() => {
    return materials.filter(item => {
      const matchesSearch = (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.code || '').toLowerCase().includes(searchTerm.toLowerCase());
      let matchesType = true;
      if (filterType === 'RRHH') matchesType = item.is_rrhh_visible === true;
      else if (filterType === 'COMPRA') matchesType = item.origin === 'COMPRA';
      else if (filterType === 'ASIGNADO') matchesType = item.origin === 'ASIGNADO';
      const matchesClient = filterClient === 'ALL' || item.client === filterClient;
      return matchesSearch && matchesType && matchesClient;
    });
  }, [materials, searchTerm, filterType, filterClient]);

  const clearFilters = () => {
    setFilterType('ALL');
    setFilterClient('ALL');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleExportExcel = () => {
    // 1. Preparar datos
    const exportData = filteredMaterials.map(item => ({
      'Código': item.code,
      'Descripción': item.name,
      'Categoría': item.category,
      'Origen': item.origin,
      'Cliente': item.client || 'N/A',
      'Unidad': item.unit || 'UN',
      'Stock Físico': item.current_stock,
      'Disponible EPPs/Cargos': item.is_rrhh_visible ? 'SÍ' : 'NO'
    }));

    // 2. Crear Worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // 3. Ajustar anchos de columna (opcional pero recomendado)
    const wscols = [
      { wch: 15 }, // Código
      { wch: 40 }, // Descripción
      { wch: 20 }, // Categoría
      { wch: 10 }, // Origen
      { wch: 20 }, // Cliente
      { wch: 8 },  // Unidad
      { wch: 10 }, // Stock
      { wch: 12 }, // RRHH
    ];
    worksheet['!cols'] = wscols;

    // 4. Crear Workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Catálogo");

    // 5. Descargar archivo
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Catalogo_Somyl_${dateStr}.xlsx`);
    toast.success("Excel exportado correctamente");
  };

  // --- CALCULO PAGINACIÓN ---
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = filteredMaterials.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredMaterials.length / ITEMS_PER_PAGE);

  return (
    <div className="space-y-3 font-sans text-slate-800">

      {/* HEADER: BUSCADOR + ACCIONES */}
      <div className="flex flex-col lg:flex-row gap-2 items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
        <div className="w-full lg:flex-1">
          <GoogleSearchBar
            placeholder="Buscar material (Código, Nombre...)"
            onSearch={(val) => setSearchTerm(val)}
            className="w-full"
          />
        </div>

        <div className="flex w-full lg:w-auto gap-2 items-center justify-start lg:justify-end overflow-x-auto lg:overflow-visible no-scrollbar">
          {/* BOTÓN EXCEL */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95 whitespace-nowrap shrink-0"
            title="Exportar lista filtrada a Excel"
          >
            <FileSpreadsheet size={14} /> Excel
          </button>

          {(filterType !== 'ALL' || filterClient !== 'ALL' || searchTerm) && (
            <button onClick={clearFilters} className="text-slate-400 hover:text-red-500 p-1.5 rounded-full hover:bg-slate-50 transition-colors" title="Limpiar Filtros">
              <RotateCcw size={14} />
            </button>
          )}

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-white focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer transition-all w-32 md:w-auto"
          >
            <option value="ALL">Todo el Catálogo</option>
            <option value="RRHH">Solo EPPs/Cargos</option>
            <option value="COMPRA">Solo Compras</option>
            <option value="ASIGNADO">Solo Asignados</option>
          </select>

          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            disabled={filterType === 'COMPRA'}
            className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-white focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer transition-all w-32 md:w-auto disabled:opacity-50"
          >
            <option value="ALL">Todos los Clientes</option>
            {clientsList.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ListIcon size={16} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={16} /></button>
          </div>

          <button onClick={() => handleOpenModal()} className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow transition-all active:scale-95 whitespace-nowrap">
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 h-4">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
          {filteredMaterials.length} Items Encontrados
        </p>
        {/* INDICADOR DE PAGINA ARRIBA TAMBIEN */}
        {totalPages > 1 && (
          <span className="text-[10px] text-slate-400">
            Pag {currentPage} de {totalPages}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <Loader className="animate-spin mx-auto text-indigo-600 mb-2" size={24} />
          <p className="text-slate-400 text-xs font-medium">Cargando...</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2 w-12 text-center"></th>
                  <th className="px-2 py-2 w-24">Código</th>
                  <th className="px-2 py-2">Descripción</th>
                  <th className="px-2 py-2 w-32">Origen / Cliente</th>
                  <th className="px-2 py-2 w-16 text-center">EPPs/Cargos</th>
                  <th className="px-2 py-2 w-20 text-center">Stock</th>
                  <th className="px-2 py-2 w-16 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
                {currentItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-3 py-1.5">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center relative border border-slate-200 overflow-hidden cursor-pointer"
                        onClick={() => item.images?.length > 0 && setLightboxImage(item.images[0].url)}>
                        {item.images?.length > 0 ? (
                          <img src={item.images[0].url} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <ImageIcon size={12} className="text-slate-300" />
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-all"
                          onClick={(e) => e.stopPropagation()}>
                          <Camera size={12} className="text-white drop-shadow-md" />
                          <input type="file" className="sr-only" multiple accept="image/*" onChange={(e) => handleImageUpload(e, item.code, item.name)} />
                        </label>
                        {uploading === item.code?.toUpperCase() && <div className="absolute inset-0 bg-white/90 flex items-center justify-center"><Loader size={12} className="animate-spin text-blue-600" /></div>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.5 rounded border border-slate-200 block w-fit">
                        {item.code}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <p className="font-bold text-slate-700 text-xs line-clamp-1" title={item.name}>{item.name}</p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5 flex items-center gap-1 opacity-70">{item.category}</p>
                    </td>
                    <td className="px-2 py-1.5">
                      {item.origin === 'ASIGNADO' ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold border border-indigo-100 truncate w-fit">
                          <Users size={8} /> {item.client}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                          <Building size={8} /> COMPRA
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <div className="flex justify-center">
                        <label className={`flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 cursor-pointer transition-all ${item.is_rrhh_visible ? 'bg-purple-50' : ''}`} title={item.is_rrhh_visible ? "Deshabilitar EPPs/Cargos" : "Habilitar EPPs/Cargos"}>
                          <input
                            type="checkbox"
                            className="w-3.5 h-3.5 rounded text-purple-600 border-slate-300 focus:ring-purple-500 cursor-pointer"
                            checked={item.is_rrhh_visible}
                            onChange={(e) => handleToggleRRHH(item, e.target.checked)}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.current_stock > 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'text-slate-300'}`}>
                        {item.current_stock}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => handleOpenModal(item)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar / Ver">
                        {item.is_editable ? <Edit size={14} /> : <Eye size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredMaterials.length === 0 && (
                  <tr><td colSpan="7" className="py-12 text-center text-slate-400 italic font-medium">No hay coincidencia.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 animate-in fade-in">
          {currentItems.map(item => (
            <div key={item.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-md hover:border-indigo-200 transition-all group flex flex-col h-full relative">
              <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden cursor-pointer"
                onClick={() => item.images?.length > 0 && setLightboxImage(item.images[0].url)}>
                {item.images?.length > 0 ? (
                  <img src={item.images[0].url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-200">
                    <ImageIcon size={20} />
                  </div>
                )}
                {item.origin === 'ASIGNADO' && (
                  <span className="absolute top-1 right-1 bg-white/90 text-indigo-700 text-[8px] font-bold px-1 py-0.5 rounded shadow-sm">ASIG</span>
                )}
                {item.is_rrhh_visible && (
                  <div className="absolute bottom-1 right-1 bg-purple-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                    <CheckCircle2 size={8} /> EPP
                  </div>
                )}
              </div>
              <div className="p-2 flex flex-col flex-1 gap-1">
                <h3 className="font-bold text-[11px] text-slate-700 bg-transparent line-clamp-2 leading-tight" title={item.name}>{item.name}</h3>
                <p className="text-[9px] font-mono text-slate-400 truncate">{item.code}</p>
                <div className="mt-auto flex items-center justify-between pt-2 border-t border-slate-50">
                  <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[60%]">{item.client || 'COMPRA'}</span>
                  <span className={`text-[9px] font-bold ${item.current_stock > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{item.current_stock} UN</span>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }}
                className="absolute top-2 left-2 p-1 bg-white/90 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all hover:text-blue-600 hover:scale-110 z-10"
              >
                <Edit size={10} />
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

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-xl shrink-0">
              <h3 className="font-bold text-sm text-slate-800">{editingMaterial ? 'Editar Material' : 'Nuevo Material'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 transition-colors p-1"><X size={18} /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">
              <form id="material-form" onSubmit={handleSaveAssigned} className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                  <input type="checkbox" id="is_rrhh_visible_modal" className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" checked={formData.is_rrhh_visible} onChange={e => setFormData({ ...formData, is_rrhh_visible: e.target.checked })} />
                  <div className="flex flex-col">
                    <label htmlFor="is_rrhh_visible_modal" className="text-xs font-bold text-indigo-900 cursor-pointer select-none">Disponible para EPPs/Cargos</label>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Cliente</label>
                  <Combobox options={clientsList.map(c => ({ id: c, name: c }))} value={formData.client_name} onChange={(id) => setFormData({ ...formData, client_name: id })} placeholder="-- Seleccionar --" disabled={editingMaterial && !editingMaterial.is_editable} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Código</label>
                    <input required className="w-full border rounded-lg px-3 py-2 text-xs" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })} disabled={editingMaterial && !editingMaterial.is_editable} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Unidad</label>
                    <input required className="w-full border rounded-lg px-3 py-2 text-xs" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value.toUpperCase() })} disabled={editingMaterial && !editingMaterial.is_editable} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Descripción</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-xs" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value.toUpperCase() })} disabled={editingMaterial && !editingMaterial.is_editable} />
                </div>
                {/* Galeria omitida por brevedad en codigo repetitivo, asumiendo funcionalidad igual al paso anterior */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Galería</label>
                  <div className="relative bg-slate-100 rounded-lg overflow-hidden aspect-video border border-slate-200">
                    {modalImages.length > 0 ? (
                      <>
                        <img src={modalImages[modalImageIndex]?.url} className="w-full h-full object-contain" />
                        {modalImages.length > 1 && (
                          <div className="absolute inset-x-0 bottom-0 p-2 flex justify-center gap-1 bg-black/10">
                            {modalImages.map((_, idx) => (<div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === modalImageIndex ? 'bg-white' : 'bg-white/40'}`} />))}
                          </div>
                        )}
                        <button type="button" onClick={() => deleteImage(formData.code, modalImageIndex)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded"><Trash2 size={12} /></button>
                        {modalImages.length > 1 && (<><button type="button" onClick={prevImage} className="absolute left-2 top-1/2 bg-white/80 p-1 rounded-full"><ChevronLeft size={16} /></button><button type="button" onClick={nextImage} className="absolute right-2 top-1/2 bg-white/80 p-1 rounded-full"><ChevronRight size={16} /></button></>)}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-400"><ImageIcon size={32} /></div>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer bg-white border border-slate-200 px-3 py-1.5 rounded text-xs"><Camera size={14} /> Subir <input type="file" className="sr-only" multiple accept="image/*" onChange={(e) => handleImageUpload(e, formData.code, formData.description)} /></label>
                  </div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t bg-slate-50 rounded-b-xl shrink-0">
              <button form="material-form" type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-indigo-100 transition-all active:scale-95">
                {editingMaterial && !editingMaterial.is_editable ? 'Guardar Configuración' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-red-400 transition-colors" onClick={() => setLightboxImage(null)}><X size={32} /></button>
          <img src={lightboxImage} className="max-w-full max-h-full object-contain rounded shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}