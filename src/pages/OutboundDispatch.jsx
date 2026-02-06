import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    Search, FileText, Loader, CheckCircle2, Truck, Trash2, ArrowUpRight, Eye, Plus, ArrowRightCircle
} from 'lucide-react';
import { toast } from 'sonner';
import OutboundDispatchForm from './OutboundDispatchForm';
import OutboundDispatchDetail from './OutboundDispatchDetail';

export default function OutboundDispatch() {
    const [dispatches, setDispatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Para ver detalles (Drawer)
    const [selectedDispatch, setSelectedDispatch] = useState(null);

    const fetchDispatches = async () => {
        setLoading(true);
        try {
            // Traer todos los movimientos de salida
            // Nota: Se trae información plana, la agrupación se hace en cliente
            const { data, error } = await supabase
                .from('movements')
                .select(`
                    id, created_at, document_number, warehouse_id, project_id, 
                    quantity, comments, client_owner, reception_document_url,
                    warehouses(name),
                    products(code, name)
                `)
                .eq('type', 'OUTBOUND')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Agrupar por Folio (document_number)
            const grouped = {};
            data.forEach(m => {
                const folio = m.document_number || 'S/F';
                if (!grouped[folio]) {
                    grouped[folio] = {
                        folio,
                        date: m.created_at,
                        warehouse: m.warehouses?.name || 'Desconocido',
                        project_id: m.project_id,
                        receiver: m.client_owner, // Asumimos que aquí se guardó el receptor
                        stage: m.comments, // Asumimos que aquí se guardó la etapa/glosa
                        document_url: m.reception_document_url,
                        items: [],
                        total_items: 0
                    };
                }
                grouped[folio].items.push({
                    product: m.products?.name,
                    code: m.products?.code,
                    qty: m.quantity
                });
                grouped[folio].total_items += 1; // Contamos ítems (líneas)
            });

            // Convertir a array
            const list = Object.values(grouped);

            setDispatches(list.sort((a, b) => new Date(b.date) - new Date(a.date)));
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar historial de despachos");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDispatches(); }, []);

    const filteredData = dispatches.filter(d =>
        d.folio.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.receiver && d.receiver.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const handleOpenPdf = (url, e) => {
        e.stopPropagation();
        if (!url) return toast.error("No hay documento adjunto");
        const { data } = supabase.storage.from('documents').getPublicUrl(url);
        window.open(data.publicUrl, '_blank');
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <ArrowRightCircle className="text-indigo-600" /> Registro de Salida (Despacho)
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Control de entregas, subcontratos y transferencias</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                >
                    <Plus size={20} /> Nuevo Despacho
                </button>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                <Search className="text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar por Folio, Receptor, Proyecto..."
                    className="w-full outline-none text-slate-700 font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Fecha / Folio</th>
                            <th className="px-6 py-4">Origen</th>
                            <th className="px-6 py-4">Destino / Receptor</th>
                            <th className="px-6 py-4 text-center">Ítems</th>
                            <th className="px-6 py-4 text-center">PDF</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan="5" className="py-20 text-center"><Loader className="animate-spin mx-auto text-indigo-500" /></td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan="5" className="py-20 text-center text-slate-400 font-medium">No se encontraron despachos registrados.</td></tr>
                        ) : (
                            filteredData.map((item, idx) => (
                                <tr
                                    key={idx}
                                    onClick={() => setSelectedDispatch(item)}
                                    className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                >
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{item.folio}</div>
                                        <div className="text-xs text-slate-400">{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-600">
                                        {item.warehouse}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-indigo-900">{item.receiver || 'Sin Receptor'}</div>
                                        {/* Aquí podríamos mostrar el Proyecto si logramos mapearlo, por ahora mostramos etapa/comentario */}
                                        <div className="text-xs text-slate-500 truncate max-w-[200px]">{item.stage}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{item.total_items}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {item.document_url ? (
                                            <button
                                                onClick={(e) => handleOpenPdf(item.document_url, e)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors"
                                                title="Ver Guía Firmada"
                                            >
                                                <FileText size={18} />
                                            </button>
                                        ) : (
                                            <span className="text-slate-200 text-xs">Pendiente</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Form */}
            {isFormOpen && (
                <OutboundDispatchForm
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => { setIsFormOpen(false); fetchDispatches(); }}
                />
            )}

            {/* Drawer Detail */}
            {selectedDispatch && (
                <OutboundDispatchDetail
                    dispatch={selectedDispatch}
                    onClose={() => setSelectedDispatch(null)}
                />
            )}
        </div>
    );
}