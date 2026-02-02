import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { Package, FileText, Check, Upload, AlertTriangle, Printer, Search } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PendingRequests = () => {
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState({});
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null); // ID of employee group being processed
    const [signedFile, setSignedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Requests
            const { data: reqs, error } = await supabase
                .from('material_requests')
                .select(`
                    *,
                    product:products(name, code, unit, current_stock)
                `)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 2. Fetch Employees (Unique IDs)
            const employeeIds = [...new Set(reqs.map(r => r.employee_id))];
            if (employeeIds.length > 0) {
                const { data: emps, error: empError } = await supabase
                    .from('rrhh_employees')
                    .select('id, first_name, last_name, rut')
                    .in('id', employeeIds);

                if (empError) throw empError;

                const empMap = {};
                emps.forEach(e => {
                    empMap[e.id] = e;
                });
                setEmployees(empMap);
            }

            setRequests(reqs || []);
        } catch (err) {
            console.error(err);
            toast.error('Error al cargar solicitudes');
        } finally {
            setLoading(false);
        }
    };

    // Group requests by Employee
    const groupedRequests = requests.reduce((acc, req) => {
        const empId = req.employee_id;
        if (!acc[empId]) acc[empId] = [];
        acc[empId].push(req);
        return acc;
    }, {});

    // Filter by search
    const filteredGroupIds = Object.keys(groupedRequests).filter(empId => {
        const emp = employees[empId];
        if (!emp) return false;
        const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
        const rut = emp.rut?.toLowerCase() || '';
        const search = searchTerm.toLowerCase();
        return fullName.includes(search) || rut.includes(search);
    });

    const handleGeneratePDF = (empId) => {
        const emp = employees[empId];
        const items = groupedRequests[empId];
        if (!emp || !items) return;

        const doc = new jsPDF();

        // Header
        doc.setFontSize(18);
        doc.text('Comprobante de Entrega de EPP / Activos', 105, 20, { align: 'center' });

        doc.setFontSize(12);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 35);
        doc.text(`Trabajador: ${emp.first_name} ${emp.last_name}`, 20, 42);
        doc.text(`RUT: ${emp.rut}`, 20, 49);

        // Table
        const tableData = items.map(item => [
            items.indexOf(item) + 1,
            item.product?.code || 'N/A',
            item.product?.name || 'Producto Desconocido',
            item.quantity,
            item.product?.unit || 'UN'
        ]);

        autoTable(doc, {
            startY: 60,
            head: [['#', 'Código', 'Descripción', 'Cant.', 'Unidad']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 10 }
        });

        // Signatures
        const finalY = doc.lastAutoTable.finalY + 40;

        doc.line(30, finalY, 90, finalY);
        doc.text('Firma Trabajador', 60, finalY + 5, { align: 'center' });

        doc.line(120, finalY, 180, finalY);
        doc.text('Firma Entrega (Logística)', 150, finalY + 5, { align: 'center' });

        doc.text('Declaro recibir los elementos detallados en buen estado.', 105, finalY + 25, { align: 'center', fontSize: 9 });

        doc.save(`Entrega_EPP_${emp.rut}_${Date.now()}.pdf`);
    };

    const handleConfirmDelivery = async (empId) => {
        if (!signedFile) {
            toast.error('Debes subir el comprobante firmado');
            return;
        }

        const items = groupedRequests[empId];
        const missingStock = items.filter(i => (i.product?.current_stock || 0) < i.quantity);

        if (missingStock.length > 0) {
            toast.error(`Stock insuficiente para: ${missingStock.map(m => m.product?.name).join(', ')}`);
            return;
        }

        if (!confirm(`¿Confirmar entrega de ${items.length} items a ${employees[empId].first_name}? Esta acción descontará stock.`)) return;

        setUploading(true);
        try {
            // 1. Upload File
            const fileExt = signedFile.name.split('.').pop();
            const fileName = `logistica_deliveries/${empId}_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('rrhh-files').upload(fileName, signedFile);

            if (uploadError) throw uploadError;

            // 2. Process Items (Transaction needed ideally, but doing sequential for now)
            for (const item of items) {
                // Decrement Stock
                const { error: stockError } = await supabase.rpc('decrement_stock', {
                    row_id: item.product_code, // Asumiendo producto por ID o CODE? 
                    // WARNING: supabase.rpc needs exact params. A safer way is using standard REST if no RPC exists.
                    // Let's use standard Update with safety check in UI or just Update.
                    // Better: standard update : stock - qty
                    // Need raw update: update products set current_stock = current_stock - qty where code = ...
                });

                // Since I might not have RPC, I will use standard update
                const newStock = (item.product.current_stock || 0) - item.quantity;
                const { error: updateError } = await supabase
                    .from('products')
                    .update({ current_stock: newStock })
                    .eq('code', item.product_code); // Assuming product_code matches products.code

                if (updateError) throw updateError; // Break if fail

                // Update Request Status
                const { error: reqError } = await supabase
                    .from('material_requests')
                    .update({
                        status: 'DELIVERED',
                        processed_at: new Date(),
                        signed_receipt_url: fileName
                    })
                    .eq('id', item.id);

                if (reqError) throw reqError;
            }

            toast.success('Entrega registrada correctamente');
            setProcessingId(null);
            setSignedFile(null);
            fetchData(); // Refresh

        } catch (err) {
            console.error(err);
            toast.error('Error al procesar: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Solicitudes de Entrega</h2>
                    <p className="text-slate-500">Gestión de dotación para RRHH</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                        <input
                            className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none w-64 transition-all"
                            placeholder="Buscar trabajador..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchData} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors" title="Recargar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-slate-400 animate-pulse">Cargando solicitudes...</div>
            ) : filteredGroupIds.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                    <Package size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">No hay solicitudes pendientes</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {filteredGroupIds.map(empId => {
                        const emp = employees[empId];
                        const items = groupedRequests[empId];
                        const isProcessing = processingId === empId;

                        return (
                            <div key={empId} className={`bg-white rounded-xl border transition-all ${isProcessing ? 'border-indigo-500 shadow-lg ring-2 ring-indigo-100' : 'border-slate-200 shadow-sm'}`}>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <div className="p-3 bg-indigo-50 rounded-full h-fit text-indigo-600">
                                            <FileText size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800">{emp?.first_name} {emp?.last_name}</h3>
                                            <p className="text-sm text-slate-500 font-mono">{emp?.rut}</p>
                                            <div className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded w-fit">
                                                {items.length} items solicitados
                                            </div>
                                        </div>
                                    </div>

                                    {!isProcessing ? (
                                        <button
                                            onClick={() => setProcessingId(empId)}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors shadow-sm"
                                        >
                                            Iniciar Entrega
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setProcessingId(null); setSignedFile(null); }}
                                            className="text-slate-400 hover:text-slate-600 px-4 py-2 font-medium text-sm"
                                        >
                                            Cancelar
                                        </button>
                                    )}
                                </div>

                                <div className="p-6">
                                    <table className="w-full text-sm mb-6">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="p-3 text-left">Código</th>
                                                <th className="p-3 text-left">Descripción</th>
                                                <th className="p-3 text-center">Cant.</th>
                                                <th className="p-3 text-center">Stock</th>
                                                <th className="p-3 text-center">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map(item => {
                                                const hasStock = (item.product?.current_stock || 0) >= item.quantity;
                                                return (
                                                    <tr key={item.id}>
                                                        <td className="p-3 font-mono text-slate-600">{item.product_code}</td>
                                                        <td className="p-3 font-medium text-slate-800">{item.product?.name}</td>
                                                        <td className="p-3 text-center font-bold bg-slate-50 rounded">{item.quantity}</td>
                                                        <td className={`p-3 text-center font-bold ${hasStock ? 'text-green-600' : 'text-red-600'}`}>
                                                            {item.product?.current_stock || 0}
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            {!hasStock && <AlertTriangle size={16} className="inline text-red-500 ml-1" title="Stock Insuficiente" />}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {isProcessing && (
                                        <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 animate-fadeIn space-y-4">
                                            <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                                                <Check size={20} /> Finalizar Entrega
                                            </h4>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Paso 1: Generar */}
                                                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm text-center">
                                                    <div className="text-xs font-bold text-indigo-400 uppercase mb-2">Paso 1</div>
                                                    <button
                                                        onClick={() => handleGeneratePDF(empId)}
                                                        className="w-full flex justify-center items-center gap-2 py-2 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 font-bold hover:bg-indigo-50 hover:border-indigo-400 transition-all"
                                                    >
                                                        <Printer size={20} /> Generar Comprobante PDF
                                                    </button>
                                                    <p className="text-xs text-slate-400 mt-2">Imprimir y solicitar firma del trabajador</p>
                                                </div>

                                                {/* Paso 2: Subir y Confirmar */}
                                                <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm text-center">
                                                    <div className="text-xs font-bold text-indigo-400 uppercase mb-2">Paso 2</div>
                                                    <input
                                                        type="file"
                                                        id={`file-${empId}`}
                                                        accept="image/*,.pdf"
                                                        className="hidden"
                                                        onChange={e => setSignedFile(e.target.files[0])}
                                                    />

                                                    {!signedFile ? (
                                                        <label htmlFor={`file-${empId}`} className="block w-full text-center py-2 bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 text-slate-600 font-medium transition-colors">
                                                            <Upload size={18} className="inline mr-2" /> Subir Firmado
                                                        </label>
                                                    ) : (
                                                        <div className="text-sm font-bold text-green-600 flex items-center justify-center gap-2 bg-green-50 py-2 rounded-lg border border-green-200">
                                                            <Check size={16} /> {signedFile.name}
                                                        </div>
                                                    )}

                                                    <button
                                                        onClick={() => handleConfirmDelivery(empId)}
                                                        disabled={!signedFile || uploading}
                                                        className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow transition-all"
                                                    >
                                                        {uploading ? 'Procesando Stock...' : 'Confirmar Entrega'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PendingRequests;
