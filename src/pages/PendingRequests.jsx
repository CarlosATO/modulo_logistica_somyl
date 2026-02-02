import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { Package, FileText, Check, Upload, AlertTriangle, Printer, Search, Building } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PendingRequests = () => {
    const [requests, setRequests] = useState([]);
    const [employees, setEmployees] = useState({});
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);

    // Processing State
    const [processingId, setProcessingId] = useState(null);
    const [signedFile, setSignedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Delivery Details State (Map of reqId -> { warehouseId, price })
    const [deliveryDetails, setDeliveryDetails] = useState({});
    const [warehouseStock, setWarehouseStock] = useState({}); // Map: productId -> { warehouseId: stock }

    useEffect(() => {
        fetchData();
        fetchWarehouses();
    }, []);

    const fetchWarehouses = async () => {
        const { data } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(data || []);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Requests (PENDING)
            const { data: reqs, error } = await supabase
                .from('material_requests')
                .select(`
                    *,
                    product:products(id, name, code, unit, current_stock, price)
                `)
                .eq('status', 'PENDING')
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 2. Fetch Employees
            const employeeIds = [...new Set(reqs.map(r => r.employee_id))];
            if (employeeIds.length > 0) {
                const { data: emps, error: empError } = await supabase
                    .from('rrhh_employees')
                    .select('id, first_name, last_name, rut, job:job_id(name)')
                    .in('id', employeeIds);
                if (empError) throw empError;

                const empMap = {};
                emps.forEach(e => empMap[e.id] = e);
                setEmployees(empMap);
            }

            // 3. Fetch Stock per Warehouse (Calculated from Movements)
            const productIds = [...new Set(reqs.map(r => r.product_id || r.product?.id))].filter(Boolean); // Ensure IDs
            if (productIds.length > 0) {
                const { data: movs } = await supabase
                    .from('movements')
                    .select('product_id, warehouse_id, type, quantity')
                    .in('product_id', productIds);

                if (movs) {
                    const stockMap = {}; // { prodId: { whId: qty } }
                    movs.forEach(m => {
                        if (!stockMap[m.product_id]) stockMap[m.product_id] = {};
                        if (!stockMap[m.product_id][m.warehouse_id]) stockMap[m.product_id][m.warehouse_id] = 0;

                        const qty = Number(m.quantity);
                        if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') {
                            stockMap[m.product_id][m.warehouse_id] += qty;
                        } else if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') {
                            stockMap[m.product_id][m.warehouse_id] -= qty;
                        }
                    });
                    setWarehouseStock(stockMap);
                }
            }

            // 3. Initialize Delivery Details (Default Price)
            const initialDetails = {};
            reqs.forEach(req => {
                initialDetails[req.id] = {
                    warehouseId: '', // Force selection
                    price: req.product?.price || 0,
                    quantity: req.quantity
                };
            });
            setDeliveryDetails(prev => ({ ...initialDetails, ...prev })); // Keep existing edits if any

            setRequests(reqs || []);
        } catch (err) {
            console.error(err);
            toast.error('Error al cargar solicitudes');
        } finally {
            setLoading(false);
        }
    };

    const handleDetailChange = (reqId, field, value) => {
        setDeliveryDetails(prev => ({
            ...prev,
            [reqId]: { ...prev[reqId], [field]: value }
        }));
    };

    // Grouping
    const groupedRequests = requests.reduce((acc, req) => {
        if (!acc[req.employee_id]) acc[req.employee_id] = [];
        acc[req.employee_id].push(req);
        return acc;
    }, {});

    const filteredGroupIds = Object.keys(groupedRequests).filter(empId => {
        const emp = employees[empId];
        if (!emp) return false;
        const term = searchTerm.toLowerCase();
        return `${emp.first_name} ${emp.last_name} ${emp.rut}`.toLowerCase().includes(term);
    });

    // --- PDF GENERATION ---
    const handleGeneratePDF = (empId) => {
        const emp = employees[empId];
        const items = groupedRequests[empId];
        if (!emp || !items) return;

        // Validation: Check if details are filled for PDF accuracy? 
        // Not strictly blocking PDF generation, but good to warn if prices are 0?

        const doc = new jsPDF();
        const blueColor = [41, 128, 185];

        // HEADER
        doc.setFillColor(...blueColor);
        doc.rect(20, 15, 40, 20, 'F'); // Box for Logo area
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('SOMYL', 30, 23);
        doc.text('S.A.', 33, 28);

        doc.setTextColor(0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('SOMYL S.A.', 65, 18);
        doc.setFont('helvetica', 'normal');
        doc.text('RUT: 76.002.581-K', 65, 23);
        doc.text('Giro: TELECOMUNICACIONES', 65, 28);
        doc.text('Dirección: PUERTA ORIENTE 361 OF 311 B TORRE B, COLINA', 65, 33);

        doc.text('Página 1 de 1', 180, 15);

        doc.setLineWidth(0.5);
        doc.setDrawColor(...blueColor);
        doc.line(20, 38, 190, 38);

        // TITLE
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...blueColor);
        doc.text('ACTA DE ENTREGA DE HERRAMIENTAS Y MATERIALES', 105, 50, { align: 'center' });

        doc.setTextColor(0);
        doc.setFontSize(11);
        doc.text('Documento N°: S/N', 105, 57, { align: 'center' });

        // INFO BLOCK
        doc.setFillColor(240, 248, 255); // Light Blue bg
        doc.rect(20, 65, 170, 25, 'F'); // Background box

        doc.setFontSize(10);

        // Col 1: Receiver
        doc.setTextColor(...blueColor);
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS DEL RECEPTOR', 25, 70);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');
        doc.text(`Nombre: ${emp.first_name} ${emp.last_name}`.toUpperCase(), 25, 76);
        doc.text(`RUT: ${emp.rut}`, 25, 81);
        doc.text(`Cargo: ${emp.job?.name || '________________________'}`, 25, 86);

        // Col 2: Delivery Info
        doc.setTextColor(...blueColor);
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS DE LA ENTREGA', 120, 70);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'normal');

        // Find warehouse names involved
        const warehouseNames = [...new Set(items.map(i => {
            const whId = deliveryDetails[i.id]?.warehouseId;
            const wh = warehouses.find(w => w.id === whId);
            return wh ? wh.name : 'PENDIENTE';
        }))];

        doc.text(`Bodega Origen: ${warehouseNames.join(', ') || 'Sin Asignar'}`, 120, 76);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 120, 81);
        doc.text(`Hora: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 120, 86);

        // TABLE
        const tableBody = items.map(item => {
            const details = deliveryDetails[item.id] || {};
            const unitPrice = parseFloat(details.price || 0);
            const total = unitPrice * item.quantity;
            return [
                item.product?.name || item.product_code,
                item.quantity,
                'Sin observaciones', // Could add inputs for this later
                `$${unitPrice.toLocaleString('es-CL')}`,
                `$${total.toLocaleString('es-CL')}`
            ];
        });

        // Calculate Grand Total for Footer
        const grandTotal = items.reduce((sum, item) => {
            const details = deliveryDetails[item.id] || {};
            return sum + (parseFloat(details.price || 0) * item.quantity);
        }, 0);

        autoTable(doc, {
            startY: 95,
            head: [['DESCRIPCIÓN DEL ARTÍCULO', 'CANT.', 'OBSERVACIONES', 'VALOR UNIT.', 'VALOR TOTAL']],
            body: tableBody,
            theme: 'grid', // 'striped' is default but user image shows grid-like solid colors? User image actually shows blue header, white body
            headStyles: { fillColor: blueColor, textColor: 255, fontStyle: 'bold', halign: 'center' },
            bodyStyles: { textColor: 0, fontSize: 9 },
            columnStyles: {
                0: { cellWidth: 70 }, // Desc
                1: { cellWidth: 15, halign: 'center' }, // Cant
                3: { halign: 'right' },
                4: { halign: 'right', fontStyle: 'bold' }
            },
            showFoot: 'lastPage',
            foot: [['', '', '', 'TOTAL:', `$${grandTotal.toLocaleString('es-CL')}`]],
            footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'right' }
        });

        // DISCLAIMER
        const finalY = doc.lastAutoTable.finalY + 10;

        doc.setTextColor(...blueColor);
        doc.setFontSize(10);
        doc.text('DECLARACIÓN DE RESPONSABILIDAD', 105, finalY, { align: 'center' });

        doc.setTextColor(0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const disclaimerText = "Por el presente documento, declaro haber recibido conforme los materiales, herramientas y/o equipos detallados en la presente acta, los cuales se encuentran en perfecto estado de funcionamiento. Me comprometo a su correcta utilización, conservación y custodia, asumiendo plena responsabilidad por su cuidado y devolución cuando sean requeridos por la empresa.";
        doc.text(disclaimerText, 20, finalY + 7, { maxWidth: 170, align: 'justify' });

        // SIGNATURES
        const signatureY = finalY + 50;

        doc.setLineWidth(0.5);
        doc.line(30, signatureY, 90, signatureY);
        doc.setFont('helvetica', 'bold');
        doc.text('RECIBE CONFORME', 60, signatureY - 15, { align: 'center' });

        doc.setFontSize(8);
        doc.text(`Nombre: ${emp.first_name} ${emp.last_name}`, 30, signatureY + 5);
        doc.text(`RUT: ${emp.rut}`, 30, signatureY + 9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 30, signatureY + 13);
        doc.text('Cargo: _________________', 30, signatureY + 17);


        doc.line(120, signatureY, 180, signatureY);
        doc.setFontSize(10);
        doc.text('ENTREGA CONFORME', 150, signatureY - 15, { align: 'center' });

        doc.setFontSize(8);
        doc.text('Nombre: ________________________', 120, signatureY + 5);
        doc.text('RUT: ________________________', 120, signatureY + 9);
        doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 120, signatureY + 13);

        doc.save(`Acta_Entrega_${emp.rut}.pdf`);
    };

    const handleConfirmDelivery = async (empId) => {
        const items = groupedRequests[empId];

        // Validation: Warehouses Selected & Stock check
        for (const item of items) {
            const details = deliveryDetails[item.id];
            if (!details?.warehouseId) {
                toast.error(`⚠️ Faltan datos para: ${item.product?.name}`);
                return;
            }
            const stocks = warehouseStock[item.product_id] || {};
            const available = stocks[details.warehouseId] || 0;
            if (available < item.quantity) {
                toast.error(`⚠️ Stock insuficiente en bodega seleccionada para: ${item.product?.name}`);
                return;
            }
        }

        if (!signedFile) {
            toast.error('⚠️ Debes subir el Acta firmada.');
            return;
        }

        if (!confirm('¿Confirmar entrega y descontar stock?')) return;

        setUploading(true);
        try {
            // 1. Upload File
            const fileExt = signedFile.name.split('.').pop();
            const fileName = `entregas_rrhh/${empId}_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, signedFile);
            if (uploadError) throw uploadError;

            // 2. Process Items (Transaction simulation)
            for (const item of items) {
                const details = deliveryDetails[item.id];

                // A. Insert Movement (OUTBOUND)
                // This preserves history and "deducts" stock via calculation in InventoryViewer
                const { error: movError } = await supabase.from('movements').insert({
                    type: 'OUTBOUND',
                    warehouse_id: details.warehouseId,
                    product_id: item.product?.id, // We need ID here. Assuming linked somehow. Join gives us product object, does it include ID? Yes usually.
                    // Wait, join `product:products(name, code...)` might NOT include `id` unless specified.
                    // Let's modify fetch to include product ID.
                    quantity: item.quantity,
                    unit_price: details.price,
                    reception_document_url: fileName,
                    comments: `Entrega RRHH a ${employees[empId].first_name} ${employees[empId].last_name}`,
                    created_at: new Date()
                });

                // NOTE: If product ID is missing due to query, we'll fail. I need to fix logic to ensure ID.
                // Assuming `product_code` in `material_requests` links to `products.code`. I should lookup ID if not in join.
                // Or better, update fetch query.

                // B. Update Global Stock (Legacy/Cache)
                // Need raw update: update products set current_stock = current_stock - qty where code = ...
                const newStock = (item.product?.current_stock || 0) - item.quantity;
                await supabase.from('products').update({ current_stock: newStock }).eq('code', item.product_code);

                // C. Update Request Status
                await supabase.from('material_requests').update({
                    status: 'DELIVERED',
                    processed_at: new Date(),
                    signed_receipt_url: fileName
                }).eq('id', item.id);
            }

            toast.success('Entrega Finalizada Exitosamente');
            setProcessingId(null);
            setSignedFile(null);
            fetchData();

        } catch (err) {
            console.error(err);
            toast.error('Error: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    // Helper to get Product ID safely? 
    // I should update the query in fetchData.

    return (
        <div className="space-y-6 pb-20">
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

                                {/* LISTA DE ITEMS (Simple Table vs Detailed Edit in Processing) */}
                                {!isProcessing ? (
                                    <div className="p-6">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-xs text-slate-400 uppercase text-left">
                                                    <th className="pb-3">Código</th>
                                                    <th className="pb-3">Descripción</th>
                                                    <th className="pb-3 text-center">Cant.</th>
                                                    <th className="pb-3 text-center">Stock Global</th>
                                                    <th className="pb-3 text-center">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map(item => (
                                                    <tr key={item.id} className="border-b border-slate-50 last:border-0">
                                                        <td className="py-3 font-mono text-slate-500">{item.product_code}</td>
                                                        <td className="py-3 font-medium">{item.product?.name}</td>
                                                        <td className="py-3 text-center font-bold">{item.quantity}</td>
                                                        <td className="py-3 text-center font-bold text-slate-500">{item.product?.current_stock}</td>
                                                        <td className="py-3 text-center"><span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold">Pendiente</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-6 bg-indigo-50/50">
                                        <div className="mb-6 flex items-center gap-2 text-indigo-800 font-bold bg-indigo-100 p-3 rounded-lg">
                                            <Building size={18} />
                                            <span>Asignación de Bodega y Costos</span>
                                        </div>

                                        <div className="space-y-4 mb-8">
                                            {items.map(item => {
                                                const details = deliveryDetails[item.id] || {};
                                                // Calculate available stocks for this product
                                                const stocks = warehouseStock[item.product_id] || {}; // warehouseId -> qty
                                                const selectedWhStock = stocks[details.warehouseId] || 0;
                                                const hasStockInSelected = selectedWhStock >= item.quantity;

                                                return (
                                                    <div key={item.id} className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                                                        <div className="md:col-span-4">
                                                            <p className="font-bold text-slate-800">{item.product?.name}</p>
                                                            <p className="text-xs text-slate-400 font-mono">{item.product_code}</p>
                                                        </div>
                                                        <div className="md:col-span-1 text-center">
                                                            <p className="text-xs text-slate-400 uppercase font-bold">Cant</p>
                                                            <p className="font-bold text-lg">{item.quantity}</p>
                                                        </div>

                                                        {/* Bodega Selection */}
                                                        <div className="md:col-span-3">
                                                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Bodega Origen</label>
                                                            <select
                                                                className={`w-full text-sm border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-200 font-bold ${!details.warehouseId ? 'border-red-300 bg-red-50' :
                                                                    !hasStockInSelected ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200'
                                                                    }`}
                                                                value={details.warehouseId}
                                                                onChange={e => handleDetailChange(item.id, 'warehouseId', e.target.value)}
                                                            >
                                                                <option value="">-- Seleccionar --</option>
                                                                {warehouses.map(w => {
                                                                    const st = stocks[w.id] || 0;
                                                                    return (
                                                                        <option key={w.id} value={w.id} disabled={st < item.quantity}>
                                                                            {w.name} (Stock: {st})
                                                                        </option>
                                                                    );
                                                                })}
                                                            </select>
                                                            {details.warehouseId && !hasStockInSelected && (
                                                                <p className="text-[10px] text-red-500 font-bold mt-1">⚠️ Stock insuficiente ({selectedWhStock})</p>
                                                            )}
                                                        </div>

                                                        {/* Price Input */}
                                                        <div className="md:col-span-2">
                                                            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Costo Unit $</label>
                                                            <input
                                                                type="number"
                                                                className="w-full text-sm border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-200 text-right font-mono"
                                                                value={details.price}
                                                                onChange={e => handleDetailChange(item.id, 'price', e.target.value)}
                                                            />
                                                        </div>

                                                        {/* Total Row */}
                                                        <div className="md:col-span-2 text-right">
                                                            <p className="text-xs text-slate-400 uppercase font-bold">Total</p>
                                                            <p className="font-bold text-emerald-600">
                                                                ${(details.price * item.quantity).toLocaleString('es-CL')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-indigo-200">
                                            {/* Paso 1: Generar */}
                                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                                                <div className="text-xs font-bold text-indigo-400 uppercase mb-2">Paso 1</div>
                                                <button
                                                    onClick={() => handleGeneratePDF(empId)}
                                                    className="w-full flex justify-center items-center gap-2 py-3 border-2 border-dashed border-indigo-200 rounded-lg text-indigo-600 font-bold hover:bg-indigo-50 hover:border-indigo-400 transition-all"
                                                >
                                                    <Printer size={20} /> Generar Acta PDF
                                                </button>
                                                <p className="text-xs text-slate-400 mt-2">Valores y bodegas se reflejarán en el documento</p>
                                            </div>

                                            {/* Paso 2: Subir y Confirmar */}
                                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm text-center">
                                                <div className="text-xs font-bold text-indigo-400 uppercase mb-2">Paso 2</div>
                                                <input
                                                    type="file"
                                                    id={`file-${empId}`}
                                                    accept="image/*,.pdf"
                                                    className="hidden"
                                                    onChange={e => setSignedFile(e.target.files[0])}
                                                />

                                                {!signedFile ? (
                                                    <label htmlFor={`file-${empId}`} className="block w-full text-center py-3 bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 text-slate-600 font-medium transition-colors">
                                                        <Upload size={18} className="inline mr-2" /> Subir Acta Firmada
                                                    </label>
                                                ) : (
                                                    <div className="text-sm font-bold text-green-600 flex items-center justify-center gap-2 bg-green-50 py-3 rounded-lg border border-green-200">
                                                        <Check size={16} /> {signedFile.name}
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => handleConfirmDelivery(empId)}
                                                    disabled={!signedFile || uploading}
                                                    className="w-full mt-3 bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow transition-all"
                                                >
                                                    {uploading ? 'Procesando Movimientos...' : 'Confirmar Salida de Bodega'}
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PendingRequests;
