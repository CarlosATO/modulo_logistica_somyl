import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import Combobox from '../components/Combobox';
import { 
  Search, ArrowUpCircle, ArrowDownCircle, ArrowRightCircle, 
  Layers, History, Loader, MapPin, Download, Grid, DollarSign, Wallet
} from 'lucide-react';

export default function InventoryViewer() {
  const [activeTab, setActiveTab] = useState('STOCK'); // 'STOCK', 'LOCATIONS', 'KARDEX'
  const [loading, setLoading] = useState(false);
  
  // Datos Maestros
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [locations, setLocations] = useState([]);       // Racks físicos
  const [stockInRacks, setStockInRacks] = useState([]); // Lo que hay en los racks

  // Filtros
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  // Helper: Formato Moneda Chilena
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount || 0);
  };

  // 1. Cargar Datos
  useEffect(() => {
    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: wh } = await supabase.from('warehouses').select('*');
            setWarehouses(wh || []);

            // Traemos productos CON PRECIO
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

  // --- LÓGICA 1: STOCK GLOBAL VALORIZADO ---
  const stockByWarehouse = useMemo(() => {
      const stockMap = {};

      movements.forEach(m => {
          if (selectedWarehouse !== 'ALL' && m.warehouse_id !== selectedWarehouse) return;
          if (!m.product_id) return;

          const key = `${m.product_id}_${m.warehouse_id}`;
          if (!stockMap[key]) {
              stockMap[key] = { productId: m.product_id, warehouseId: m.warehouse_id, inbound: 0, outbound: 0 };
          }

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
              ...item,
              code: prod?.code || '???',
              name: prod?.name || 'Desconocido',
              warehouseName: wh?.name || 'Desconocida',
              currentStock: currentStock,
              unitPrice: price,
              totalValue: currentStock * price // VALORIZACIÓN
          };
      }).filter(item => 
          item.currentStock > 0 && 
          (item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.code.toLowerCase().includes(searchTerm.toLowerCase()))
      );
  }, [movements, products, warehouses, selectedWarehouse, searchTerm]);

  // --- LÓGICA 2: STOCK POR UBICACIÓN VALORIZADO ---
  const stockByLocation = useMemo(() => {
      return stockInRacks.filter(item => {
          if (selectedWarehouse !== 'ALL' && item.warehouse_id !== selectedWarehouse) return false;
          const prod = products.find(p => p.id === item.product_id);
          const loc = locations.find(l => l.id === item.location_id);
          const term = searchTerm.toLowerCase();

          return !searchTerm || 
                 (prod?.name || '').toLowerCase().includes(term) || 
                 (prod?.code || '').toLowerCase().includes(term) ||
                 (loc?.full_code || '').toLowerCase().includes(term);
      }).map(item => {
          const prod = products.find(p => p.id === item.product_id);
          const wh = warehouses.find(w => w.id === item.warehouse_id);
          const loc = locations.find(l => l.id === item.location_id);
          const price = Number(prod?.price || 0);

          return {
              id: item.id,
              warehouseName: wh?.name || 'Desconocida',
              locationCode: loc?.full_code || 'SIN UBICACIÓN',
              locationDetail: loc ? `Zona ${loc.zone} - Fila ${loc.row}` : '-',
              productCode: prod?.code || '???',
              productName: prod?.name || 'Desconocido',
              quantity: item.quantity,
              unitPrice: price,
              totalValue: item.quantity * price // VALORIZACIÓN
          };
      });
  }, [stockInRacks, products, warehouses, locations, selectedWarehouse, searchTerm]);

  // --- LÓGICA 3: KARDEX ---
  const filteredMovements = useMemo(() => {
      return movements.filter(m => {
          const matchWh = selectedWarehouse === 'ALL' || m.warehouse_id === selectedWarehouse;
          const prod = products.find(p => p.id === m.product_id);
          const term = searchTerm.toLowerCase();
          const matchText = !searchTerm || (prod?.name || '').toLowerCase().includes(term) || (m.document_number || '').toLowerCase().includes(term);

          let matchDate = true;
          if (dateRange.start) matchDate = matchDate && new Date(m.created_at) >= new Date(dateRange.start);
          if (dateRange.end) matchDate = matchDate && new Date(m.created_at) <= new Date(dateRange.end + 'T23:59:59');

          return matchWh && matchText && matchDate;
      }).map(m => {
          const prod = products.find(p => p.id === m.product_id);
          const wh = warehouses.find(w => w.id === m.warehouse_id);
          return { 
            ...m, 
            productName: prod?.name, 
            productCode: prod?.code, 
            warehouseName: wh?.name,
            historicalPrice: m.unit_price || 0 // Precio histórico del movimiento
          };
      });
  }, [movements, products, warehouses, selectedWarehouse, searchTerm, dateRange]);

  // --- CALCULAR TOTAL VALORIZADO (HEADER) ---
  const grandTotal = useMemo(() => {
    if (activeTab === 'STOCK') {
        return stockByWarehouse.reduce((sum, item) => sum + item.totalValue, 0);
    } else if (activeTab === 'LOCATIONS') {
        return stockByLocation.reduce((sum, item) => sum + item.totalValue, 0);
    }
    return 0; // En Kardex no sumamos stock
  }, [activeTab, stockByWarehouse, stockByLocation]);


  // --- FUNCIÓN EXPORTAR A EXCEL (CSV) ---
  const handleExport = () => {
      let dataToExport = [];
      let headers = [];

      if (activeTab === 'STOCK') {
          headers = ["Bodega", "Código", "Producto", "Stock", "$ Unitario", "$ Total"];
          dataToExport = stockByWarehouse.map(i => [i.warehouseName, i.code, i.name, i.currentStock, i.unitPrice, i.totalValue]);
      } else if (activeTab === 'LOCATIONS') {
          headers = ["Bodega", "Ubicación", "Código", "Producto", "Cantidad", "$ Unitario", "$ Total"];
          dataToExport = stockByLocation.map(i => [i.warehouseName, i.locationCode, i.productCode, i.productName, i.quantity, i.unitPrice, i.totalValue]);
      } else {
          headers = ["Fecha", "Tipo", "Bodega", "Código", "Producto", "Cantidad", "$ Movimiento", "Doc"];
          dataToExport = filteredMovements.map(i => [
              new Date(i.created_at).toLocaleDateString(), 
              i.type, i.warehouseName, i.productCode, i.productName, 
              (i.type === 'OUTBOUND' || i.type === 'TRANSFER_OUT' ? '-' : '+') + i.quantity, 
              i.historicalPrice,
              i.document_number || ''
          ]);
      }

      const csvContent = [headers.join(";"), ...dataToExport.map(e => e.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Valorizado_${activeTab}_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
              <div>
                  <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Layers/> Visor de Inventario</h1>
                  <p className="text-xs text-slate-500">Control de Existencias y Valorización</p>
              </div>
              
              {/* TOTAL VALORIZADO (TARJETA VERDE) */}
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
                  <button onClick={() => setActiveTab('STOCK')} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'STOCK' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Grid size={14}/> Stock Global</button>
                  <button onClick={() => setActiveTab('LOCATIONS')} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'LOCATIONS' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}><MapPin size={14}/> Por Ubicación</button>
                  <button onClick={() => setActiveTab('KARDEX')} className={`px-3 py-2 rounded text-xs font-bold flex items-center gap-2 ${activeTab === 'KARDEX' ? 'bg-white shadow text-orange-600' : 'text-slate-500'}`}><History size={14}/> Kárdex</button>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                  <input type="text" placeholder="Buscar producto..." className="w-full pl-10 pr-4 py-2 border rounded-lg outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Combobox
                  options={[{ id: 'ALL', name: 'Todas las Bodegas' }, ...warehouses]}
                  value={selectedWarehouse}
                  onChange={setSelectedWarehouse}
                  placeholder="-- Filtrar Bodega --"
              />
              <button onClick={handleExport} className="flex items-center justify-center gap-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-black transition-colors">
                  <Download size={18}/> Exportar Excel
              </button>
          </div>
      </div>

      {loading && <div className="text-center py-10"><Loader className="animate-spin mx-auto"/> Calculando valores...</div>}

      {/* VISTA 1: STOCK GLOBAL VALORIZADO */}
      {!loading && activeTab === 'STOCK' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-in fade-in">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                      <tr>
                          <th className="px-6 py-3">Bodega</th>
                          <th className="px-6 py-3">Producto</th>
                          <th className="px-6 py-3 text-center">Stock</th>
                          <th className="px-6 py-3 text-right bg-emerald-50 text-emerald-800">$ Unitario</th>
                          <th className="px-6 py-3 text-right bg-emerald-100 text-emerald-900">$ Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {stockByWarehouse.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-6 py-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{item.warehouseName}</span></td>
                              <td className="px-6 py-3">
                                  <div className="font-medium text-slate-700">{item.name}</div>
                                  <div className="text-xs font-mono text-slate-400">{item.code}</div>
                              </td>
                              <td className="px-6 py-3 text-center font-bold text-lg text-blue-600">{item.currentStock}</td>
                              <td className="px-6 py-3 text-right font-mono text-emerald-600">{formatMoney(item.unitPrice)}</td>
                              <td className="px-6 py-3 text-right font-black font-mono text-emerald-800 bg-emerald-50/30">{formatMoney(item.totalValue)}</td>
                          </tr>
                      ))}
                      {stockByWarehouse.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">Sin datos.</td></tr>}
                  </tbody>
              </table>
          </div>
      )}

      {/* VISTA 2: UBICACIONES VALORIZADO */}
      {!loading && activeTab === 'LOCATIONS' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-in fade-in">
              <table className="w-full text-sm text-left">
                  <thead className="bg-purple-50 text-purple-900 font-bold uppercase text-xs">
                      <tr>
                          <th className="px-6 py-3">Ubicación</th>
                          <th className="px-6 py-3">Producto</th>
                          <th className="px-6 py-3 text-center">Cant.</th>
                          <th className="px-6 py-3 text-right">$ Unitario</th>
                          <th className="px-6 py-3 text-right">$ Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {stockByLocation.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                              <td className="px-6 py-3">
                                  <div className="font-black text-slate-700">{item.locationCode}</div>
                                  <div className="text-[10px] text-slate-500">{item.warehouseName}</div>
                              </td>
                              <td className="px-6 py-3">
                                  <div className="font-bold text-slate-700">{item.productName}</div>
                                  <div className="text-xs text-slate-400 font-mono">{item.productCode}</div>
                              </td>
                              <td className="px-6 py-3 text-center"><span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold">{item.quantity}</span></td>
                              <td className="px-6 py-3 text-right font-mono text-slate-500">{formatMoney(item.unitPrice)}</td>
                              <td className="px-6 py-3 text-right font-mono font-bold text-slate-700">{formatMoney(item.totalValue)}</td>
                          </tr>
                      ))}
                      {stockByLocation.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">Racks vacíos.</td></tr>}
                  </tbody>
              </table>
          </div>
      )}

      {/* VISTA 3: KARDEX (HISTORIAL) */}
      {!loading && activeTab === 'KARDEX' && (
          <div className="space-y-3">
              {filteredMovements.map(mov => (
                  <div key={mov.id} className="bg-white p-4 rounded-xl border flex items-center gap-4">
                      <div className={`p-3 rounded-full ${mov.type === 'INBOUND' ? 'bg-emerald-100 text-emerald-600' : mov.type === 'OUTBOUND' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                          {mov.type === 'INBOUND' ? <ArrowDownCircle/> : mov.type === 'OUTBOUND' ? <ArrowUpCircle/> : <ArrowRightCircle/>}
                      </div>
                      <div className="flex-1">
                          <div className="text-xs text-slate-400">{new Date(mov.created_at).toLocaleString()} • {mov.type}</div>
                          <div className="font-bold text-slate-800">{mov.productName}</div>
                          <div className="text-xs text-slate-500 flex gap-2">
                              <span>Doc: {mov.document_number || 'S/N'}</span>
                              <span className="text-emerald-600 font-bold flex items-center gap-1"><DollarSign size={10}/> {formatMoney(mov.historicalPrice)}</span>
                          </div>
                      </div>
                      <div className="text-right font-black text-lg">
                          {mov.type === 'OUTBOUND' || mov.type === 'TRANSFER_OUT' ? '-' : '+'}{mov.quantity}
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}