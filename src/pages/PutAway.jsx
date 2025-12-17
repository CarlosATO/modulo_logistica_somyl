import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Package, Warehouse, ArrowLeft, Grid, 
  MapPin, Move, CheckCircle, Loader, AlertCircle, RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner'; // Reemplazar alert por toasts

const PutAway = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  
  // Listas de datos
  const [stagingItems, setStagingItems] = useState([]); 
  const [locations, setLocations] = useState([]);       
  const [loadingItems, setLoadingItems] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  
  // Estado de la acción
  const [selectedItem, setSelectedItem] = useState(null);
  const [targetLocation, setTargetLocation] = useState('');
  const [moveQty, setMoveQty] = useState(''); 

  // 1. Cargar Bodegas
  useEffect(() => {
      const load = async () => {
          const { data } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
          setWarehouses(data || []);
          if(data && data.length > 0) setSelectedWarehouse(data[0].id);
      };
      load();
  }, []);

  // 2. Cargar Inventario
  const fetchData = useCallback(async () => {
      if(!selectedWarehouse) return;
      
      setLoadingItems(true);
      setErrorMsg(null);
      setStagingItems([]);
      setSelectedItem(null);
      setMoveQty('');
      
      try {
          // A. Ubicaciones
          const { data: locs } = await supabase.from('locations').select('*').eq('warehouse_id', selectedWarehouse).order('full_code');
          setLocations(locs || []);

          // B. Movimientos (Historial de todo lo que ha entrado/salido)
          const { data: movements, error: movErr } = await supabase
            .from('movements')
            .select('*') // Traemos todo para evitar errores de columnas faltantes
            .eq('warehouse_id', selectedWarehouse);

          if (movErr) throw movErr;

          // C. Stock ya ubicado en Racks (Lo que ya ordenaste)
          const { data: allocatedStock, error: allErr } = await supabase
            .from('product_locations')
            .select('product_id, quantity')
            .eq('warehouse_id', selectedWarehouse);
            
          if (allErr) throw allErr;

          // --- CÁLCULOS MATEMÁTICOS ---
          
          // 1. Calcular Stock Total Teórico en Bodega (Según Kárdex)
          const stockInWarehouseMap = {};
          
          movements?.forEach(m => {
              if (!m.product_id) return;
              const qty = Number(m.quantity);
              
              if (!stockInWarehouseMap[m.product_id]) stockInWarehouseMap[m.product_id] = 0;
              
              // SUMAR: Compras (INBOUND) y Traspasos Recibidos (TRANSFER_IN)
              if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') {
                  stockInWarehouseMap[m.product_id] += qty;
              }
              
              // RESTAR: Salidas (OUTBOUND) y Traspasos Enviados (TRANSFER_OUT)
              if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') {
                  stockInWarehouseMap[m.product_id] -= qty;
              }
          });

          // 2. Calcular Stock ya guardado en Racks
          const allocatedMap = {};
          allocatedStock?.forEach(item => {
              allocatedMap[item.product_id] = (allocatedMap[item.product_id] || 0) + Number(item.quantity);
          });

          // 3. Cruzar datos: (Lo que tengo en total) - (Lo que ya guardé) = (Lo que falta por guardar)
          const productIds = Object.keys(stockInWarehouseMap);
          
          if (productIds.length > 0) {
              const { data: products } = await supabase.from('products').select('*').in('id', productIds);
              
              const pendingItems = [];
              products?.forEach(p => {
                  const totalHere = stockInWarehouseMap[p.id] || 0;
                  const inRacks = allocatedMap[p.id] || 0;
                  const pending = totalHere - inRacks;

                  // Solo mostramos si hay pendiente positivo (ej: llegaron 10, guardé 0 -> Muestro 10)
                  if (pending > 0) {
                      pendingItems.push({
                          ...p,
                          pending_stock: pending,
                          total_stock: totalHere
                      });
                  }
              });
              setStagingItems(pendingItems);
          } else {
              setStagingItems([]);
          }

      } catch (error) {
          console.error("Error cargando datos:", error);
          setErrorMsg("Error al calcular stock.");
      } finally {
          setLoadingItems(false);
      }
  }, [selectedWarehouse]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Selección de ítem
  const handleSelectItem = (item) => {
      setSelectedItem(item);
      setMoveQty(item.pending_stock); 
      setTargetLocation('');
  };

  // Guardar ubicación (Put Away)
  const handleMove = async () => {
      if(!selectedItem || !targetLocation) {
          toast.error("⚠️ Faltan datos.");
          return;
      }
      const qty = Number(moveQty);
      if(qty <= 0 || qty > selectedItem.pending_stock) {
          toast.error("⚠️ Cantidad inválida.");
          return;
      }

      try {
          const locObj = locations.find(l => l.id === targetLocation);
          const fullCode = locObj ? locObj.full_code : 'Bodega';

          // 1. Guardar o Actualizar en Racks (product_locations)
          // Primero verificamos si ya existe ese producto en esa ubicación para sumar
          const { data: existingLoc } = await supabase.from('product_locations')
             .select('id, quantity')
             .eq('location_id', targetLocation)
             .eq('product_id', selectedItem.id)
             .maybeSingle();

          if (existingLoc) {
             // Update (Sumar)
             await supabase.from('product_locations')
                .update({ quantity: Number(existingLoc.quantity) + qty })
                .eq('id', existingLoc.id);
          } else {
             // Insert (Nuevo)
             await supabase.from('product_locations').insert({
                product_id: selectedItem.id,
                warehouse_id: selectedWarehouse,
                location_id: targetLocation,
                quantity: qty
             });
          }

          // 2. Registrar Movimiento PUTAWAY (Solo para trazabilidad interna, no afecta stock total)
          await supabase.from('movements').insert({
              type: 'PUTAWAY',
              warehouse_id: selectedWarehouse,
              quantity: qty,
              product_id: selectedItem.id,
              comments: `Ubicado: ${qty} UN en ${fullCode}`,
              other_data: `COD: ${selectedItem.code} | Loc: ${fullCode}`,
              user_email: user?.email
          });

          toast.success(`✅ Guardado en ${fullCode}`);
          fetchData(); 

      } catch (error) { 
          console.error(error);
          toast.error("Error al guardar: " + error.message); 
      }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-20">
      
      {/* HEADER */}
      <div className="bg-white border-b border-stone-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md"><Move size={20} /></div>
                <div><h1 className="text-xl font-bold text-stone-900">Orden de Bodega</h1><p className="text-xs text-stone-500">Distribución física</p></div>
            </div>
            <div className="flex gap-3">
                <button onClick={() => fetchData()} className="p-2 bg-stone-100 hover:bg-stone-200 rounded-full"><RefreshCw size={20}/></button>
                <button onClick={() => navigate('/gestion/ubicaciones')} className="px-4 py-2 bg-stone-100 border rounded-lg text-sm font-bold flex gap-2"><Grid size={16}/> Configurar Racks</button>
                <button onClick={() => navigate('/gestion')} className="px-4 py-2 bg-white border rounded-lg text-sm font-bold flex gap-2"><ArrowLeft size={16}/> Volver</button>
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* SELECTOR BODEGA */}
        <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex items-center gap-4">
            <div className="p-3 bg-stone-100 rounded-full"><Warehouse className="text-stone-500" /></div>
            <div className="flex-1">
                <label className="block text-[10px] font-bold text-stone-400 uppercase">Bodega Operativa</label>
                <select className="bg-transparent font-bold text-lg w-full outline-none cursor-pointer" value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)}>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
        </div>

        {errorMsg && (
            <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 text-red-700">
                <AlertCircle size={24}/>
                <div><p className="font-bold">Error</p><p className="text-sm">{errorMsg}</p></div>
            </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* IZQUIERDA: PENDIENTES */}
            <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 shadow-sm flex flex-col h-[600px]">
                <h3 className="font-bold text-blue-900 mb-4 flex justify-between">
                    <span className="flex gap-2 items-center"><Package size={18}/> RECEPCIÓN / SIN UBICAR</span>
                    <span className="bg-blue-200 text-blue-800 text-xs px-2 py-1 rounded-full">{stagingItems.length}</span>
                </h3>
                
                <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                    {loadingItems ? <div className="text-center py-20 text-blue-400"><Loader className="animate-spin mx-auto mb-2"/> Buscando stock...</div> : 
                     stagingItems.length === 0 ? <div className="text-center py-20 opacity-40"><Package size={48} className="mx-auto mb-2"/><p>Todo ordenado.</p></div> : 
                     stagingItems.map(item => (
                        <div key={item.id} onClick={() => handleSelectItem(item)} className={`bg-white p-4 rounded-xl border-2 cursor-pointer transition-all relative ${selectedItem?.id === item.id ? 'border-blue-500 ring-4 ring-blue-100' : 'border-transparent hover:border-blue-200'}`}>
                            <div className="flex justify-between">
                                <div><span className="text-xs font-mono text-stone-400 block">{item.code}</span><span className="font-bold text-stone-800 text-sm">{item.name}</span></div>
                                <div className="text-right"><span className="block font-black text-lg text-blue-600">{item.pending_stock}</span><span className="text-[10px] text-stone-400">Pendiente</span></div>
                            </div>
                            {selectedItem?.id === item.id && <div className="absolute top-0 right-0 p-1 bg-blue-500 rounded-bl-lg text-white"><ArrowRight size={14}/></div>}
                        </div>
                     ))
                    }
                </div>
            </div>

            {/* DERECHA: ACCIÓN */}
            <div className="flex flex-col h-full">
                {selectedItem ? (
                    <div className="bg-white p-8 rounded-xl shadow-xl border border-stone-200 sticky top-24 animate-in slide-in-from-right-4">
                        <div className="text-center mb-6"><div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3"><Move size={28}/></div><h3 className="text-lg font-black text-stone-800">Ubicar en Rack</h3></div>
                        <div className="space-y-5">
                            <div><label className="text-xs font-bold text-stone-500 uppercase">Cantidad a Guardar</label><div className="flex items-center gap-2"><input type="number" className="flex-1 border-2 border-blue-200 p-3 rounded-xl font-black text-2xl text-center text-blue-600 focus:border-blue-500 outline-none" value={moveQty} onChange={(e) => setMoveQty(e.target.value)} /><span className="text-xs font-bold text-stone-400">/ {selectedItem.pending_stock}</span></div></div>
                            <div><label className="text-xs font-bold text-stone-500 uppercase flex gap-2 mb-2"><MapPin size={14}/> Destino Físico</label><select className="w-full border-2 border-stone-200 p-3 rounded-xl bg-white font-bold text-stone-700 outline-none" value={targetLocation} onChange={e => setTargetLocation(e.target.value)}><option value="">-- Seleccionar --</option>{locations.map(l => <option key={l.id} value={l.id}>{l.full_code} ({l.zone})</option>)}</select></div>
                            <button onClick={handleMove} disabled={!targetLocation || !moveQty} className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-black shadow-lg flex justify-center gap-2"><CheckCircle size={20}/> Confirmar Ubicación</button>
                        </div>
                    </div>
                ) : (
                    <div className="h-full border-2 border-dashed border-stone-200 rounded-xl flex flex-col justify-center items-center bg-stone-50/50 text-stone-400 p-8"><Package size={48} className="opacity-30 mb-2"/><p>Selecciona un ítem de la izquierda</p></div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default PutAway;