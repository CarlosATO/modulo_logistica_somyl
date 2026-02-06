import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PDFDownloadLink } from '@react-pdf/renderer';
import TransferPDF from '../components/TransferPDF';
import CreateTransferModal from './CreateTransferModal';
import {
    ArrowRightLeft, Search, Plus, FileText, X,
    Calendar, User, MapPin, ChevronRight, Loader, History
} from 'lucide-react';

export default function TransferMaterial() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // Data State
    const [transfers, setTransfers] = useState([]);
    const [warehouses, setWarehouses] = useState([]);

    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Drawer State
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [transferDetails, setTransferDetails] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Initial Load
    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('transfers')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTransfers(data || []);

            // Also load warehouses for name mapping if needed (though table has IDs, we might want names if not stored)
            // actually looking at the CreateModal, we assume data is stored in naming columns too or just IDs.
            // The transfers table has origin_project_name but storing warehouse names directly isn't always standard.
            // Let's fetch warehouses just in case we need to map IDs.
            const { data: wh } = await supabase.from('warehouses').select('id, name');
            setWarehouses(wh || []);

        } catch (error) {
            console.error("Error loading transfers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransfers();
    }, []);

    // Fetch Details when Transfer Selected
    useEffect(() => {
        if (!selectedTransfer) {
            setTransferDetails([]);
            return;
        }

        const fetchDetails = async () => {
            setLoadingDetails(true);
            try {
                // We fetch movements associated with this transfer number
                const { data, error } = await supabase
                    .from('movements')
                    .select('*, products(name, code)')
                    .eq('transfer_number', selectedTransfer.transfer_number)
                    .eq('type', 'TRANSFER_OUT'); // We only need the items list, one side is enough to show what was moved

                if (error) throw error;
                setTransferDetails(data || []);
            } catch (error) {
                console.error("Error loading details:", error);
            } finally {
                setLoadingDetails(false);
            }
        };

        fetchDetails();
    }, [selectedTransfer]);


    const getWarehouseName = (id) => {
        const wh = warehouses.find(w => w.id === id);
        return wh ? wh.name : 'Desconocida';
    };

    const filteredTransfers = useMemo(() => {
        if (!searchTerm) return transfers;
        const lower = searchTerm.toLowerCase();
        return transfers.filter(t =>
            t.transfer_number.toLowerCase().includes(lower) ||
            t.origin_project_name?.toLowerCase().includes(lower) ||
            t.destination_project_name?.toLowerCase().includes(lower) ||
            t.authorized_by?.toLowerCase().includes(lower)
        );
    }, [transfers, searchTerm]);

    // Helper to format data for PDF
    const preparePdfData = (transfer, details) => {
        if (!transfer || !details) return null;
        return {
            transfer_number: transfer.transfer_number,
            origin_wh_name: getWarehouseName(transfer.origin_warehouse_id),
            dest_wh_name: getWarehouseName(transfer.destination_warehouse_id),
            origin_project: transfer.origin_project_name,
            dest_project: transfer.destination_project_name,
            authorized_by: transfer.authorized_by,
            items: details.map(d => ({
                name: d.products?.name,
                code: d.products?.code,
                transferQty: d.quantity
            })),
            date: new Date(transfer.created_at).toLocaleDateString()
        };
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

            {/* Header Compacto */}
            <div className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm z-10 sticky top-0">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800">
                        <ArrowRightLeft className="text-indigo-600" size={20} /> Historial de Traspasos
                    </h1>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar traspaso..."
                            className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 text-sm w-64 transition-all focus:w-80"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-2 text-sm transition-all"
                    >
                        <Plus size={16} /> Nuevo Traspaso
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden relative bg-slate-50/50 p-6">

                <div className="max-w-7xl mx-auto h-full flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24">Folio</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-32">Fecha</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Origen</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Destino</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Autorizado Por</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right w-16"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr><td colSpan="6" className="p-10 text-center text-slate-400"><Loader className="animate-spin mx-auto mb-2" />Cargando...</td></tr>
                                ) : filteredTransfers.length === 0 ? (
                                    <tr><td colSpan="6" className="p-10 text-center text-slate-400 italic">No se encontraron traspasos</td></tr>
                                ) : (
                                    filteredTransfers.map(t => (
                                        <tr
                                            key={t.id}
                                            onClick={() => setSelectedTransfer(t)}
                                            className={`cursor-pointer transition-colors group ${selectedTransfer?.id === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                                        >
                                            <td className="px-4 py-2.5">
                                                <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-100">{t.transfer_number}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-slate-500">
                                                {new Date(t.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700">{getWarehouseName(t.origin_warehouse_id)}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]" title={t.origin_project_name}>{t.origin_project_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700">{getWarehouseName(t.destination_warehouse_id)}</span>
                                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]" title={t.destination_project_name}>{t.destination_project_name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-slate-600">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500">
                                                        {t.authorized_by?.charAt(0)}
                                                    </div>
                                                    {t.authorized_by}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <ChevronRight className="ml-auto text-slate-300 group-hover:text-indigo-400 transition-colors" size={16} />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-slate-50 border-t px-4 py-2 text-[10px] text-slate-400 flex justify-between">
                        <span>Mostrando {filteredTransfers.length} registros</span>
                        <span>Ordenado por fecha (Recientes primero)</span>
                    </div>

                </div>

                {/* Side Drawer */}
                <div className={`absolute top-0 right-0 h-full w-[500px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out border-l z-20 flex flex-col ${selectedTransfer ? 'translate-x-0' : 'translate-x-full'}`}>

                    {/* Drawer Header */}
                    {selectedTransfer && (
                        <>
                            <div className="px-6 py-5 border-b bg-slate-50 flex justify-between items-start">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <FileText className="text-indigo-600" /> Detalle de Traspaso
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-1">Folio: <strong>{selectedTransfer.transfer_number}</strong></p>
                                </div>
                                <button onClick={() => setSelectedTransfer(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">

                                {/* Info Cards */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Origen</p>
                                        <p className="font-bold text-slate-700 text-sm">{getWarehouseName(selectedTransfer.origin_warehouse_id)}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{selectedTransfer.origin_project_name}</p>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Destino</p>
                                        <p className="font-bold text-slate-700 text-sm">{getWarehouseName(selectedTransfer.destination_warehouse_id)}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{selectedTransfer.destination_project_name}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 p-3 border rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
                                        {selectedTransfer.authorized_by?.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 uppercase font-bold">Autorizado Por</p>
                                        <p className="text-sm font-bold text-slate-700">{selectedTransfer.authorized_by}</p>
                                        <p className="text-xs text-slate-400">{selectedTransfer.user_email}</p>
                                    </div>
                                </div>

                                {/* Items List */}
                                <div>
                                    <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                                        <MapPin size={16} /> Materiales
                                    </h3>
                                    <div className="space-y-2">
                                        {loadingDetails ? (
                                            <div className="py-10 text-center"><Loader className="animate-spin mx-auto text-indigo-500" /></div>
                                        ) : transferDetails.length > 0 ? (
                                            transferDetails.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700">{item.products?.name}</p>
                                                        <p className="text-xs text-slate-400 font-mono">{item.products?.code}</p>
                                                        {item.other_data && <p className="text-[10px] text-indigo-400 mt-1">{item.other_data}</p>}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs">{item.quantity} UN</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-400 italic">No se encontraron detalles.</p>
                                        )}
                                    </div>
                                </div>

                            </div>

                            {/* Drawer Footer */}
                            <div className="p-4 border-t bg-slate-50">
                                {!loadingDetails && transferDetails.length > 0 && (
                                    <PDFDownloadLink
                                        document={<TransferPDF data={preparePdfData(selectedTransfer, transferDetails)} />}
                                        fileName={`Traspaso_${selectedTransfer.transfer_number}.pdf`}
                                        className="w-full"
                                    >
                                        {({ loading: pdfLoading }) => (
                                            <button
                                                disabled={pdfLoading}
                                                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 flex justify-center items-center gap-2 shadow-sm transition-all"
                                            >
                                                {pdfLoading ? <Loader size={18} className="animate-spin" /> : <FileText size={18} />}
                                                Descargar Comprobante PDF
                                            </button>
                                        )}
                                    </PDFDownloadLink>
                                )}
                            </div>
                        </>
                    )}
                </div>

            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <CreateTransferModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => {
                        fetchTransfers();
                        setIsCreateModalOpen(false);
                    }}
                />
            )}

        </div>
    );
}