import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Camera, Image as ImageIcon, Loader, LayoutGrid, List as ListIcon, X } from 'lucide-react';
import { supabaseProcurement } from '../services/procurementClient';
import { supabase } from '../services/supabaseClient';

// 🚫 LISTA NEGRA: Palabras clave para excluir (Servicios e Intangibles)
const EXCLUDED_KEYWORDS = [
  'servicio', 
  'hospedaje', 
  'transporte',
  'viático',
    'combustible',
    'mantenimiento',
    'reparación',
    'consultoría',
    'curos',
  'insumos',
  'arriendo', // Esto elimina "arriendo de bodega", "arriendo camioneta", etc.
  'retroexcavadora', 
  'grua', 
  'sub contrato', 
  'cursos', 
  'examenes', 
  'laboratorio'
];

export default function ProductList() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterItem, setFilterItem] = useState('ALL');
  const [viewMode, setViewMode] = useState('list');
  const [uploading, setUploading] = useState(null);

  useEffect(() => {
    fetchCombinedData();
  }, []);

  const fetchCombinedData = async () => {
    try {
      setLoading(true);

      // 1. Obtener Maestro (Órdenes de Compra)
      const { data: externalMaterials, error: extError } = await supabaseProcurement
        .from('materiales')
        .select('id, cod, material, item')
        .order('material', { ascending: true });

      if (extError) throw extError;

      // --- FILTRADO DE SERVICIOS (LÓGICA NUEVA) ---
      const tangibleMaterials = externalMaterials.filter(m => {
        if (!m.item) return true; // Si no tiene categoría, lo dejamos por seguridad (o cámbialo a false si prefieres)
        const itemLower = m.item.toLowerCase();
        // Si el item contiene alguna palabra prohibida, lo sacamos
        return !EXCLUDED_KEYWORDS.some(keyword => itemLower.includes(keyword));
      });
      // ---------------------------------------------

      // 2. Obtener Datos Locales (Fotos y Stock)
      const { data: localData, error: locError } = await supabase
        .from('products')
        .select('code, image_url, current_stock, location');

      if (locError && locError.code !== 'PGRST116') console.error("Error local:", locError);

      // 3. Fusionar usando la lista ya filtrada (tangibleMaterials)
      const combined = tangibleMaterials.map(extItem => {
        const localInfo = localData?.find(l => l.code === extItem.cod);
        return {
          ...extItem,
          image_url: localInfo?.image_url || null,
          current_stock: localInfo?.current_stock || 0,
          location: localInfo?.location || 'Sin asignar'
        };
      });

      setMaterials(combined);

    } catch (error) {
      console.error("Error cargando catálogo:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event, materialCod, materialName) => {
    try {
      setUploading(materialCod);
      const file = event.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `${materialCod}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('material-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('material-images')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from('products')
        .upsert({ 
            code: materialCod, 
            name: materialName, 
            image_url: publicUrl 
        }, { onConflict: 'code' });

      if (dbError) throw dbError;

      setMaterials(prev => prev.map(m => 
        m.cod === materialCod ? { ...m, image_url: publicUrl } : m
      ));

      alert('Imagen actualizada correctamente');

    } catch (error) {
      console.error("Error subiendo imagen:", error);
      alert('Error al subir la imagen.');
    } finally {
      setUploading(null);
    }
  };

  const uniqueItems = useMemo(() => {
    const items = materials.map(m => m.item).filter(i => i);
    return [...new Set(items)].sort();
  }, [materials]);

  const filteredMaterials = materials.filter(item => {
    const matchesSearch = 
      (item.material || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (item.cod || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterItem === 'ALL' || item.item === filterItem;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Catálogo de Materiales</h2>
           <p className="text-xs text-slate-500">
             Total registros: {materials.length} | Filtrados: {filteredMaterials.length}
           </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 w-full lg:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre o código..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              onChange={(e) => setSearchTerm(e.target.value)}
              value={searchTerm}
            />
            {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                    <X size={16}/>
                </button>
            )}
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <select 
              className="pl-9 pr-8 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 text-sm focus:outline-none w-full md:w-48 appearance-none cursor-pointer hover:bg-slate-100 transition-colors"
              onChange={(e) => setFilterItem(e.target.value)}
              value={filterItem}
            >
              <option value="ALL">Todos los Ítems</option>
              {uniqueItems.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista de Lista"><ListIcon size={18} /></button>
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title="Vista de Galería"><LayoutGrid size={18} /></button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">
            <Loader className="animate-spin mx-auto mb-2" size={32}/> 
            <p>Sincronizando catálogos...</p>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="py-20 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
            <Search className="mx-auto mb-2 opacity-50" size={48}/>
            <p>No se encontraron materiales tangibles.</p>
        </div>
      ) : (
        <>
            {viewMode === 'list' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4 w-20">Imagen</th>
                            <th className="px-6 py-4">Código</th>
                            <th className="px-6 py-4">Material</th>
                            <th className="px-6 py-4">Ítem / Categoría</th>
                            <th className="px-6 py-4 text-center">Stock</th>
                            <th className="px-6 py-4 text-right">Ubicación</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {filteredMaterials.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-3">
                                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden relative shadow-sm">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt="Material" className="w-full h-full object-cover" onError={(e) => { e.target.onerror = null; e.target.src = "https://via.placeholder.com/150?text=No+Img"; e.target.parentElement.classList.add('opacity-50'); }} />
                                    ) : (
                                        <ImageIcon size={20} className="text-slate-300" />
                                    )}
                                    <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        {uploading === item.cod ? <Loader size={16} className="text-white animate-spin"/> : <Camera size={16} className="text-white"/>}
                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, item.cod, item.material)} disabled={uploading === item.cod}/>
                                    </label>
                                    </div>
                                </td>
                                <td className="px-6 py-3 font-mono text-xs text-slate-500">{item.cod}</td>
                                <td className="px-6 py-3 font-medium text-slate-700">{item.material}</td>
                                <td className="px-6 py-3">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                                        {item.item || 'S/N'}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-center">
                                    <span className={`font-bold ${item.current_stock > 0 ? 'text-emerald-600' : 'text-red-400'}`}>
                                        {item.current_stock}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-right text-slate-500 text-xs">
                                    {item.location}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}
            {viewMode === 'grid' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {filteredMaterials.map((item) => (
                        <div key={item.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all group flex flex-col h-full">
                            <div className="aspect-square bg-slate-100 relative overflow-hidden group-hover:border-b border-slate-100">
                                {item.image_url ? (
                                    <img src={item.image_url} alt={item.material} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={(e) => { e.target.onerror = null; e.target.src = "https://via.placeholder.com/150?text=No+Img"; }} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={48} /></div>
                                )}
                                <label className="absolute top-3 right-3 bg-white/90 p-2 rounded-full shadow-sm cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors text-slate-500">
                                    {uploading === item.cod ? <Loader size={16} className="animate-spin"/> : <Camera size={16}/>}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, item.cod, item.material)} disabled={uploading === item.cod}/>
                                </label>
                                <div className={`absolute bottom-3 left-3 px-2 py-1 rounded text-[10px] font-bold shadow-sm ${item.current_stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                    {item.current_stock > 0 ? `${item.current_stock} UN` : 'SIN STOCK'}
                                </div>
                            </div>
                            <div className="p-4 flex flex-col flex-1">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{item.cod}</span>
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide truncate max-w-[100px]">{item.item}</span>
                                </div>
                                <h3 className="font-bold text-slate-800 text-sm leading-tight mb-2 line-clamp-2" title={item.material}>{item.material}</h3>
                                <div className="mt-auto pt-3 border-t border-slate-50 flex justify-between items-center text-xs text-slate-500">
                                    <span className="flex items-center gap-1">📍 {item.location}</span>
                                    <button className="text-blue-600 font-medium hover:underline">Ver Kardex</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
      )}
    </div>
  );
}