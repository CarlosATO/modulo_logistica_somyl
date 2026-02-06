import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, Package, Warehouse, Grid,
    MapPin, Move, CheckCircle, Loader, AlertCircle, RefreshCw, Layers, Search
} from 'lucide-react';
import { toast } from 'sonner';
import Combobox from '../components/Combobox';

const PutAway = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [warehouses, setWarehouses] = useState([]);
    const [warehouseCounts, setWarehouseCounts] = useState({});
    const [selectedWarehouse, setSelectedWarehouse] = useState('');

    const [stagingItems, setStagingItems] = useState([]);
    const [locations, setLocations] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [errorMsg, setErrorMsg] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [selectedItem, setSelectedItem] = useState(null);
    const [targetLocation, setTargetLocation] = useState('');
    const [moveQty, setMoveQty] = useState('');

    // 1. Cargar Bodegas y Conteos
    useEffect(() => {
        const load = async () => {
            setLoadingCounts(true);
            try {
                const { data: whs } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
                setWarehouses(whs || []);

                // Carga optimizada de conteos (similar a la lógica anterior)
                const [movesRes, racksRes] = await Promise.all([
                    supabase.from('movements').select('warehouse_id, product_id, type, quantity').range(0, 9999),
                    supabase.from('product_locations').select('warehouse_id, product_id, quantity').range(0, 9999)
                ]);

                const moves = movesRes.data || [];
                const racks = racksRes.data || [];
                const accountingMap = {};
                const physicalMap = {};

                moves.forEach(m => {
                    if (!accountingMap[m.warehouse_id]) accountingMap[m.warehouse_id] = {};
                    if (!accountingMap[m.warehouse_id][m.product_id]) accountingMap[m.warehouse_id][m.product_id] = 0;
                    const qty = Number(m.quantity);
                    if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') accountingMap[m.warehouse_id][m.product_id] += qty;
                    else if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') accountingMap[m.warehouse_id][m.product_id] -= qty;
                });

                racks.forEach(r => {
                    if (!physicalMap[r.warehouse_id]) physicalMap[r.warehouse_id] = {};
                    if (!physicalMap[r.warehouse_id][r.product_id]) physicalMap[r.warehouse_id][r.product_id] = 0;
                    physicalMap[r.warehouse_id][r.product_id] += Number(r.quantity);
                });

                const counts = {};
                if (whs) {
                    whs.forEach(w => {
                        let pendingCount = 0;
                        const whStock = accountingMap[w.id] || {};
                        const whRacked = physicalMap[w.id] || {};
                        Object.keys(whStock).forEach(pid => {
                            if ((whStock[pid] || 0) - (whRacked[pid] || 0) > 0) pendingCount++;
                        });
                        counts[w.id] = pendingCount;
                    });
                }
                setWarehouseCounts(counts);

                if (whs?.length > 0 && !selectedWarehouse) setSelectedWarehouse(whs[0].id);

            } catch (err) {
                console.error("Error loading counts:", err);
            } finally {
                setLoadingCounts(false);
            }
        };
        load();
    }, []);

    // 2. Cargar Inventario
    const fetchData = useCallback(async () => {
        if (!selectedWarehouse) return;
        setLoadingItems(true);
        setErrorMsg(null);
        setStagingItems([]);
        setSelectedItem(null);
        setMoveQty('');

        try {
            const [locsResponse, movesResponse, racksResponse, prodsResponse] = await Promise.all([
                supabase.from('locations').select('id, full_code, zone').eq('warehouse_id', selectedWarehouse).order('full_code').range(0, 9999),
                supabase.from('movements').select('product_id, type, quantity').eq('warehouse_id', selectedWarehouse).range(0, 9999),
                supabase.from('product_locations').select('product_id, quantity').eq('warehouse_id', selectedWarehouse).range(0, 9999),
                supabase.from('products').select('id, code, name').range(0, 9999)
            ]);

            const stockMap = {};
            if (movesResponse.data && prodsResponse.data) {
                movesResponse.data.forEach(m => {
                    const qty = Number(m.quantity);
                    if (!stockMap[m.product_id]) stockMap[m.product_id] = 0;
                    if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') stockMap[m.product_id] += qty;
                    else if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') stockMap[m.product_id] -= qty;
                });

                (racksResponse.data || []).forEach(r => {
                    if (stockMap[r.product_id]) stockMap[r.product_id] -= Number(r.quantity);
                });
            }

            const pendingList = [];
            Object.keys(stockMap).forEach(pid => {
                if (stockMap[pid] > 0) {
                    const prod = prodsResponse.data.find(p => p.id === pid);
                    if (prod) pendingList.push({ id: prod.id, code: prod.code, name: prod.name, pending_stock: stockMap[pid] });
                }
            });

            setLocations(locsResponse.data || []);
            setStagingItems(pendingList.sort((a, b) => b.pending_stock - a.pending_stock));

        } catch (error) {
            console.error(error);
            setErrorMsg("Error al obtener datos.");
        } finally {
            setLoadingItems(false);
        }
    }, [selectedWarehouse]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSelectItem = (item) => {
        setSelectedItem(item);
        setMoveQty(item.pending_stock);
        setTargetLocation('');
    };

    const handleMove = async () => {
        if (!selectedItem || !targetLocation) return toast.error("Faltan datos.");
        const qty = Number(moveQty);
        if (qty <= 0 || qty > selectedItem.pending_stock) return toast.error("Cantidad inválida.");

        try {
            const locObj = locations.find(l => l.id === targetLocation);
            const fullCode = locObj ? locObj.full_code : 'Bodega';

            const { data: existingLoc } = await supabase.from('product_locations')
                .select('id, quantity').eq('location_id', targetLocation).eq('product_id', selectedItem.id).maybeSingle();

            if (existingLoc) {
                await supabase.from('product_locations').update({ quantity: Number(existingLoc.quantity) + qty }).eq('id', existingLoc.id);
            } else {
                await supabase.from('product_locations').insert({
                    product_id: selectedItem.id, warehouse_id: selectedWarehouse, location_id: targetLocation, quantity: qty
                });
            }

            await supabase.from('movements').insert({
                type: 'PUTAWAY', warehouse_id: selectedWarehouse, quantity: qty, product_id: selectedItem.id,
                comments: `Ubicado: ${qty} UN en ${fullCode}`, other_data: `COD: ${selectedItem.code} | Loc: ${fullCode}`, user_email: user?.email
            });

            toast.success(`✅ Ubicado en ${fullCode}`);
            fetchData();
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar.");
        }
    };

    const filteredItems = stagingItems.filter(i =>
        i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300 h-[calc(100vh-100px)] flex flex-col">

            {/* COMPACT HEADER & WAREHOUSE SELECTOR */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Layers size={24} /></div>
                    <div>
                        <h1 className="font-bold text-slate-800 text-lg leading-tight">Put Away <span className="text-slate-400 font-normal">| Ubicación de Stock</span></h1>
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 md:pb-0">
                    {loadingCounts ? <Loader className="animate-spin text-slate-400" /> : warehouses.map(wh => {
                        const count = warehouseCounts[wh.id] || 0;
                        const isSelected = selectedWarehouse === wh.id;
                        return (
                            <button key={wh.id} onClick={() => setSelectedWarehouse(wh.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all whitespace-nowrap ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-indigo-300'}`}>
                                <Warehouse size={16} />
                                <span className="font-bold">{wh.name}</span>
                                {count > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white text-indigo-600' : 'bg-orange-500 text-white'}`}>{count}</span>}
                            </button>
                        )
                    })}
                </div>

                <div className="flex gap-2">
                    <button onClick={fetchData} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><RefreshCw size={18} /></button>
                    <button onClick={() => navigate('/gestion/ubicaciones')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><Grid size={18} /></button>
                </div>
            </div>

            {/* MAIN CONTENT SPLIT */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

                {/* LEFT: PENDING LIST (TABLE) */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                    <div className="p-4 border-b flex justify-between items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Filtrar por nombre o código..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            {filteredItems.length} Pendientes
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3">Material</th>
                                    <th className="px-4 py-3 text-center">Pendiente</th>
                                    <th className="px-4 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loadingItems ? (
                                    <tr><td colSpan="3" className="py-20 text-center"><Loader className="animate-spin mx-auto text-indigo-500" /></td></tr>
                                ) : filteredItems.length === 0 ? (
                                    <tr><td colSpan="3" className="py-20 text-center text-slate-400 italic">No hay stock pendiente de ubicar en racks.</td></tr>
                                ) : (
                                    filteredItems.map(item => (
                                        <tr
                                            key={item.id}
                                            onClick={() => handleSelectItem(item)}
                                            className={`hover:bg-indigo-50 cursor-pointer transition-colors border-l-4 ${selectedItem?.id === item.id ? 'bg-indigo-50 border-l-indigo-500' : 'border-l-transparent'}`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700">{item.name}</div>
                                                <div className="text-[10px] font-mono text-slate-400">{item.code}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="bg-orange-100 text-orange-700 font-bold px-2 py-1 rounded text-xs">
                                                    {item.pending_stock}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-400">
                                                <ArrowRight size={16} className={selectedItem?.id === item.id ? 'text-indigo-600' : ''} />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* RIGHT: ACTION PANEL */}
                <div className="w-full lg:w-96 flex flex-col gap-4">
                    {selectedItem ? (
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-indigo-100 sticky top-4 animate-in slide-in-from-right-4">
                            <div className="mb-6 pb-6 border-b border-indigo-50">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 block">Item Seleccionado</span>
                                <h3 className="text-lg font-black text-slate-800 leading-tight mb-1">{selectedItem.name}</h3>
                                <p className="font-mono text-xs text-slate-400">{selectedItem.code}</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">1. Cantidad a Ubicar</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            className="w-full border-2 border-indigo-100 p-3 rounded-xl text-center text-xl font-black text-indigo-600 focus:border-indigo-500 outline-none transition-all"
                                            value={moveQty}
                                            onChange={e => setMoveQty(e.target.value)}
                                        />
                                        <span className="text-xs font-bold text-slate-400 whitespace-nowrap">de {selectedItem.pending_stock}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">2. Rack de Destino</label>
                                    <Combobox
                                        options={locations.map(l => ({ id: l.id, name: `${l.full_code} (${l.zone})` }))}
                                        value={targetLocation}
                                        onChange={setTargetLocation}
                                        placeholder="Buscar posición..."
                                        className="shadow-sm"
                                    />
                                </div>

                                <button
                                    onClick={handleMove}
                                    disabled={!targetLocation || !moveQty}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={20} /> Confirmar Ubicación
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center h-64 text-slate-400">
                            <Move size={48} className="mb-4 opacity-20" />
                            <p className="font-medium text-sm">Selecciona un ítem de la lista</p>
                            <p className="text-xs mt-1">para asignarle una ubicación</p>
                        </div>
                    )}

                    {/* Info Card */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs text-blue-800">
                        <p className="font-bold flex items-center gap-2 mb-1"><AlertCircle size={14} /> Nota Importante</p>
                        <p className="opacity-80">El stock pendiente se calcula restando lo que ya está en racks a las entradas totales.</p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default PutAway;