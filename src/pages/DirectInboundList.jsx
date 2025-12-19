import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { 
    Search, FileText, Calendar, ExternalLink, 
    Edit3, Filter, Loader, AlertCircle, CheckCircle2, Clock, Trash2
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
            // Obtener recepciones
            const { data: receptionsData, error: receptionsError } = await supabase
                .from('v_direct_receptions_summary')
                .select('*')
                .order('date', { ascending: false });
            
            if (receptionsError) throw receptionsError;

            // Obtener nombres de bodegas
            const { data: warehousesData } = await supabase
                .from('warehouses')
                .select('id, name');

            // Crear mapa de bodegas
            const warehousesMap = {};
            (warehousesData || []).forEach(wh => {
                warehousesMap[wh.id] = wh.name;
            });

            // Enriquecer datos con nombres de bodegas y proyectos
            const enrichedData = (receptionsData || []).map(item => {
                // Extraer proyecto desde comments: "Ingreso Asignado | NOMBRE_PROYECTO"
                let projectName = 'Sin Proyecto';
                if (item.comments && item.comments.includes('|')) {
                    projectName = item.comments.split('|')[1]?.trim() || 'Sin Proyecto';
                }
                
                return {
                    ...item,
                    warehouse_name: warehousesMap[item.warehouse_id] || 'N/A',
                    project_name: projectName
                };
            });
            
            setReceptions(enrichedData);
        } catch (error) {
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReceptions(); }, []);

    const filteredData = receptions.filter(r => 
        r.document_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.comments?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDelete = async (docNumber) => {
        const confirmDelete = window.confirm(
            `⚠️ ¿Estás seguro de eliminar el ingreso ${docNumber}?\n\nEsta acción restará el stock de los productos y es irreversible.`
        );

        if (!confirmDelete) return;

        try {
            const { error } = await supabase.rpc('delete_direct_reception', {
                p_document_number: docNumber
            });

            if (error) throw error;

            toast.success("Ingreso eliminado y stock revertido correctamente");
            fetchReceptions(); // Refrescar la lista
        } catch (error) {
            toast.error("Error al eliminar: " + error.message);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* Header */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <FileText className="text-blue-600"/> Historial de Ingresos Directos
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">Gestión y auditoría de recepciones manuales</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar por N° Guía o comentarios..." 
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
                            <th className="px-6 py-4">N° Documento</th>
                            <th className="px-6 py-4">Proveedor</th>
                            <th className="px-6 py-4 text-center">Items</th>
                            <th className="px-6 py-4">Estado</th>
                            <th className="px-6 py-4 text-right"></th>
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
                                    title="Doble clic para ver detalle"
                                >
                                    <td className="px-6 py-4 font-medium text-slate-600">
                                        {new Date(rec.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-slate-800">{rec.document_number}</td>
                                    <td className="px-6 py-4 font-medium text-slate-700">{rec.supplier_name || 'No especificado'}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">{rec.total_items} SKU</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {rec.status === 'COMPLETED' ? (
                                            <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full">Ubicado</span>
                                        ) : (
                                            <span className="text-amber-600 font-bold text-xs bg-amber-50 px-2 py-1 rounded-full">Pendiente</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {/* Botón Eliminar - Solo visible para PENDING_STORAGE */}
                                            {rec.status === 'PENDING_STORAGE' && (
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation(); // Evitar que se dispare el doble clic
                                                        handleDelete(rec.document_number);
                                                    }}
                                                    className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-all border border-transparent hover:border-red-200"
                                                    title="Eliminar Ingreso"
                                                >
                                                    <Trash2 size={18}/>
                                                </button>
                                            )}
                                            
                                            {/* Ícono Edit3 que aparece en hover */}
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Edit3 size={18} className="text-blue-400" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalle */}
            {selectedReception && (
                <DirectInboundDetailModal 
                    reception={selectedReception} 
                    onClose={() => {
                        setSelectedReception(null);
                        fetchReceptions();
                    }} 
                />
            )}
        </div>
    );
}