import React from 'react';
import { X, Calendar, MapPin, Truck, User, Package, FileText, Building2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

export default function OutboundDispatchDetail({ dispatch, onClose }) {
    if (!dispatch) return null;

    const handleOpenPdf = (url) => {
        if (!url) return toast.error("No hay documento adjunto");
        const { data } = supabase.storage.from('documents').getPublicUrl(url);
        window.open(data.publicUrl, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            ></div>

            {/* Slide-over Drawer */}
            <div className="relative w-full max-w-lg bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b bg-slate-50">
                    <div>
                        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                            {dispatch.folio}
                        </h2>
                        <p className="text-sm text-slate-500 font-medium">Detalle de Salida de Bodega</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Key Info Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                            <span className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1">
                                <Calendar size={14} /> Fecha
                            </span>
                            <div className="font-bold text-slate-700">
                                {new Date(dispatch.date).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-slate-400">
                                {new Date(dispatch.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                            <span className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase mb-1">
                                <MapPin size={14} /> Origen
                            </span>
                            <div className="font-bold text-slate-700">
                                {dispatch.warehouse}
                            </div>
                        </div>
                    </div>

                    {/* Receiver Section */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                            <User size={16} className="text-indigo-600" /> Destino / Receptor
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase">Receptor</label>
                                <div className="font-bold text-indigo-900">{dispatch.receiver || 'N/A'}</div>
                            </div>
                            {/* Intentamos mostrar más info si está disponible en 'stage' o comments */}
                            <div>
                                <label className="text-xs text-slate-400 font-bold uppercase">Detalle / Etapa</label>
                                <div className="text-sm text-slate-600 bg-white p-2 rounded border border-slate-200 mt-1">
                                    {dispatch.stage || 'Sin detalles adicionales'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Project Section (Si aplica) */}
                    {dispatch.project && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                                <Building2 size={16} className="text-slate-400" /> Proyecto
                            </h3>
                            <div className="text-sm text-slate-600">
                                {dispatch.project}
                            </div>
                        </div>
                    )}

                    {/* Items List */}
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                            <Package size={16} className="text-indigo-600" /> Items Despachados ({dispatch.total_items})
                        </h3>
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold">
                                    <tr>
                                        <th className="px-4 py-3">Item / Código</th>
                                        <th className="px-4 py-3 text-right">Cant.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {dispatch.items.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-slate-700">{item.product}</div>
                                                <div className="text-[10px] font-mono text-slate-400">{item.code}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-slate-800">
                                                {item.qty}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t bg-slate-50 flex gap-3">
                    {dispatch.document_url ? (
                        <button
                            onClick={() => handleOpenPdf(dispatch.document_url)}
                            className="flex-1 bg-white border border-slate-300 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            <FileText size={18} /> Ver Guía PDF
                        </button>
                    ) : (
                        <div className="flex-1 py-3 text-center text-xs text-slate-400 italic">
                            Sin documento adjunto
                        </div>
                    )}
                    <button
                        onClick={onClose}
                        className="px-6 py-3 bg-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-300 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>

            </div>
        </div>
    );
}
