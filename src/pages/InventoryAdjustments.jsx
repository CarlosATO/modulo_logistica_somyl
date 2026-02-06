import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import {
    AlertTriangle, ArrowUpCircle, ArrowDownCircle, Search,
    Plus, Loader, FileText, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import InventoryAdjustmentsForm from './InventoryAdjustmentsForm';
import InventoryAdjustmentDetail from './InventoryAdjustmentDetail';

export default function InventoryAdjustments() {

    // --- Estado ---
    const [adjustments, setAdjustments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modales
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedAdjustment, setSelectedAdjustment] = useState(null);

    // --- Carga de Datos ---
    const fetchHistory = async () => {
        setLoading(true);
        try {
            // 1. Obtener movimientos de tipo DECREASE/INCREASE o con folio ADJ-
            const { data, error } = await supabase
                .from('movements')
                .select(`
                    id, created_at, type, quantity, user_email, comments, 
                    reception_document_url, document_number,
                    warehouse_id, product_id, project_id,
                    warehouses(name),
                    products(name, code)
                `)
                .or('type.in.(INCREASE,DECREASE),document_number.ilike.ADJ%')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // 2. Enriquecer con Nombres de Proyectos (desde Procurement)
            // Recolectar IDs únicos de proyectos
            const projectIds = [...new Set(data.map(m => m.project_id).filter(id => id && id !== 'undefined' && id !== 'null'))];

            let projectsMap = {};
            if (projectIds.length > 0) {
                const { data: projData } = await supabaseProcurement
                    .from('proyectos')
                    .select('id, proyecto')
                    .in('id', projectIds);

                if (projData) {
                    projData.forEach(p => { projectsMap[p.id] = p.proyecto; });
                }
            }

            // 3. Formatear
            // Nota: En movements, 'comments' se usó para guardar el comentario, y 'reason' ???
            // Revisando 'process_inventory_adjustment' RPC:
            // p_reason -> se guarda en 'comments' o 'other_data'?
            // Ah, el RPC original probablemente guardaba razón en 'comments' concatenado o en 'other_data'.
            // Revisando `InventoryAdjustments.jsx` antiguo... 
            // El RPC usa p_reason, p_comments.
            // Asumiré que la razón principal se guardó en `comments` o `reason`.
            // Si el RPC inserta en `movements`, habría que ver dónde mete `reason`.
            // Supongamos que lo mete en `comments` prefixado o algo.
            // Si no, mostraremos `comments` como razón general.

            // Para simplificar, mostraremos lo que venga en `comments`.

            const formatted = data.map(m => {
                // Determinar tipo real si es antiguo (ADJ-)
                let realType = m.type;
                if (m.document_number?.startsWith('ADJ-')) {
                    // Si es folio ADJ, podemos inferir? O asumimos que el type guardado es correcto?
                    // En la captura decía "Ingreso: ADJ...", lo que implica INBOUND.
                    // Pero un ajuste puede ser salida.
                    // Si el sistema anterior guardaba todo como INBOUND, es un problema.
                    // Sin embargo, mostraremos lo que haya. Si es INBOUND -> Hallazgo. Si es OUTBOUND -> Pérdida.
                    if (m.type === 'INBOUND') realType = 'INCREASE';
                    if (m.type === 'OUTBOUND') realType = 'DECREASE';
                }

                return {
                    id: m.id,
                    folio: m.document_number || m.id.slice(0, 8),
                    date: m.created_at,
                    type: realType,
                    qty: m.quantity,
                    user_email: m.user_email,
                    reason: m.comments,
                    comments: m.comments,
                    evidence_url: m.reception_document_url,
                    warehouse: m.warehouses?.name || 'Desconocido',
                    product_name: m.products?.name || 'Producto Eliminado',
                    product_code: m.products?.code || '---',
                    project: projectsMap[m.project_id] || '---',
                    project_id: m.project_id
                };
            });

            setAdjustments(formatted);

        } catch (error) {
            console.error(error);
            toast.error("Error al cargar historial");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchHistory(); }, []);

    // --- Filtros ---
    const filtered = adjustments.filter(a =>
        a.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.reason && a.reason.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <AlertTriangle className="text-purple-600" /> Ajustes y Mermas
                    </h1>
                    <p className="text-sm text-slate-500 font-medium mt-1">Control de pérdidas, hallazgos y correcciones de inventario</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center gap-2"
                >
                    <Plus size={20} /> Nuevo Ajuste
                </button>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                <Search className="text-slate-400" size={20} />
                <input
                    type="text"
                    placeholder="Buscar por producto, código, motivo..."
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
                            <th className="px-6 py-4">Tipo / Fecha</th>
                            <th className="px-6 py-4">Producto</th>
                            <th className="px-6 py-4">Motivo / Glosa</th>
                            <th className="px-6 py-4">Bodega / Proyecto</th>
                            <th className="px-6 py-4 text-center">Cant.</th>
                            <th className="px-6 py-4 text-center">Evidencia</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan="6" className="py-20 text-center"><Loader className="animate-spin mx-auto text-purple-500" /></td></tr>
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan="6" className="py-20 text-center text-slate-400 italic">No se encontraron ajustes registrados.</td></tr>
                        ) : (
                            filtered.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => setSelectedAdjustment(item)}
                                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                                >
                                    <td className="px-6 py-4">
                                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase mb-1 ${item.type === 'DECREASE' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {item.type === 'DECREASE' ? <ArrowDownCircle size={12} /> : <ArrowUpCircle size={12} />}
                                            {item.type === 'DECREASE' ? 'Pérdida' : 'Hallazgo'}
                                        </div>
                                        <div className="text-xs text-slate-400 flex items-center gap-1">
                                            <Calendar size={10} /> {new Date(item.date).toLocaleDateString()}
                                            <span className="font-mono ml-1">#{item.folio?.slice(0, 8)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{item.product_name}</div>
                                        <div className="text-xs font-mono text-slate-400">{item.product_code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-slate-600 font-medium truncate max-w-[200px]">{item.reason}</div>
                                        <div className="text-[10px] text-slate-400">{item.user_email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-700">{item.warehouse}</div>
                                        {item.project !== '---' && <div className="text-[10px] text-purple-600 font-bold">{item.project}</div>}
                                    </td>
                                    <td className={`px-6 py-4 text-center font-black ${item.type === 'DECREASE' ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {item.type === 'DECREASE' ? '-' : '+'}{item.qty}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {item.evidence_url ? (
                                            <FileText size={18} className="mx-auto text-slate-400 group-hover:text-purple-600 transition-colors" />
                                        ) : (
                                            <span className="text-slate-200 text-xs">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Nuevo Ajuste */}
            {isFormOpen && (
                <InventoryAdjustmentsForm
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => { setIsFormOpen(false); fetchHistory(); }}
                />
            )}

            {/* Drawer de Detalle */}
            {selectedAdjustment && (
                <InventoryAdjustmentDetail
                    adjustment={selectedAdjustment}
                    onClose={() => setSelectedAdjustment(null)}
                />
            )}

        </div>
    );
}