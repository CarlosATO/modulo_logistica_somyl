import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, Package, Warehouse, ArrowLeft, Grid,
    MapPin, Move, CheckCircle, Loader, AlertCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import Combobox from '../components/Combobox';

const PutAway = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [warehouses, setWarehouses] = useState([]);
    const [warehouseCounts, setWarehouseCounts] = useState({}); // { warehouseId: count }
    const [selectedWarehouse, setSelectedWarehouse] = useState('');

    // Listas de datos
    const [stagingItems, setStagingItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);

    // Estado de la acción
    const [selectedItem, setSelectedItem] = useState(null);
    const [targetLocation, setTargetLocation] = useState('');
    const [moveQty, setMoveQty] = useState('');

    // 1. Cargar Bodegas y sus conteos de pendientes
    useEffect(() => {
        const load = async () => {
            setLoadingCounts(true);
            // Cargar bodegas
            const { data: whs } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
            setWarehouses(whs || []);

            // Cargar conteo de pendientes por bodega
            const { data: pending } = await supabase
                .from('view_pending_putaway')
                .select('warehouse_id, pending_stock')
                .gt('pending_stock', 0);

            // Agrupar por warehouse_id
            const counts = {};
            (pending || []).forEach(item => {
                counts[item.warehouse_id] = (counts[item.warehouse_id] || 0) + 1;
            });
            setWarehouseCounts(counts);
            setLoadingCounts(false);

            // Auto-seleccionar bodega con pendientes, o la primera
            const warehouseWithPending = whs?.find(w => counts[w.id] > 0);
            if (warehouseWithPending) {
                setSelectedWarehouse(warehouseWithPending.id);
            } else if (whs?.length > 0) {
                setSelectedWarehouse(whs[0].id);
            }
        };
        load();
    }, []);

    // 2. Cargar Inventario (OPTIMIZADO: Consultas paralelas y campos específicos)
    const fetchData = useCallback(async () => {
        if (!selectedWarehouse) return;

        setLoadingItems(true);
        setErrorMsg(null);
        setStagingItems([]);
        setSelectedItem(null);
        setMoveQty('');

        try {
            // OPTIMIZACIÓN: Consultas en paralelo con Promise.all
            const [locsResponse, pendingResponse] = await Promise.all([
                // A. Cargar solo campos necesarios de ubicaciones
                supabase
                    .from('locations')
                    .select('id, full_code, zone')
                    .eq('warehouse_id', selectedWarehouse)
                    .order('full_code'),

                // B. Cargar solo campos necesarios de vista
                supabase
                    .from('view_pending_putaway')
                    .select('id, code, name, pending_stock')
                    .eq('warehouse_id', selectedWarehouse)
                    .gt('pending_stock', 0) // Solo items con stock pendiente > 0
            ]);

            if (locsResponse.error) throw locsResponse.error;
            if (pendingResponse.error) throw pendingResponse.error;

            setLocations(locsResponse.data || []);
            setStagingItems(pendingResponse.data || []);

        } catch (error) {
            console.error("Error cargando datos:", error);
            setErrorMsg("Error al cargar el stock pendiente: " + error.message);
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
        if (!selectedItem || !targetLocation) {
            toast.error("⚠️ Faltan datos.");
            return;
        }
        const qty = Number(moveQty);
        if (qty <= 0 || qty > selectedItem.pending_stock) {
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
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* PASO 1: SELECTOR BODEGA CON CONTEO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">1</div>
                        <h3 className="font-bold text-slate-800">Bodega Operativa</h3>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => fetchData()} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors" title="Refrescar">
                            <RefreshCw size={18} className="text-slate-500" />
                        </button>
                        <button onClick={() => navigate('/gestion/ubicaciones')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors">
                            <Grid size={16} /> Configurar Racks
                        </button>
                    </div>
                </div>

                {/* WAREHOUSE SELECTOR CARDS */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {loadingCounts ? (
                        <div className="col-span-full text-center py-4 text-slate-400">
                            <Loader className="animate-spin mx-auto" size={24} />
                        </div>
                    ) : warehouses.map(wh => {
                        const count = warehouseCounts[wh.id] || 0;
                        const isSelected = selectedWarehouse === wh.id;
                        return (
                            <button
                                key={wh.id}
                                onClick={() => setSelectedWarehouse(wh.id)}
                                className={`p-4 rounded-xl border-2 text-left transition-all relative ${isSelected
                                        ? 'border-blue-500 bg-blue-50'
                                        : count > 0
                                            ? 'border-orange-300 bg-orange-50 hover:border-orange-400'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                            >
                                <Warehouse size={20} className={isSelected ? 'text-blue-600' : count > 0 ? 'text-orange-500' : 'text-slate-400'} />
                                <span className={`block font-bold mt-1 ${isSelected ? 'text-blue-700' : count > 0 ? 'text-orange-700' : 'text-slate-700'
                                    }`}>{wh.name}</span>
                                {count > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg animate-pulse">
                                        {count}
                                    </span>
                                )}
                                {count === 0 && (
                                    <span className="text-xs text-slate-400 mt-1">Sin pendientes</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-3 text-red-700">
                    <AlertCircle size={24} />
                    <div><p className="font-bold">Error</p><p className="text-sm">{errorMsg}</p></div>
                </div>
            )}

            {/* PASO 2: PANEL PRINCIPAL */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">2</div>
                    <h3 className="font-bold text-slate-800">Ubicar Stock en Racks</h3>
                    <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                        {stagingItems.length} pendientes
                    </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* IZQUIERDA: PENDIENTES */}
                    <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col h-[500px]">
                        <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Package size={18} className="text-blue-500" /> RECEPCIÓN / SIN UBICAR
                        </h4>

                        <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                            {loadingItems ? (
                                <div className="text-center py-20 text-slate-400">
                                    <Loader className="animate-spin mx-auto mb-2" size={32} />
                                    <p>Buscando stock...</p>
                                </div>
                            ) : stagingItems.length === 0 ? (
                                <div className="text-center py-20 text-slate-400">
                                    <CheckCircle size={48} className="mx-auto mb-2 opacity-30" />
                                    <p className="font-medium">Todo ordenado</p>
                                </div>
                            ) : (
                                stagingItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectItem(item)}
                                        className={`bg-white p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedItem?.id === item.id
                                            ? 'border-blue-500 ring-4 ring-blue-100 shadow-lg'
                                            : 'border-transparent hover:border-blue-200 hover:shadow-md'
                                            }`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <span className="text-xs font-mono text-slate-400 block">{item.code}</span>
                                                <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block font-black text-xl text-blue-600">{item.pending_stock}</span>
                                                <span className="text-[10px] text-slate-400 uppercase">Pendiente</span>
                                            </div>
                                        </div>
                                        {selectedItem?.id === item.id && (
                                            <div className="absolute top-0 right-0 p-1 bg-blue-500 rounded-bl-lg text-white">
                                                <ArrowRight size={14} />
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* DERECHA: ACCIÓN */}
                    <div className="flex flex-col">
                        {selectedItem ? (
                            <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-6 rounded-xl border border-blue-100 animate-in slide-in-from-right-4">
                                <div className="text-center mb-6">
                                    <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Move size={28} />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-800">Ubicar en Rack</h3>
                                    <p className="text-sm text-slate-500 mt-1">{selectedItem.name}</p>
                                </div>

                                <div className="space-y-5">
                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Cantidad a Guardar</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                className="flex-1 border-2 border-blue-200 p-3 rounded-xl font-black text-2xl text-center text-blue-600 focus:border-blue-500 outline-none bg-white"
                                                value={moveQty}
                                                onChange={(e) => setMoveQty(e.target.value)}
                                            />
                                            <span className="text-sm font-bold text-slate-400">/ {selectedItem.pending_stock}</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-500 uppercase flex gap-2 mb-2">
                                            <MapPin size={14} /> Destino Físico
                                        </label>
                                        <Combobox
                                            options={locations.map(l => ({ id: l.id, name: `${l.full_code} (${l.zone})` }))}
                                            value={targetLocation}
                                            onChange={setTargetLocation}
                                            placeholder="-- Seleccionar Rack --"
                                        />
                                    </div>

                                    <button
                                        onClick={handleMove}
                                        disabled={!targetLocation || !moveQty}
                                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                    >
                                        <CheckCircle size={20} /> Confirmar Ubicación
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-xl flex flex-col justify-center items-center bg-slate-50/50 text-slate-400 p-8">
                                <Package size={48} className="opacity-30 mb-3" />
                                <p className="font-medium">Selecciona un ítem de la izquierda</p>
                                <p className="text-sm mt-1">para ubicarlo en un rack</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PutAway;