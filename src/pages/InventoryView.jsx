import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Package, TrendingUp, TrendingDown, Warehouse, ArrowLeft, 
  Search, History, Download, Calendar, MapPin, X 
} from 'lucide-react';
import * as XLSX from 'xlsx';

const InventoryView = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // --- ESTADOS (Lógica sin cambios) ---
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('STOCK'); 
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]); 
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [stockData, setStockData] = useState([]); 
  const [kardexData, setKardexData] = useState([]);     
  const [dateRange, setDateRange] = useState({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], 
      end: new Date().toISOString().split('T')[0]
  });

  // --- LOGICA DE DATOS (Mantiene funcionalidad perfecta) ---
  useEffect(() => {
      const loadInit = async () => {
          if (!user) return;
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          if (profile) {
              const { data } = await supabase.from('logis_warehouses')
                  .select('id, name')
                  .eq('organization_id', profile.organization_id)
                  .eq('is_active', true)
                  .order('name');
              setWarehouses(data || []);
              if(data?.[0]) setSelectedWarehouse(data[0].id);
          }
      };
      loadInit();
  }, [user]);

  useEffect(() => {
      const searchProduct = async () => {
          if (searchTerm.length < 3) { setSearchResults([]); return; }
          if (selectedProduct && (selectedProduct.name === searchTerm || selectedProduct.sku === searchTerm)) return;
          const { data } = await supabase.from('logis_products').select('id, name, sku, category, unit, min_stock').or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`).limit(5);
          setSearchResults(data || []);
      };
      const delay = setTimeout(searchProduct, 500);
      return () => clearTimeout(delay);
  }, [searchTerm, selectedProduct]);

  const fetchData = useCallback(async () => {
      if (!selectedProduct) return;
      setLoading(true);
      try {
          if (activeTab === 'STOCK') {
              const { data, error } = await supabase.from('logis_inventory').select(`current_stock, last_updated, warehouse:warehouse_id (name), location:location_id (zone, full_code)`).eq('product_id', selectedProduct.id).gt('current_stock', 0).order('warehouse_id');
              if (error) throw error;
              setStockData(data || []);
          } else {
              if (!selectedWarehouse) return;
              const { data, error } = await supabase.from('logis_movements').select(`created_at, movement_type, quantity, comments, location:location_id (zone, full_code), user:profiles (email)`).eq('product_id', selectedProduct.id).eq('warehouse_id', selectedWarehouse).gte('created_at', `${dateRange.start}T00:00:00`).lte('created_at', `${dateRange.end}T23:59:59`).order('created_at', { ascending: false }); 
              if (error) throw error;
              const safeData = (data || []).map(item => ({ ...item, user: item.user || { email: 'Desconocido' } }));
              setKardexData(safeData);
          }
      } catch (error) { console.error("Error:", error); } finally { setLoading(false); }
  }, [selectedProduct, activeTab, selectedWarehouse, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // --- HANDLERS ---
  const handleSelectProduct = (product) => { setSelectedProduct(product); setSearchTerm(`${product.sku} - ${product.name}`); setSearchResults([]); };
  const handleClearSearch = () => { setSearchTerm(''); setSelectedProduct(null); setStockData([]); setKardexData([]); };
  const handleExport = () => {
      if ((activeTab === 'STOCK' && stockData.length === 0) || (activeTab === 'KARDEX' && kardexData.length === 0)) return alert("Sin datos.");
      const fileName = activeTab === 'STOCK' ? `Stock_${selectedProduct.sku}.xlsx` : `Kardex_${selectedProduct.sku}.xlsx`;
      const dataToExport = activeTab === 'STOCK' ? stockData.map(i => ({ Bodega: i.warehouse?.name, Zona: i.location?.zone, Ubicación: i.location?.full_code, Cantidad: i.current_stock })) : kardexData.map(m => ({ Fecha: new Date(m.created_at).toLocaleString(), Tipo: m.movement_type, Cantidad: m.quantity, Usuario: m.user?.email }));
      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Datos");
      XLSX.writeFile(wb, fileName);
  };
  const getTypeBadge = (type) => {
      const styles = { IN: "bg-emerald-100 text-emerald-700", OUT: "bg-rose-100 text-rose-700", TRANSFER_IN: "bg-blue-100 text-blue-700", TRANSFER_OUT: "bg-orange-100 text-orange-700", RETURN: "bg-purple-100 text-purple-700" };
      return <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${styles[type] || "bg-gray-100 text-gray-700"}`}>{type}</span>;
  };

  // --- RENDERIZADO AJUSTADO A IMAGEN REFERENCIA ---
  return (
    <div className="flex flex-col h-full bg-stone-50">

        {/* --- 2. CONTENIDO PRINCIPAL --- */}
        <div className="max-w-7xl mx-auto w-full p-8">
            
            {/* BARRA DE ACCIONES (Movida fuera del Topbar) */}
            <div className="flex justify-end gap-3 mb-6">
                <button 
                    onClick={() => navigate('/inbound/create')} 
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow font-medium transition-all"
                >
                    <TrendingUp size={18}/> 
                    Registrar Ingreso
                </button>
                <button 
                    onClick={() => navigate('/outbound/create')} 
                    className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow font-medium transition-all"
                >
                    <TrendingDown size={18}/> 
                    Registrar Salida
                </button>
            </div>

            {/* PANEL DE BUSQUEDA + FILTROS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                    
                    {/* BUSCADOR */}
                    <div className="md:col-span-8 relative">
                        <label className="text-xs font-bold text-stone-500 uppercase mb-2 block tracking-wide">Buscar Producto</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-3 text-stone-400" size={20} />
                            <input 
                                type="text" 
                                className="w-full pl-12 pr-10 py-3 bg-stone-50 border border-stone-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none transition-all font-medium text-stone-700 text-sm"
                                placeholder="Escribe nombre del material, herramienta o SKU..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button onClick={handleClearSearch} className="absolute right-4 top-3 text-stone-400 hover:text-stone-600">
                                    <X size={20} />
                                </button>
                            )}
                        </div>
                        {/* SUGERENCIAS */}
                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50">
                                {searchResults.map(prod => (
                                    <div key={prod.id} onClick={() => handleSelectProduct(prod)} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-stone-50 flex justify-between items-center group">
                                        <div>
                                            <div className="font-bold text-stone-800 text-sm">{prod.name}</div>
                                            <div className="text-xs text-stone-500 font-mono">{prod.sku}</div>
                                        </div>
                                        <span className="text-[10px] bg-stone-100 px-2 py-1 rounded text-stone-600">{prod.unit}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* SELECTOR BODEGA */}
                    <div className="md:col-span-4">
                         <label className="text-xs font-bold text-stone-500 uppercase mb-2 block tracking-wide">
                            Bodega {activeTab === 'STOCK' ? '(Opcional)' : '(Requerida)'}
                         </label>
                         <div className="relative">
                            <Warehouse className="absolute left-4 top-3 text-stone-400" size={20} />
                            <select 
                                className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-lg outline-none font-medium text-stone-700 cursor-pointer focus:border-orange-500 text-sm appearance-none"
                                value={selectedWarehouse}
                                onChange={(e) => setSelectedWarehouse(e.target.value)}
                            >
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                         </div>
                    </div>
                </div>
            </div>

            {/* AREA DE RESULTADOS */}
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 min-h-[400px]">
                
                {/* TABS HEADER */}
                <div className="border-b border-stone-200 px-6 py-4 bg-stone-50/30 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="flex bg-stone-100 p-1.5 rounded-lg border border-stone-200">
                        <button onClick={() => setActiveTab('STOCK')} className={`px-5 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'STOCK' ? 'bg-white text-stone-800 shadow-sm border border-stone-100' : 'text-stone-500 hover:text-stone-700'}`}>
                            <Package size={16}/> Existencias
                        </button>
                        <button onClick={() => setActiveTab('KARDEX')} className={`px-5 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'KARDEX' ? 'bg-white text-stone-800 shadow-sm border border-stone-100' : 'text-stone-500 hover:text-stone-700'}`}>
                            <History size={16}/> Movimientos
                        </button>
                    </div>

                    {/* Controles del Kardex */}
                    {selectedProduct && (
                        <div className="flex items-center gap-3 animate-fade-in">
                            {activeTab === 'KARDEX' && (
                                 <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-lg p-2 px-3 shadow-sm h-10">
                                    <Calendar size={16} className="text-stone-400"/>
                                    <input type="date" className="text-xs outline-none text-stone-600 bg-transparent font-medium" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
                                    <span className="text-stone-300">-</span>
                                    <input type="date" className="text-xs outline-none text-stone-600 bg-transparent font-medium" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
                                </div>
                            )}
                            <button onClick={handleExport} className="h-10 px-4 bg-white border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 hover:text-orange-600 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm">
                                <Download size={16}/> Exportar
                            </button>
                        </div>
                    )}
                </div>

                {/* ESTADO VACIO (Placeholder) */}
                {!selectedProduct && (
                    <div className="flex flex-col items-center justify-center h-96 text-stone-300">
                        <div className="bg-stone-50 p-8 rounded-full mb-6 border border-stone-100">
                            <Search size={64} className="text-stone-200"/>
                        </div>
                        <h3 className="text-xl font-bold text-stone-400 mb-2">Sin Producto Seleccionado</h3>
                        <p className="text-sm text-stone-400">Utiliza el buscador superior para consultar stock o historial</p>
                    </div>
                )}

                {/* VISTA STOCK (TABLA) */}
                {selectedProduct && activeTab === 'STOCK' && (
                    <div className="animate-fade-in">
                        {/* Header del Producto */}
                        <div className="bg-orange-50/40 p-6 border-b border-orange-100 flex justify-between items-center">
                            <div className="flex gap-8">
                                 <div>
                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">SKU</span>
                                    <div className="font-mono font-bold text-stone-800 text-lg">{selectedProduct.sku}</div>
                                 </div>
                                 <div>
                                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block mb-1">Categoría</span>
                                    <div className="font-bold text-stone-700 text-sm bg-white px-2 py-1 rounded border border-orange-100 inline-block">{selectedProduct.category}</div>
                                 </div>
                            </div>
                            <div className="text-right">
                                 <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block mb-1">Stock Global</span>
                                 <div className="text-3xl font-bold text-stone-800 leading-none">
                                    {stockData.reduce((acc, curr) => acc + curr.current_stock, 0)} <span className="text-sm text-stone-400 font-medium">{selectedProduct.unit}</span>
                                 </div>
                            </div>
                        </div>

                        <table className="w-full text-left border-collapse">
                            <thead className="bg-stone-50 text-xs uppercase font-bold text-stone-500 border-b border-stone-200">
                                <tr>
                                    <th className="p-5 pl-8 font-semibold">Bodega</th>
                                    <th className="p-5 font-semibold">Ubicación</th>
                                    <th className="p-5 text-center font-semibold">Disponible</th>
                                    <th className="p-5 text-right pr-8 font-semibold">Última Actualización</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {stockData.length === 0 && !loading && <tr><td colSpan="4" className="p-10 text-center text-stone-400 italic">No hay stock físico registrado.</td></tr>}
                                {stockData.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-stone-50 group transition-colors">
                                        <td className="p-5 pl-8 font-bold text-stone-700">{item.warehouse?.name}</td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2 text-stone-600">
                                                <MapPin size={16} className="text-stone-300 group-hover:text-orange-500 transition-colors"/>
                                                <span className="text-sm font-medium">{item.location?.zone}</span> 
                                                <span className="text-stone-300">|</span> 
                                                <span className="font-mono text-xs bg-stone-100 px-2 py-0.5 rounded border border-stone-200 text-stone-500">{item.location?.full_code}</span>
                                            </div>
                                        </td>
                                        <td className="p-5 text-center">
                                            <span className="font-bold text-emerald-600 text-xl">{item.current_stock}</span>
                                        </td>
                                        <td className="p-5 text-right pr-8 text-xs text-stone-400">{new Date(item.last_updated).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* VISTA KARDEX (TABLA) */}
                {selectedProduct && activeTab === 'KARDEX' && (
                    <div className="animate-fade-in">
                         <div className="bg-blue-50/50 p-3 border-b border-blue-100 text-center text-sm text-blue-800">
                            Historial de movimientos en: <span className="font-bold ml-1">{warehouses.find(w => w.id == selectedWarehouse)?.name || 'Seleccione Bodega'}</span>
                         </div>
                         <table className="w-full text-left">
                            <thead className="bg-stone-50 text-xs uppercase font-bold text-stone-500 border-b border-stone-200">
                                <tr>
                                    <th className="p-5 pl-8">Fecha</th>
                                    <th className="p-5 text-center">Tipo</th>
                                    <th className="p-5 text-center">Cantidad</th>
                                    <th className="p-5">Ubicación</th>
                                    <th className="p-5 pr-8">Detalle</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                 {loading && <tr><td colSpan="5" className="p-10 text-center text-stone-400">Cargando movimientos...</td></tr>}
                                 {!loading && kardexData.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-stone-400 italic">Sin movimientos en este rango.</td></tr>}
                                 {kardexData.map((m, idx) => (
                                    <tr key={idx} className="hover:bg-stone-50 transition-colors">
                                        <td className="p-5 pl-8">
                                            <div className="text-sm font-bold text-stone-700">{new Date(m.created_at).toLocaleDateString()}</div>
                                            <div className="text-xs text-stone-400 font-mono mt-0.5">{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </td>
                                        <td className="p-5 text-center">{getTypeBadge(m.movement_type)}</td>
                                        <td className={`p-5 text-center font-bold font-mono text-lg ${['IN', 'RETURN', 'TRANSFER_IN'].includes(m.movement_type) ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {['IN', 'RETURN', 'TRANSFER_IN'].includes(m.movement_type) ? '+' : '-'}{m.quantity}
                                        </td>
                                        <td className="p-5 text-sm text-stone-600">{m.location?.full_code || '-'}</td>
                                        <td className="p-5 pr-8">
                                            <div className="text-sm text-stone-600 italic truncate max-w-[250px]">{m.comments || 'Sin comentarios'}</div>
                                            <div className="text-xs text-stone-400 mt-1 flex items-center gap-1.5">
                                                <div className="w-4 h-4 rounded-full bg-stone-200 flex items-center justify-center text-[8px] font-bold text-stone-500">
                                                    {m.user?.email?.[0].toUpperCase()}
                                                </div>
                                                {m.user?.email}
                                            </div>
                                        </td>
                                    </tr>
                                 ))}
                            </tbody>
                         </table>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default InventoryView;