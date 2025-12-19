import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { X, Save, Upload, FileText, Download, Eye, Maximize2, Loader, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function DirectInboundDetailModal({ reception, onClose }) {
    const [items, setItems] = useState([]);
    const [showPreview, setShowPreview] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newFile, setNewFile] = useState(null);
    const [newDocNumber, setNewDocNumber] = useState(reception.document_number);

    // Construcción de la URL del documento
    const docUrl = reception.document_url 
        ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/${reception.document_url}`
        : null;

    useEffect(() => {
        const fetchItems = async () => {
            const { data } = await supabase
                .from('movements')
                .select('id, quantity, product_id, products(code, name, unit)')
                .eq('document_number', reception.document_number)
                .eq('type', 'INBOUND');
            setItems(data || []);
            setLoading(false);
        };
        fetchItems();
    }, [reception.document_number]);

    const handleSaveDocument = async () => {
        setSaving(true);
        try {
            let finalUrl = reception.document_url;
            
            if (newFile) {
                const fileExt = newFile.name.split('.').pop();
                const cleanName = newFile.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
                const fileName = `UPDATE-${Date.now()}-${cleanName}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('documents')
                    .upload(fileName, newFile);
                
                if (uploadError) throw uploadError;
                finalUrl = fileName;
            }

            const { error: rpcError } = await supabase.rpc('update_reception_document', {
                p_doc_number: reception.document_number,
                p_new_url: finalUrl
            });

            if (rpcError) throw rpcError;
            
            toast.success("Documentación actualizada correctamente");
            onClose();
        } catch (error) {
            toast.error(`Error: ${error.message || 'Error desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateQuantities = async (itemId, productId, newQty) => {
        try {
            const { error } = await supabase.rpc('update_inbound_quantity', {
                p_movement_id: itemId,
                p_product_id: productId,
                p_new_quantity: Number(newQty)
            });
            if (error) throw error;
            toast.success("Cantidad actualizada");
        } catch (error) {
            toast.error("Error al actualizar cantidad: " + (error.message || error));
        }
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            const rows = items || [];
            for (const it of rows) {
                const selector = `[data-item-id="${it.id}"]`;
                const input = document.querySelector(selector);
                if (!input) continue;
                const val = input.value === '' ? 0 : Number(input.value);
                const orig = Number(it.quantity);
                if (isNaN(val)) continue;
                if (val !== orig) {
                    await handleUpdateQuantities(it.id, it.product_id, val);
                }
            }

            await handleSaveDocument();
        } catch (error) {
            toast.error('Error al guardar cambios: ' + (error.message || error));
        } finally {
            setSaving(false);
        }
    };



    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className={`bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${showPreview ? 'max-w-6xl w-full' : 'max-w-3xl w-full'} max-h-[95vh]`}>
                
                {/* Header */}
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h2 className="font-black text-slate-800">Ingreso: {reception.document_number}</h2>
                    <div className="flex gap-2">
                        {docUrl && (
                            <button 
                                onClick={() => setShowPreview(!showPreview)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg font-bold text-xs hover:bg-blue-200 transition-colors"
                            >
                                {showPreview ? <Maximize2 size={14}/> : <Eye size={14}/>}
                                {showPreview ? 'Cerrar Vista Doc' : 'Ver Documento'}
                            </button>
                        )}
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Panel Izquierdo: Datos y Tabla */}
                    <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${showPreview ? 'border-r shadow-inner bg-slate-50/30' : ''}`}>
                        {/* Información General */}
                        <div className="grid grid-cols-2 gap-4 bg-white p-4 rounded-xl border">
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase">Proveedor</label><p className="font-bold">{reception.supplier_name || 'N/A'}</p></div>
                            <div><label className="text-[10px] font-bold text-slate-400 uppercase">Fecha</label><p className="font-bold">{new Date(reception.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</p></div>
                        </div>

                        {/* Alerta de restricciones */}
                        {reception.status === 'COMPLETED' && (
                            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex gap-3 text-amber-800 text-sm">
                                <AlertTriangle className="shrink-0" size={18} />
                                <p className="font-medium">Este ingreso ya tiene materiales asignados a racks. <strong>No se pueden modificar cantidades</strong>, solo el documento de respaldo.</p>
                            </div>
                        )}

                        {/* Sección Edición Documento */}
                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h3 className="text-xs font-black text-slate-500 uppercase">Respaldo del Ingreso</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">N° Guía / Factura</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-300 p-2 rounded-lg font-bold bg-white text-sm" 
                                        value={newDocNumber} 
                                        disabled={reception.status === 'COMPLETED'}
                                        onChange={(e) => setNewDocNumber(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">Nuevo Archivo</label>
                                    <label className="flex items-center gap-2 border border-dashed border-slate-300 p-2 rounded-lg cursor-pointer hover:bg-white bg-white/50 transition-all">
                                        <Upload size={16} className="text-blue-500"/>
                                        <span className="text-xs font-medium truncate">{newFile ? newFile.name : 'Cambiar PDF/Imagen...'}</span>
                                        <input type="file" className="hidden" onChange={e => setNewFile(e.target.files[0])} />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Tabla de Materiales */}
                        <div className="border rounded-xl bg-white overflow-hidden">
                            <h3 className="text-xs font-black text-slate-500 uppercase px-4 pt-3 pb-2 bg-slate-50">Materiales Ingresados</h3>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-slate-500 text-xs">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Material</th>
                                        <th className="px-4 py-2 text-center">Cantidad</th>
                                        <th className="px-4 py-2 text-center">Unidad</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {loading ? (
                                        <tr><td colSpan="3" className="p-8 text-center"><Loader className="animate-spin mx-auto text-blue-500"/></td></tr>
                                    ) : (
                                        items.map(item => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-slate-800">{item.products?.name}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">{item.products?.code}</p>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <input 
                                                        type="number" 
                                                        data-item-id={item.id}
                                                        className={`w-20 text-center p-1.5 rounded border font-bold text-sm ${reception.status === 'COMPLETED' ? 'bg-slate-100 text-slate-400' : 'border-blue-200 bg-white text-blue-600'}`}
                                                        defaultValue={item.quantity}
                                                        disabled={reception.status === 'COMPLETED'}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-center font-medium text-slate-500">{item.products?.unit}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Panel Derecho: Previsualización de Documento */}
                    {showPreview && docUrl && (
                        <div className="flex-1 bg-slate-200 flex flex-col animate-in slide-in-from-right duration-300">
                            <div className="bg-slate-800 p-2 flex justify-between items-center text-white">
                                <span className="text-xs font-bold px-2 flex items-center gap-2"><FileText size={14}/> Vista Previa del Documento</span>
                                <a href={docUrl} download className="flex items-center gap-1 bg-blue-600 px-3 py-1 rounded text-[10px] font-bold hover:bg-blue-500">
                                    <Download size={12}/> Descargar Original
                                </a>
                            </div>
                            <iframe 
                                src={docUrl} 
                                className="w-full h-full border-none"
                                title="Previsualización"
                            />
                        </div>
                    )}
                </div>

                {/* Footer Acciones */}
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-all"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSaveAll}
                        disabled={saving}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 transition-all"
                    >
                        {saving ? <Loader className="animate-spin" size={18}/> : <><Save size={18}/> Guardar Cambios</>}
                    </button>
                </div>
            </div>
        </div>
    );
}