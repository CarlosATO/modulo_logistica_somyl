import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Package, Warehouse, ArrowLeft, Grid } from 'lucide-react';

const PutAway = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [stagingItems, setStagingItems] = useState([]);
  const [locations, setLocations] = useState([]);
  
  // Estado para mover
  const [selectedItem, setSelectedItem] = useState(null);
  const [targetLocation, setTargetLocation] = useState('');
  const [quantityToMove, setQuantityToMove] = useState('');

  // Cargar Bodegas
  useEffect(() => {
      const load = async () => {
          if (!user) return;
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          if (profile) {
              const { data } = await supabase.from('logis_warehouses').select('*').eq('organization_id', profile.organization_id).eq('is_active', true);
              setWarehouses(data || []);
              if(data?.[0]) setSelectedWarehouse(data[0].id);
          }
      };
      load();
  }, [user]);

  // Cargar Datos de la Bodega
  const fetchData = useCallback(async () => {
      if(!selectedWarehouse) return;
      
      // 1. Buscar zona RECEPCIÓN
      const { data: receptionLoc } = await supabase.from('logis_locations').select('id').eq('warehouse_id', selectedWarehouse).eq('is_staging', true).single();
      
      if(receptionLoc) {
          // PROTECCIÓN: Traemos los datos del producto. Si falla el join, product será null.
          const { data: inventory } = await supabase.from('logis_inventory')
            .select('*, product:product_id(name, sku, unit)')
            .eq('location_id', receptionLoc.id)
            .gt('current_stock', 0);
          setStagingItems(inventory || []);
      } else {
          setStagingItems([]);
      }

      // 2. Traer ubicaciones destino
      // NOTA: Ordenamos por ZONE para que coincida con tu base de datos nueva
      const { data: locs } = await supabase.from('logis_locations')
        .select('*')
        .eq('warehouse_id', selectedWarehouse)
        .eq('is_staging', false)
        .order('zone') 
        .order('section')
        .order('level');
      setLocations(locs || []);

  }, [selectedWarehouse]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // MOVER STOCK
  const handleMove = async () => {
      if(!selectedItem || !targetLocation || !quantityToMove) return;
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          
          // 1. SALIDA DE RECEPCIÓN
          const { error: outError } = await supabase.from('logis_movements').insert({
              organization_id: profile.organization_id, warehouse_id: selectedWarehouse,
              product_id: selectedItem.product_id, location_id: selectedItem.location_id,
              movement_type: 'TRANSFER_OUT', quantity: Number(quantityToMove),
              user_id: user.id, comments: 'Put-away'
          });
          if(outError) throw outError;

          // 2. ENTRADA A UBICACIÓN FINAL
          const { error: inError } = await supabase.from('logis_movements').insert({
              organization_id: profile.organization_id, warehouse_id: selectedWarehouse,
              product_id: selectedItem.product_id, location_id: targetLocation,
              movement_type: 'TRANSFER_IN', quantity: Number(quantityToMove),
              user_id: user.id, comments: 'Put-away'
          });
          if(inError) throw inError;

          alert("Material ubicado correctamente.");
          setSelectedItem(null); setQuantityToMove(''); setTargetLocation('');
          fetchData();
      } catch (error) { alert(error.message); }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">

      <div className="max-w-6xl mx-auto px-6 py-8">
        
        <div className="bg-white p-4 rounded-xl shadow-sm border mb-6 flex items-center gap-4">
            <Warehouse className="text-stone-400" />
            <div className="flex-1">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Bodega Operativa</label>
                <select className="bg-transparent font-bold text-stone-800 outline-none text-lg w-full cursor-pointer" value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)}>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* IZQUIERDA: RECEPCIÓN */}
            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 shadow-sm">
                <h3 className="font-bold text-blue-800 mb-4 flex justify-between items-center">
                    <span>ZONA DE RECEPCIÓN</span>
                    <span className="bg-blue-200 text-blue-900 text-xs px-2 py-1 rounded-full font-bold">{stagingItems.length} Ítems</span>
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {stagingItems.length === 0 && <div className="text-center py-10 opacity-50"><Package size={40} className="mx-auto mb-2"/><p className="text-sm font-medium">Todo ordenado.</p></div>}
                    {stagingItems.map(item => (
                        <div key={item.id} onClick={() => { setSelectedItem(item); setQuantityToMove(item.current_stock); }}
                            className={`bg-white p-4 rounded-lg shadow-sm cursor-pointer border-l-4 transition-all ${selectedItem?.id === item.id ? 'border-blue-600 ring-2 ring-blue-200 translate-x-2' : 'border-transparent hover:shadow-md'}`}>
                            <div className="flex justify-between items-center">
                                {/* PROTECCIÓN AQUÍ: Usamos ?. para evitar pantalla blanca */}
                                <span className="font-bold text-stone-800 text-sm">{item.product?.name || 'Producto Desconocido'}</span>
                                <span className="font-mono font-bold text-blue-600 text-sm">{item.current_stock} {item.product?.unit || 'UN'}</span>
                            </div>
                            <div className="text-xs text-stone-400 font-mono mt-1">{item.product?.sku || 'S/N'}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* DERECHA: MOVER */}
            <div className="flex flex-col justify-center">
                {selectedItem ? (
                    <div className="bg-white p-8 rounded-xl shadow-lg border border-stone-200 animate-fade-in sticky top-24">
                        <h3 className="text-xl font-bold text-stone-800 mb-6 text-center border-b pb-4">Mover a Estantería</h3>
                        <div className="mb-6 text-center bg-stone-50 p-4 rounded-lg border border-stone-100">
                            <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">Producto</p>
                            {/* PROTECCIÓN AQUÍ TAMBIÉN */}
                            <p className="text-lg font-bold text-blue-600">{selectedItem.product?.name || 'Desconocido'}</p>
                            <p className="text-xs text-stone-400 mt-1">Disponible: {selectedItem.current_stock}</p>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Cantidad a Mover</label>
                                <div className="relative">
                                    <input type="number" className="w-full border-2 border-stone-200 p-3 rounded-lg font-mono text-lg text-center focus:border-blue-500 outline-none transition-colors" value={quantityToMove} onChange={e => setQuantityToMove(e.target.value)} />
                                    <span className="absolute right-4 top-3.5 text-sm text-stone-400 font-bold">{selectedItem.product?.unit}</span>
                                </div>
                            </div>
                            <div className="flex justify-center py-2 text-stone-300"><ArrowRight size={32} /></div>
                            <div>
                                <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Destino</label>
                                <select className="w-full border-2 border-stone-200 p-3 rounded-lg bg-white font-bold text-stone-700 focus:border-orange-500 outline-none" value={targetLocation} onChange={e => setTargetLocation(e.target.value)}>
                                    <option value="">-- Seleccionar Ubicación --</option>
                                    {locations.map(l => (
                                        // Mostramos Full Code, Zona, Sección y Nivel
                                        <option key={l.id} value={l.id}>
                                            {l.full_code ? `[${l.full_code}]` : ''} {l.zone} - {l.section} - {l.level}
                                        </option>
                                    ))}
                                </select>
                                {locations.length === 0 && <p className="text-xs text-red-500 mt-1 font-bold">⚠️ No hay ubicaciones creadas.</p>}
                            </div>
                            <button onClick={handleMove} className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-black shadow-lg transition-transform active:scale-95 mt-4 text-sm uppercase tracking-wider">Confirmar Ubicación</button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-stone-400 border-2 border-dashed border-stone-200 rounded-xl p-12 h-full flex flex-col justify-center items-center bg-stone-50/50">
                        <Package size={48} className="mb-4 opacity-20" />
                        <p className="font-medium">Selecciona un ítem de la izquierda.</p>
                    </div>
                )}
            </div>

        </div>
      </div>
    </div>
  );
};

export default PutAway;