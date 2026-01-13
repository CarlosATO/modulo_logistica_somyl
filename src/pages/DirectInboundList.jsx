import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { 
    Search, FileText, Loader, CheckCircle2, Clock, Trash2, Edit3, ExternalLink 
} from 'lucide-react';
import { toast } from 'sonner';
import DirectInboundDetailModal from './DirectInboundDetailModal';

export default function DirectInboundList() {
    const [receptions, setReceptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedReception, setSelectedReception] = useState(null);

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
                // LÓGICA CORREGIDA PARA PROYECTO:
                // 1. Prioridad: Usar el nombre que viene directo de la BD (project_name de la vista)
                // 2. Respaldo: Si viene vacío, intentar sacarlo de los comentarios (formato antiguo con "|")
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
                    project_name: finalProjectName, // Usamos el nombre corregido
                    reception_document_url: item.document_url // Mapeamos la URL del PDF
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
        e.stopPropagation(); // Evitar abrir el modal al hacer clic en el PDF
        if (!url) return toast.error("No hay documento adjunto");
        
        // Generar URL pública temporal o directa
        const { data } = supabase.storage.from('documents').getPublicUrl(url);
        window.open(data.publicUrl, '_blank');
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-blue-600"/> Historial de Ingresos
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">Gestión de recepciones (OC y Asignadas)</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar guía, proyecto..." 
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
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
                            <tr><td colSpan="6" className="py-20 text-center"><Loader className="animate-spin mx-auto text-blue-500"/></td></tr>
                        ) : filteredData.length === 0 ? (
                            <tr><td colSpan="6" className="py-20 text-center text-slate-400 font-medium">No se encontraron ingresos.</td></tr>
                        ) : (
                            filteredData.map((rec, idx) => (
                                <tr 
                                    key={idx} 
                                    onDoubleClick={() => setSelectedReception(rec)}
                                    className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                                >
                                    <td className="px-6 py-4 font-medium text-slate-600">
                                        {new Date(rec.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        <div className="text-[10px] text-slate-400">{new Date(rec.date).toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{rec.document_number}</div>
                                        {/* Aquí mostramos el proyecto corregido */}
                                        <div className="text-xs text-blue-600 font-medium">{rec.project_name}</div> 
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-700">{rec.supplier_name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{rec.total_items}</span>
                                    </td>
                                    
                                    {/* COLUMNA PDF AÑADIDA */}
                                    <td className="px-6 py-4 text-center">
                                        {rec.reception_document_url ? (
                                            <button 
                                                onClick={(e) => handleOpenPdf(rec.reception_document_url, e)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
                                                title="Ver Documento PDF"
                                            >
                                                <FileText size={20}/>
                                            </button>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        )}
                                    </td>

                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {rec.status === 'PENDING_STORAGE' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(rec.document_number); }}
                                                    className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selectedReception && (
                <DirectInboundDetailModal 
                    reception={selectedReception} 
                    onClose={() => { setSelectedReception(null); fetchReceptions(); }} 
                />
            )}
        </div>
    );
}