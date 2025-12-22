import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import Combobox from '../components/Combobox';
import { 
  Search, ArrowUpCircle, ArrowDownCircle, ArrowRightCircle, 
  Layers, History, Loader, MapPin, Download, Grid, Wallet, X, ArrowRight, DollarSign
} from 'lucide-react';

export default function InventoryViewer() {
  const [activeTab, setActiveTab] = useState('STOCK');
  const [loading, setLoading] = useState(false);
  
  // Datos Maestros
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [locations, setLocations] = useState([]);
  const [stockInRacks, setStockInRacks] = useState([]);

  // Filtros
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showPutawayMovements, setShowPutawayMovements] = useState(false);

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount || 0);
  };

  const translateMovementType = (type) => {
    const translations = {
      'INBOUND': 'Recepción', 'OUTBOUND': 'Despacho', 
      'TRANSFER_IN': 'Transf. Entrada', 'TRANSFER_OUT': 'Transf. Salida', 'PUTAWAY': 'Ubicación'
    };
    return translations[type] || type;
  };

  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: wh } = await supabase.from('warehouses').select('*');
            setWarehouses(wh || []);
            const { data: prod } = await supabase.from('products').select('*');
            setProducts(prod || []);
            const { data: locs } = await supabase.from('locations').select('*');
            setLocations(locs || []);
            const { data: mov } = await supabase.from('movements').select('*').order('created_at', { ascending: false });
            setMovements(mov || []);
            const { data: rackStock } = await supabase.from('product_locations').select('*');
            setStockInRacks(rackStock || []);
        } catch (error) {
            console.error("Error cargando inventario:", error);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
  }, []);

  // --- LÓGICA DE BÚSQUEDA FLOTANTE ---
  const searchResults = useMemo(() => {
    if (!searchTerm || selectedProduct) return [];
    const term = searchTerm.toLowerCase();
    return products
        .filter(p => (p.name || '').toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term))
        .slice(0, 6);
  }, [searchTerm, products, selectedProduct]);

  // --- LÓGICA 1: STOCK GLOBAL ---
  const stockByWarehouse = useMemo(() => {
    const stockMap = {};
    movements.forEach(m => {
        if (selectedWarehouse !== 'ALL' && m.warehouse_id !== selectedWarehouse) return;
        if (!m.product_id) return;
        const key = `${m.product_id}_${m.warehouse_id}`;
        if (!stockMap[key]) stockMap[key] = { productId: m.product_id, warehouseId: m.warehouse_id, inbound: 0, outbound: 0 };
        const qty = Number(m.quantity);
        if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') stockMap[key].inbound += qty;
        if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') stockMap[key].outbound += qty;
    });
    return Object.values(stockMap).map(item => {
        const prod = products.find(p => p.id === item.productId);
        const wh = warehouses.find(w => w.id === item.warehouseId);
        const currentStock = item.inbound - item.outbound;
        const price = Number(prod?.price || 0);
        return {
            ...item, code: prod?.code || '???', name: prod?.name || 'Desconocido',
            warehouseName: wh?.name || 'Desconocida', currentStock,
            unitPrice: price, totalValue: currentStock * price
        };
    }).filter(item => item.currentStock > 0 && 
        ((item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (item.code || '').toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [movements, products, warehouses, selectedWarehouse, searchTerm]);

  // --- LÓGICA 2: POR UBICACIÓN ---
  const stockByLocation = useMemo(() => {
    return stockInRacks.filter(item => {
        const matchWh = selectedWarehouse === 'ALL' || item.warehouse_id === selectedWarehouse;
        if (!matchWh) return false;
        if (selectedProduct) return String(item.product_id) === String(selectedProduct);
        const prod = products.find(p => p.id === item.product_id);
        const term = searchTerm.toLowerCase();
        return !searchTerm || (prod?.name || '').toLowerCase().includes(term) || (prod?.code || '').toLowerCase().includes(term);
    }).map(item => {
        const prod = products.find(p => p.id === item.product_id);
        const wh = warehouses.find(w => w.id === item.warehouse_id);
        const loc = locations.find(l => l.id === item.location_id);
        const price = Number(prod?.price || 0);
        return {
            id: item.id, productId: item.product_id, warehouseName: wh?.name || '?',
            locationCode: loc?.full_code || 'S/N', productCode: prod?.code || '?',
            productName: prod?.name || '?', quantity: Number(item.quantity), totalValue: Number(item.quantity) * price
        }; 
    });
  }, [stockInRacks, products, warehouses, locations, selectedWarehouse, searchTerm, selectedProduct]);

  // --- LÓGICA 3: KÁRDEX ---
  const kardexWithBalance = useMemo(() => {
      if (!selectedProduct) return []; 
      const productMovements = movements.filter(m => String(m.product_id) === String(selectedProduct));
      const whFiltered = selectedWarehouse === 'ALL' ? productMovements : productMovements.filter(m => m.warehouse_id === selectedWarehouse);
      const sorted = [...whFiltered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      let runningBalance = 0;
      return sorted.map(mov => {
          const qty = Number(mov.quantity);
          if (mov.type === 'INBOUND' || mov.type === 'TRANSFER_IN') runningBalance += qty;
          else if (mov.type === 'OUTBOUND' || mov.type === 'TRANSFER_OUT') runningBalance -= qty;
          return { ...mov, balance: runningBalance };
      }).filter(m => showPutawayMovements || m.type !== 'PUTAWAY')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [movements, selectedProduct, selectedWarehouse, showPutawayMovements]);

  // Info del Banner (Compartida)
  const selectedProductInfo = useMemo(() => {
      if (!selectedProduct) return null;
      const prod = products.find(p => String(p.id) === String(selectedProduct));
      const kardexStock = kardexWithBalance[0]?.balance || 0;
      const rackStock = stockByLocation.reduce((sum, i) => sum + i.quantity, 0);
      return {
          name: prod?.name, code: prod?.code,
          stockKardex: kardexStock, stockRack: rackStock,
          totalValue: rackStock * Number(prod?.price || 0)
      };
  }, [selectedProduct, products, kardexWithBalance, stockByLocation]);

  const grandTotal = useMemo(() => {
    if (activeTab === 'STOCK') return stockByWarehouse.reduce((sum, i) => sum + i.totalValue, 0);
    if (activeTab === 'LOCATIONS') return stockByLocation.reduce((sum, i) => sum + i.totalValue, 0);
    return 0;
  }, [activeTab, stockByWarehouse, stockByLocation]);

  return (
    <div className="space-y-6 pb-20">
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
              <div>
                  <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Layers/> Visor de Inventario</h1>
                  <p className="text-xs text-slate-500">Gestión de Existencias y Valorización</p>
              </div>
              {activeTab !== 'KARDEX' && (
                  <div className="bg-emerald-50 border border-emerald-100 px-6 py-2 rounded-xl flex items-center gap-4">
                      <div className="p-2 bg-emerald-100 text-emerald-600 rounded-full"><Wallet size={20}/></div>
                      <div>
                          <p className="text-xs font-bold text-emerald-600 uppercase">Valorización Total</p>
                          <p className="text-xl font-black text-emerald-800">{formatMoney(grandTotal)}</p>
                      </div>
                  </div>
              )}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button onClick={() => {setActiveTab('STOCK'); setSelectedProduct(null);}} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'STOCK' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Grid size={14}/> Stock Global</button>
                  <button onClick={() => setActiveTab('LOCATIONS')} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'LOCATIONS' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}><MapPin size={14}/> Por Ubicación</button>
                  <button onClick={() => setActiveTab('KARDEX')} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'KARDEX' ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}><History size={14}/> Kárdex</button>
              </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" placeholder="Buscar producto..." className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-100" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border mt-1 rounded-lg shadow-xl z-50 overflow-hidden divide-y">
                        {searchResults.map(p => (
                            <button key={p.id} onClick={() => {setSelectedProduct(p.id); setSearchTerm('');}} className="w-full px-4 py-3 hover:bg-slate-50 flex justify-between items-center transition-colors text-left">
                                <div><p className="font-bold text-slate-700 text-sm">{p.name}</p><p className="text-[10px] text-slate-400 font-mono">{p.code}</p></div>
                                <ArrowRight size={14} className="text-slate-300"/>
                            </button>
                        ))}
                    </div>
                  )}
              </div>
              <Combobox options={[{ id: 'ALL', name: 'Todas las Bodegas' }, ...warehouses]} value={selectedWarehouse} onChange={setSelectedWarehouse} placeholder="-- Bodega --" />
              <button className="flex items-center justify-center gap-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-black transition-colors px-3 py-2"><Download size={16}/> Exportar</button>
          </div>
      </div>

      {/* BANNER MINIMALISTA (Aparece si hay selección en Ubicación o Kárdex) */}
      {(activeTab === 'LOCATIONS' || activeTab === 'KARDEX') && selectedProduct && selectedProductInfo && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-300">
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                  <div className="flex items-center gap-4">
                      <div className="p-2 bg-white border rounded-lg text-slate-400"><Layers size={20}/></div>
                      <div>
                          <h2 className="font-bold text-slate-800 uppercase tracking-tight">{selectedProductInfo.name}</h2>
                          <p className="text-[10px] font-mono text-slate-400">{selectedProductInfo.code}</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-8">
                      <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Stock Contable</p>
                          <p className="text-xl font-black text-indigo-600">{selectedProductInfo.stockKardex}</p>
                      </div>
                      <div className="text-right">
                          <p className="text-[10px] font-bold text-purple-400 uppercase">Stock en Racks</p>
                          <p className="text-xl font-black text-purple-600">{selectedProductInfo.stockRack}</p>
                      </div>
                      <div className="text-right border-l pl-8">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase">Valor en Racks</p>
                          <p className="text-xl font-black text-emerald-700">{formatMoney(selectedProductInfo.totalValue)}</p>
                      </div>
                      <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"><X size={20}/></button>
                  </div>
              </div>
          </div>
      )}

      {/* VISTA 1: STOCK GLOBAL */}
      {!loading && activeTab === 'STOCK' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-in fade-in">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                      <tr>
                          <th className="px-6 py-3">Bodega</th><th className="px-6 py-3">Producto</th><th className="px-6 py-3 text-center">Stock</th><th className="px-6 py-3 text-right bg-emerald-50 text-emerald-800">$ Total</th><th className="px-6 py-3 text-center">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {stockByWarehouse.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-6 py-3 text-xs font-bold text-slate-600">{item.warehouseName}</td>
                              <td className="px-6 py-3"><p className="font-medium">{item.name}</p><p className="text-[10px] font-mono text-slate-400">{item.code}</p></td>
                              <td className="px-6 py-3 text-center font-bold text-blue-600 text-lg">{item.currentStock}</td>
                              <td className="px-6 py-3 text-right font-bold text-emerald-700">{formatMoney(item.totalValue)}</td>
                              <td className="px-6 py-3 text-center">
                                  <button onClick={() => {setSelectedProduct(item.productId); setActiveTab('KARDEX');}} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><History size={16}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      )}

      {/* VISTA 2: UBICACIONES */}
      {!loading && activeTab === 'LOCATIONS' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-in fade-in">
              <table className="w-full text-sm text-left">
                  <thead className="bg-purple-50 text-purple-900 font-bold uppercase text-xs">
                      <tr>
                          <th className="px-6 py-3">Ubicación</th>
                          {!selectedProduct && <th className="px-6 py-3">Producto</th>}
                          <th className="px-6 py-3 text-center">Cantidad</th>
                          <th className="px-6 py-3 text-right">$ Total</th>
                          <th className="px-6 py-3 text-center">Acción</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {stockByLocation.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-3"><p className="font-black text-slate-700">{item.locationCode}</p><p className="text-[10px] text-slate-400 uppercase font-bold">{item.warehouseName}</p></td>
                              {!selectedProduct && (
                                  <td className="px-6 py-3"><p className="font-bold text-slate-700">{item.productName}</p><p className="text-[10px] text-slate-400 font-mono">{item.productCode}</p></td>
                              )}
                              <td className="px-6 py-3 text-center"><span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold">{item.quantity}</span></td>
                              <td className="px-6 py-3 text-right font-bold text-slate-700">{formatMoney(item.totalValue)}</td>
                              <td className="px-6 py-3 text-center">
                                  <button onClick={() => {setSelectedProduct(item.productId); setActiveTab('KARDEX');}} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all shadow-sm"><History size={16}/></button>
                              </td>
                          </tr>
                      ))}
                      {stockByLocation.length === 0 && (
                          <tr><td colSpan="5" className="p-16 text-center text-slate-400 italic"><Search size={40} className="mx-auto mb-4 opacity-10"/> No se encontraron ubicaciones para este artículo.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      )}

      {/* VISTA 3: KÁRDEX */}
      {!loading && activeTab === 'KARDEX' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-300">
              {selectedProduct ? (
                  <div className="divide-y divide-slate-100">
                      {kardexWithBalance.map(mov => (
                          <div key={mov.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                              <div className={`p-2 rounded-full ${mov.type.includes('IN') || mov.type === 'INBOUND' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                  {mov.type.includes('IN') || mov.type === 'INBOUND' ? <ArrowDownCircle size={18}/> : <ArrowUpCircle size={18}/>}
                              </div>
                              <div className="flex-1">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{new Date(mov.created_at).toLocaleDateString()} • {translateMovementType(mov.type)}</p>
                                  <p className="text-sm font-bold text-slate-700">{mov.document_number || 'S/N'}</p>
                              </div>
                              <div className="text-right">
                                  <p className={`font-bold ${mov.type.includes('IN') || mov.type === 'INBOUND' ? 'text-emerald-600' : 'text-orange-600'}`}>{mov.type.includes('IN') || mov.type === 'INBOUND' ? '+' : '-'}{mov.quantity}</p>
                                  <p className="text-[10px] font-medium text-slate-400 uppercase">Saldo: <span className="text-indigo-600 font-bold">{mov.balance}</span></p>
                              </div>
                          </div>
                      ))}
                      {kardexWithBalance.length === 0 && <div className="p-16 text-center text-slate-400 italic">No hay historial para mostrar.</div>}
                  </div>
              ) : (
                  <div className="p-20 text-center text-slate-400 italic"><Search size={48} className="mx-auto mb-4 opacity-10"/> Selecciona un artículo para ver su Kárdex.</div>
              )}
          </div>
      )}
    </div>
  );
}