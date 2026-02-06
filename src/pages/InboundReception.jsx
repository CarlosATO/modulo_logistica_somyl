import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import {
    Search, FileText, Loader, CheckCircle2, Clock, Trash2, Edit3, ExternalLink, Plus, ArrowDownCircle
} from 'lucide-react';
import { toast } from 'sonner';
import DirectInboundDetailModal from './DirectInboundDetailModal';
import InboundReceptionForm from './InboundReceptionForm';

export default function InboundReception() {
    const [receptions, setReceptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReception, setSelectedReception] = useState(null);
    const [isFormOpen, setIsFormOpen] = useState(false);

    const fetchReceptions = async () => {
        setLoading(true);
        try {
            // Obtener recepciones desde la vista actualizada
            const { data: receptionsData, error: receptionsError } = await supabase
                .from('v_direct_receptions_summary')
                .select('*')
                .order('date', { ascending: false });

            if (receptionsError) throw receptionsError;

            // Obtener nombres de bodegas
            const { data: warehousesData } = await supabase.from('warehouses').select('id, name');
            const warehousesMap = {};
            (warehousesData || []).forEach(wh => { warehousesMap[wh.id] = wh.name; });

            // Enriquecer datos
            const enrichedData = (receptionsData || []).map(item => {
                let finalProjectName = item.project_name;

                if (!finalProjectName || finalProjectName === 'null') {
                    if (item.comments && item.comments.includes('|')) {
                        finalProjectName = item.comments.split('|')[1]?.trim();
                    } else {
                        finalProjectName = 'Sin Proyecto';
                    }
                }

                return {
                    ...item,
                    warehouse_name: warehousesMap[item.warehouse_id] || 'N/A',
                    project_name: finalProjectName,
                    reception_document_url: item.document_url
                };
            });

            setReceptions(enrichedData);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReceptions(); }, []);

    const filteredData = receptions.filter(r =>
        r.document_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.comments?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.project_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDelete = async (docNumber) => {
        const confirmDelete = window.confirm(`⚠️ ¿Estás seguro de eliminar el ingreso ${docNumber}?`);
        if (!confirmDelete) return;

        try {
            const { error } = await supabase.rpc('delete_direct_reception', { p_document_number: docNumber });
            if (error) throw error;
            toast.success("Ingreso eliminado correctamente");
            fetchReceptions();
        } catch (error) {
            toast.error("Error al eliminar: " + error.message);
        }
    };

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
                        <ArrowDownCircle className="text-emerald-600" /> Recepción de Materiales
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Gestión y control de ingresos a bodega</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                >
                    <Plus size={20} /> Nuevo Ingreso
                </button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                <Search className="text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar por N° Guía, Proyecto, Proveedor..."
                    className="w-full outline-none text-slate-700 font-medium"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                        <tr>
                            <th className="px-6 py-4">Fecha</th>
                            <th className="px-6 py-4">Documento / Proyecto</th>
                            <th className="px-6 py-4">Proveedor</th>
                            <th className="px-6 py-4 text-center">Items</th>
                            <th className="px-6 py-4 text-center">PDF</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan="6" className="py-20 text-center"><Loader className="animate-spin mx-auto text-emerald-500" /></td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan="6" className="py-20 text-center text-slate-400 font-medium">No se encontraron ingresos registrados.</td></tr>
                        ) : (
                            filteredData.map((rec, idx) => (
                                <tr
                                    key={idx}
                                    onDoubleClick={() => setSelectedReception(rec)}
                                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                >
                                    <td className="px-6 py-4 font-medium text-slate-600">
                                        {new Date(rec.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        <div className="text-[10px] text-slate-400">{new Date(rec.date).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{rec.document_number}</div>
                                        <div className="text-xs text-emerald-600 font-bold">{rec.project_name}</div>
                                    </td>
                                    <td className="px-6 py-4 font-medium">
                                        {rec.document_number?.startsWith('ADJ-') ? (
                                            <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-lg text-xs font-bold">
                                                📦 Ajuste Inventario
                                            </span>
                                        ) : rec.supplier_name === 'Proveedor General' ? (
                                            <span className="text-blue-600 bg-blue-50 px-2 py-1 rounded-lg text-xs font-bold">
                                                📥 Ingreso Directo
                                            </span>
                                        ) : (
                                            <span className="text-slate-700">{rec.supplier_name}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{rec.total_items}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {rec.reception_document_url ? (
                                            <button
                                                onClick={(e) => handleOpenPdf(rec.reception_document_url, e)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-full transition-colors"
                                                title="Ver PDF"
                                            >
                                                <FileText size={18} />
                                            </button>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {rec.status === 'PENDING_STORAGE' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDelete(rec.document_number); }}
                                                className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                                                title="Eliminar"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalle (Existente) */}
            {selectedReception && (
                <DirectInboundDetailModal
                    reception={selectedReception}
                    onClose={() => { setSelectedReception(null); fetchReceptions(); }}
                />
            )}

            {/* Modal de Nuevo Ingreso (Nuevo) */}
            {isFormOpen && (
                <InboundReceptionForm
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => { setIsFormOpen(false); fetchReceptions(); }}
                />
            )}
        </div>
    );
}