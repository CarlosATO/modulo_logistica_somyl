import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { Package, FileText, Check, Upload, AlertTriangle, Printer, Search, Building, MapPin, X } from 'lucide-react';
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

    // Delivery Details State (Map of reqId -> { warehouseId, price, locationId, locationCode, sourceTableId })
    const [deliveryDetails, setDeliveryDetails] = useState({});
    const [warehouseStock, setWarehouseStock] = useState({}); // Map: productId -> { warehouseId: stock }

    // Location Picker Modal State
    const [showPickModal, setShowPickModal] = useState(false);
    const [pickingItem, setPickingItem] = useState(null);
    const [pickingLocations, setPickingLocations] = useState([]);

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

            // 3. Fetch Stock per Warehouse (From product_locations - physical stock)
            const productIds = [...new Set(reqs.map(r => r.product_id || r.product?.id))].filter(Boolean);
            if (productIds.length > 0) {
                const { data: stockData } = await supabase
                    .from('product_locations')
                    .select('product_id, warehouse_id, quantity')
                    .in('product_id', productIds)
                    .gt('quantity', 0);

                if (stockData) {
                    const stockMap = {}; // { prodId: { whId: qty } }
                    stockData.forEach(s => {
                        if (!stockMap[s.product_id]) stockMap[s.product_id] = {};
                        if (!stockMap[s.product_id][s.warehouse_id]) stockMap[s.product_id][s.warehouse_id] = 0;
                        stockMap[s.product_id][s.warehouse_id] += Number(s.quantity);
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

    // Open Location Picker Modal
    const openLocationPicker = async (item, warehouseId) => {
        if (!warehouseId) {
            toast.error('⚠️ Primero selecciona una bodega');
            return;
        }
        const productId = item.product?.id || item.product_id;
        const { data } = await supabase
            .from('product_locations')
            .select('*, locations(full_code)')
            .eq('product_id', productId)
            .eq('warehouse_id', warehouseId)
            .gt('quantity', 0);

        if (!data || data.length === 0) {
            toast.error('⚠️ No hay stock físico en racks para este producto en esta bodega');
            return;
        }
        setPickingLocations(data);
        setPickingItem(item);
        setShowPickModal(true);
    };

    // Confirm Location Selection
    const confirmLocationPick = (location) => {
        if (!pickingItem || !location) return;
        setDeliveryDetails(prev => ({
            ...prev,
            [pickingItem.id]: {
                ...prev[pickingItem.id],
                locationId: location.location_id,
                locationCode: location.locations?.full_code || 'N/A',
                sourceTableId: location.id // product_locations row ID for deduction
            }
        }));
        setShowPickModal(false);
        setPickingItem(null);
        toast.success(`✅ Ubicación seleccionada: ${location.locations?.full_code}`);
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

        // Validation: Warehouses AND Locations Selected
        for (const item of items) {
            const details = deliveryDetails[item.id];
            if (!details?.warehouseId) {
                toast.error(`⚠️ Selecciona bodega para: ${item.product?.name}`);
                return;
            }
            if (!details?.locationId || !details?.sourceTableId) {
                toast.error(`⚠️ Selecciona ubicación (rack) para: ${item.product?.name}`);
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

            // 2. Process Items
            for (const item of items) {
                const details = deliveryDetails[item.id];
                const productId = item.product?.id || item.product_id;

                // A. Deduct from product_locations (physical stock)
                const { data: currentLoc } = await supabase
                    .from('product_locations')
                    .select('quantity')
                    .eq('id', details.sourceTableId)
                    .single();

                if (currentLoc) {
                    const newQty = Number(currentLoc.quantity) - item.quantity;
                    if (newQty <= 0) {
                        await supabase.from('product_locations').delete().eq('id', details.sourceTableId);
                    } else {
                        await supabase.from('product_locations').update({ quantity: newQty }).eq('id', details.sourceTableId);
                    }
                }

                // B. Insert Movement (OUTBOUND) for history
                await supabase.from('movements').insert({
                    type: 'OUTBOUND',
                    warehouse_id: details.warehouseId,
                    product_id: productId,
                    quantity: item.quantity,
                    unit_price: details.price,
                    reception_document_url: fileName,
                    comments: `Entrega RRHH a ${employees[empId].first_name} ${employees[empId].last_name} | Rack: ${details.locationCode}`,
                    user_email: 'sistema@somyl.cl'
                });

                // C. Update Global Stock (Legacy/Cache)
                const newStock = Math.max(0, (item.product?.current_stock || 0) - item.quantity);
                await supabase.from('products').update({ current_stock: newStock }).eq('id', productId);

                // D. Update Request Status
                await supabase.from('material_requests').update({
                    status: 'DELIVERED',
                    processed_at: new Date(),
                    signed_receipt_url: fileName
                }).eq('id', item.id);
            }

            toast.success('✅ Entrega Finalizada Exitosamente');
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
        <>
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
                                                            <div className="md:col-span-2">
                                                                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Bodega Origen</label>
                                                                <select
                                                                    className={`w-full text-sm border rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-200 font-bold ${!details.warehouseId ? 'border-red-300 bg-red-50' :
                                                                        !hasStockInSelected ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200'
                                                                        }`}
                                                                    value={details.warehouseId}
                                                                    onChange={e => {
                                                                        handleDetailChange(item.id, 'warehouseId', e.target.value);
                                                                        // Reset location when warehouse changes
                                                                        handleDetailChange(item.id, 'locationId', null);
                                                                        handleDetailChange(item.id, 'locationCode', null);
                                                                        handleDetailChange(item.id, 'sourceTableId', null);
                                                                    }}
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
                                                            </div>

                                                            {/* Location Picker Button */}
                                                            <div className="md:col-span-2">
                                                                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Ubicación (Rack)</label>
                                                                {details.locationCode ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-emerald-700 font-bold text-sm flex items-center gap-2">
                                                                            <MapPin size={16} /> {details.locationCode}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => openLocationPicker(item, details.warehouseId)}
                                                                            className="text-xs text-indigo-600 hover:underline"
                                                                        >Cambiar</button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => openLocationPicker(item, details.warehouseId)}
                                                                        disabled={!details.warehouseId}
                                                                        className={`w-full text-sm border-2 border-dashed rounded-lg p-2 font-bold flex items-center justify-center gap-2 transition-all ${!details.warehouseId ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-400'
                                                                            }`}
                                                                    >
                                                                        <MapPin size={16} /> Seleccionar Rack
                                                                    </button>
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

            {/* Location Picker Modal */}
            {
                showPickModal && pickingItem && (
                    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                            <div className="p-5 border-b bg-indigo-50 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                                        <MapPin size={20} /> Seleccionar Ubicación
                                    </h3>
                                    <p className="text-sm text-indigo-600">{pickingItem.product?.name}</p>
                                </div>
                                <button onClick={() => setShowPickModal(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                                {pickingLocations.length === 0 ? (
                                    <p className="text-center text-slate-400 py-10">No hay stock en racks para este producto</p>
                                ) : (
                                    pickingLocations.map(loc => (
                                        <div
                                            key={loc.id}
                                            onClick={() => {
                                                if (loc.quantity >= pickingItem.quantity) {
                                                    confirmLocationPick(loc);
                                                } else {
                                                    toast.error(`⚠️ Stock insuficiente en esta ubicación (${loc.quantity} disponible)`);
                                                }
                                            }}
                                            className={`p-4 border-2 rounded-xl cursor-pointer transition-all flex justify-between items-center ${loc.quantity >= pickingItem.quantity
                                                ? 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50'
                                                : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                                                }`}
                                        >
                                            <div>
                                                <p className="font-bold text-slate-800 text-lg">{loc.locations?.full_code || 'Sin código'}</p>
                                                <p className="text-xs text-slate-400">Bodega Rack</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-2xl font-black ${loc.quantity >= pickingItem.quantity ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                    {loc.quantity}
                                                </p>
                                                <p className="text-[10px] text-slate-400">DISPONIBLE</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-4 bg-slate-50 border-t text-center text-xs text-slate-400">
                                Cantidad requerida: <span className="font-bold text-indigo-600">{pickingItem.quantity}</span>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
};

export default PendingRequests;
