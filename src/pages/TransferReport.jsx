import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    FileSpreadsheet, Search, ArrowLeft, Calendar,
    MapPin, Loader, FileText, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

export default function TransferReport() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [movements, setMovements] = useState([]);

    // Filters
    const [selectedOrigin, setSelectedOrigin] = useState('');
    const [selectedDestination, setSelectedDestination] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(1); // First day of current month
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        return new Date().toISOString().split('T')[0];
    });

    const [warehousesList, setWarehousesList] = useState([]);
    const [warehousesMap, setWarehousesMap] = useState({});

    // Fetch master data (warehouses) for name mapping and dropdowns
    useEffect(() => {
        const fetchMasterData = async () => {
            const { data } = await supabase.from('warehouses').select('id, name').order('name');
            if (data) {
                setWarehousesList(data);
                const map = {};
                data.forEach(w => map[w.id] = w.name);
                setWarehousesMap(map);
            }
        };
        fetchMasterData();
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        try {
            // 1. Fetch Movements (TRANSFER_OUT) in date range
            let query = supabase
                .from('movements')
                .select(`
                    *,
                    products (name, code)
                `)
                .eq('type', 'TRANSFER_OUT')
                .gte('created_at', `${startDate}T00:00:00`)
                .lte('created_at', `${endDate}T23:59:59`)
                .order('created_at', { ascending: false });

            // Apply Origin Filter (Direct DB Filter)
            if (selectedOrigin) {
                query = query.eq('warehouse_id', selectedOrigin);
            }

            const { data: moves, error } = await query;
            if (error) throw error;

            if (!moves || moves.length === 0) {
                setMovements([]);
                setLoading(false);
                return;
            }

            // 2. Fetch Transfer Headers to get Destination Info
            const transferNumbers = [...new Set(moves.map(m => m.transfer_number))];

            const { data: headers, error: headError } = await supabase
                .from('transfers')
                .select('transfer_number, destination_warehouse_id, destination_project_name, origin_project_name')
                .in('transfer_number', transferNumbers);

            if (headError) throw headError;

            // Map headers for quick lookup
            const headerMap = {};
            headers?.forEach(h => headerMap[h.transfer_number] = h);

            // 3. Assemble Final Data AND Apply Destination Filter (In Memory)
            let reportData = moves.map(m => {
                const header = headerMap[m.transfer_number] || {};
                return {
                    id: m.id,
                    date: new Date(m.created_at).toLocaleDateString() + ' ' + new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    folio: m.transfer_number,
                    origin_wh_id: m.warehouse_id,
                    origin_wh: warehousesMap[m.warehouse_id] || 'Desconocida',
                    origin_proj: header.origin_project_name || '-',
                    dest_wh_id: header.destination_warehouse_id, // Store ID for filtering
                    dest_wh: warehousesMap[header.destination_warehouse_id] || 'Desconocida',
                    dest_proj: header.destination_project_name || '-',
                    code: m.products?.code,
                    product: m.products?.name,
                    quantity: m.quantity,
                    user: m.user_email
                };
            });

            // Apply Destination Filter
            if (selectedDestination) {
                reportData = reportData.filter(item => item.dest_wh_id === selectedDestination);
            }

            setMovements(reportData);

        } catch (error) {
            console.error("Error fetching report:", error);
            alert("Error cargando informe: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        if (movements.length === 0) return;

        // Prepare data for Excel
        const dataToExport = movements.map(m => ({
            "Fecha": m.date,
            "Folio": m.folio,
            "Bodega Origen": m.origin_wh,
            "Proyecto Origen": m.origin_proj,
            "Bodega Destino": m.dest_wh,
            "Proyecto Destino": m.dest_proj,
            "Código": m.code,
            "Material": m.product,
            "Cantidad": m.quantity,
            "Usuario": m.user
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Traspasos");
        XLSX.writeFile(wb, `Informe_Traspasos_${startDate}_${endDate}.xlsx`);
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <FileSpreadsheet className="text-emerald-600" size={24} />
                            Informe de Materiales Traspasados
                        </h1>
                        <p className="text-xs text-slate-500">Detalle de movimientos entre bodegas</p>
                    </div>
                </div>
            </div>

            {/* Filters Bar - Compact & Elegant */}
            <div className="px-6 py-4">
                <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-3">

                    {/* Origin Warehouse */}
                    <div className="w-48">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Bodega Origen</label>
                        <div className="relative">
                            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <select
                                value={selectedOrigin}
                                onChange={(e) => setSelectedOrigin(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-xs font-medium appearance-none"
                            >
                                <option value="">Todas</option>
                                {warehousesList.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Destination Warehouse */}
                    <div className="w-48">
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Bodega Destino</label>
                        <div className="relative">
                            <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <select
                                value={selectedDestination}
                                onChange={(e) => setSelectedDestination(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-xs font-medium appearance-none"
                            >
                                <option value="">Todas</option>
                                {warehousesList.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="w-px h-8 bg-slate-100 mx-1"></div>

                    {/* Start Date */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Desde</label>
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-xs font-medium"
                            />
                        </div>
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Hasta</label>
                        <div className="relative">
                            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-xs font-medium"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 ml-auto">
                        <button
                            onClick={fetchReport}
                            className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2 text-xs transition-all h-[34px]"
                        >
                            <Search size={14} /> Buscar
                        </button>

                        <button
                            onClick={handleExport}
                            disabled={movements.length === 0}
                            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-emerald-700 shadow-sm flex items-center gap-2 text-xs transition-all h-[34px] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={14} /> Exportar
                        </button>
                    </div>

                </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-hidden">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden">
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Fecha</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Folio</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Origen</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Destino</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Material</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Cantidad</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Usuario</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr><td colSpan="7" className="p-10 text-center"><Loader className="animate-spin mx-auto text-indigo-500" /></td></tr>
                                ) : movements.length === 0 ? (
                                    <tr><td colSpan="7" className="p-10 text-center text-slate-400 italic">No hay datos para el filtro seleccionado.</td></tr>
                                ) : (
                                    movements.map((m) => (
                                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{m.date}</td>
                                            <td className="px-4 py-2.5"><span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-100">{m.folio}</span></td>
                                            <td className="px-4 py-2.5 text-xs">
                                                <div className="font-bold text-slate-700">{m.origin_wh}</div>
                                                <div className="text-[10px] text-slate-400">{m.origin_proj}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs">
                                                <div className="font-bold text-slate-700">{m.dest_wh}</div>
                                                <div className="text-[10px] text-slate-400">{m.dest_proj}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs">
                                                <div className="font-bold text-slate-700">{m.product}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{m.code}</div>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-right font-bold text-slate-700">{m.quantity}</td>
                                            <td className="px-4 py-2.5 text-[10px] text-slate-400 truncate max-w-[150px]">{m.user}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="bg-slate-50 border-t px-4 py-2 text-[10px] text-slate-400 flex justify-between">
                        <span>Total Registros: {movements.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
