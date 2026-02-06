import React from 'react';
import { X, Calendar, MapPin, User, Package, FileText, Building2, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';

export default function InventoryAdjustmentDetail({ adjustment, onClose }) {
    if (!adjustment) return null;

    const handleOpenEvidence = (url) => {
        if (!url) return toast.error("No hay evidencia adjunta");
        const { data } = supabase.storage.from('documents').getPublicUrl(url);
        window.open(data.publicUrl, '_blank');
    };

    const isDecrease = adjustment.type === 'DECREASE';
    const accentColor = isDecrease ? 'red' : 'emerald';

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            ></div>

            <div className={`relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300 border-l-4 ${isDecrease ? 'border-red-500' : 'border-emerald-500'}`}>

                {/* Header */}
                <div className="p-6 border-b bg-slate-50">
                    <div className="flex justify-between items-start mb-2">
                        <div className={`p-2 rounded-lg ${isDecrease ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {isDecrease ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                    </div>
                    <h2 className="text-xl font-black text-slate-800 leading-tight">
                        {isDecrease ? 'Pérdida / Merma' : 'Hallazgo / Sobrante'}
                    </h2>
                    <p className="text-sm text-slate-500 font-medium">Folio: {adjustment.id.slice(0, 8).toUpperCase()}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* Item Card */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2"><Package size={14} /> Producto Afectado</h3>
                        <div className="font-bold text-slate-800 text-lg mb-1">{adjustment.product_name}</div>
                        <div className="font-mono text-xs text-slate-400 bg-slate-100 inline-block px-2 py-1 rounded">{adjustment.product_code}</div>

                        <div className="mt-4 flex justify-between items-end border-t pt-3">
                            <div>
                                <span className="text-xs text-slate-400 font-bold block">CANTIDAD</span>
                                <span className={`text-2xl font-black ${isDecrease ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {isDecrease ? '-' : '+'}{adjustment.qty}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-400 font-bold block">FECHA</span>
                                <span className="text-sm font-medium text-slate-600">{new Date(adjustment.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Details */}
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <MapPin className="text-slate-400 mt-1" size={18} />
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Bodega</label>
                                <p className="font-medium text-slate-700">{adjustment.warehouse}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <User className="text-slate-400 mt-1" size={18} />
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Solicitado Por</label>
                                <p className="font-medium text-slate-700">{adjustment.user_email || 'Sistema'}</p>
                            </div>
                        </div>
                        {adjustment.project && (
                            <div className="flex items-start gap-3">
                                <Building2 className="text-slate-400 mt-1" size={18} />
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Proyecto Asociado</label>
                                    <p className="font-medium text-slate-700">{adjustment.project}</p>
                                </div>
                            </div>
                        )}
                        <div className="flex items-start gap-3">
                            <FileText className="text-slate-400 mt-1" size={18} />
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase">Motivo / Glosa</label>
                                <p className="font-medium text-slate-800">{adjustment.reason}</p>
                                {adjustment.comments && <p className="text-xs text-slate-500 mt-1 italic">"{adjustment.comments}"</p>}
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t bg-slate-50">
                    {adjustment.evidence_url ? (
                        <button
                            onClick={() => handleOpenEvidence(adjustment.evidence_url)}
                            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                            <Camera size={18} /> Ver Evidencia (Foto)
                        </button>
                    ) : (
                        <div className="w-full py-3 text-center text-xs text-slate-400 italic border border-dashed border-slate-300 rounded-xl">
                            Sin evidencia adjunta
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
