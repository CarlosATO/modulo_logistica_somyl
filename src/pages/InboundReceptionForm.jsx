import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Search, Truck, UploadCloud, Plus, Trash2, CheckCircle,
    Loader, Building, Calendar, Paperclip, FileText, Package, AlertCircle, Hash, Save, ShoppingCart, AlertTriangle, X
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar';
import Combobox from '../components/Combobox';
import { toast } from 'sonner';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';

export default function InboundReceptionForm({ onClose, onSuccess }) {
    const { user } = useAuth();

    // --- ESTADOS GLOBALES ---
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [activeTab, setActiveTab] = useState('OC');
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // --- DATOS MAESTROS ---
    const [projectsDB, setProjectsDB] = useState([]);
    const [suppliersDB, setSuppliersDB] = useState([]);
    const [clientsList, setClientsList] = useState([]);
    const [clientCatalog, setClientCatalog] = useState([]);

    // --- ESTADOS OC ---
    const [ocNumber, setOcNumber] = useState('');
    const [ocData, setOcData] = useState(null);
    const [ocHeader, setOcHeader] = useState(null);
    const [ocHistory, setOcHistory] = useState({});
    const [ocInputs, setOcInputs] = useState({});
    const [ocProject, setOcProject] = useState('');

    // --- ESTADOS ASIGNADOS (MANUAL) ---
    const [assignedForm, setAssignedForm] = useState({
        client_name: '',
        project_name: '',
        document_number: '',
        supplier_name: ''
    });
    const [manualCart, setManualCart] = useState([]);
    const [selectedMaterialId, setSelectedMaterialId] = useState('');
    const [newItem, setNewItem] = useState({
        code: '', name: '', quantity: '', unit: 'UN', price: '0'
    });
    const [receiptFile, setReceiptFile] = useState(null);
    const materialComboboxRef = useRef(null);
    const quantityInputRef = useRef(null);

    // ==========================================
    // CARGA INICIAL
    // ==========================================
    useEffect(() => {
        const fetchMasters = async () => {
            try {
                const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
                setWarehouses(wh || []);

                const { data: proj } = await supabaseProcurement
                    .from('proyectos')
                    .select('id, proyecto, cliente, activo')
                    .eq('activo', true)
                    .order('proyecto', { ascending: true });

                if (proj) {
                    setProjectsDB(proj);
                    const uniqueClients = [...new Set(proj.map(p => p.cliente))].filter(Boolean).sort();
                    setClientsList(uniqueClients);
                }

                const { data: supp } = await supabaseProcurement
                    .from('proveedores')
                    .select('id, nombre, rut')
                    .order('nombre', { ascending: true });

                setSuppliersDB(supp || []);

            } catch (error) {
                console.error("Error cargando maestros:", error);
            }
        };
        fetchMasters();
    }, []);

    // ==========================================
    // LÓGICA DE CATÁLOGO (ASIGNADOS)
    // ==========================================
    useEffect(() => {
        const loadCatalog = async () => {
            if (!assignedForm.client_name) {
                setClientCatalog([]);
                return;
            }

            const { data, error } = await supabase
                .from('assigned_materials')
                .select('*')
                .ilike('client_name', `%${assignedForm.client_name}%`)
                .order('description', { ascending: true });

            if (!error) setClientCatalog(data || []);
        };
        loadCatalog();
    }, [assignedForm.client_name]);

    const handleMaterialSelect = (matId) => {
        setSelectedMaterialId(matId);

        const material = clientCatalog.find(m => m.id === matId);
        if (material) {
            setNewItem({
                code: material.code,
                name: material.description,
                unit: material.unit || 'UN',
                quantity: '',
                price: '0'
            });
            setTimeout(() => {
                if (quantityInputRef.current) {
                    quantityInputRef.current.focus();
                }
            }, 100);
        } else {
            setNewItem({ code: '', name: '', quantity: '', unit: 'UN', price: '0' });
        }
    };

    const filteredProjects = useMemo(() => {
        if (!assignedForm.client_name) return [];
        return projectsDB.filter(p => p.cliente === assignedForm.client_name);
    }, [projectsDB, assignedForm.client_name]);


    // ==========================================
    // LÓGICA OC
    // ==========================================
    const handleSearchOC = async (term) => {
        if (!term || String(term).trim().length < 3) return;

        setOcNumber(term);
        setLoading(true);
        setOcData(null);
        setOcHeader(null);
        setReceiptFile(null);
        setOcInputs({});

        try {
            const { data: ocLines, error } = await supabaseProcurement
                .from('orden_de_compra')
                .select('*')
                .eq('orden_compra', parseInt(term));

            if (error || !ocLines?.length) {
                toast.error("Orden de Compra no encontrada.");
                return;
            }

            const firstLine = ocLines[0];
            const providerInfo = suppliersDB.find(s => s.id === firstLine.proveedor);

            setOcHeader({
                fecha: firstLine.fecha,
                proveedor: providerInfo ? providerInfo.nombre : 'Proveedor Desconocido',
                rut: providerInfo ? providerInfo.rut : '-'
            });

            // Historial de recepciones
            const { data: history } = await supabase
                .from('movements')
                .select('oc_line_id, quantity')
                .eq('oc_number', String(term))
                .eq('type', 'INBOUND');

            const receivedMap = {};
            history?.forEach(mov => {
                receivedMap[mov.oc_line_id] = (receivedMap[mov.oc_line_id] || 0) + Number(mov.quantity);
            });
            setOcHistory(receivedMap);

            const initialInputs = {};
            ocLines.forEach(line => {
                const officialPrice = line.precio_unitario || line.precio || 0;
                initialInputs[line.art_corr] = {
                    quantity: '',
                    price: officialPrice
                };
            });

            setOcInputs(initialInputs);
            setOcData(ocLines);

        } catch (err) {
            console.error(err);
            toast.error("Error buscando OC.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitOC = async () => {
        if (!selectedWarehouse) return toast.error("⚠️ Debes seleccionar una Bodega de Destino");
        if (!ocProject) return toast.error("⚠️ Debes asignar un Proyecto a esta recepción");
        const mainDoc = ocInputs['global_doc'];
        if (!mainDoc) return toast.error("⚠️ Falta el N° de Guía o Factura");

        const itemsToProcess = ocData
            .filter(line => Number(ocInputs[line.art_corr]?.quantity || 0) > 0)
            .map(line => ({
                codigo: line.codigo,
                descripcion: line.descripcion,
                unidad: line.unidad || 'UN',
                cantidad: Number(ocInputs[line.art_corr].quantity),
                precio: Number(ocInputs[line.art_corr].price || 0),
                art_corr: String(line.art_corr)
            }));

        if (itemsToProcess.length === 0) return toast.warning("No hay cantidades ingresadas");

        setProcessing(true);

        const promise = new Promise(async (resolve, reject) => {
            try {
                let docUrl = null;
                if (receiptFile) {
                    const fileName = `OC-${ocNumber}-${Date.now()}.${receiptFile.name.split('.').pop()}`;
                    const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, receiptFile);
                    if (uploadError) throw uploadError;
                    docUrl = fileName;
                }

                const { error: rpcError } = await supabase.rpc('receive_oc_items', {
                    p_warehouse_id: selectedWarehouse,
                    p_oc_number: String(ocNumber),
                    p_document_number: mainDoc,
                    p_project_id: ocProject,
                    p_doc_url: docUrl,
                    p_global_obs: ocInputs['global_obs'] || null,
                    p_user_email: user?.email,
                    p_items: itemsToProcess
                });

                if (rpcError) throw rpcError;

                if (onSuccess) onSuccess();
                resolve("Recepción procesada correctamente");

            } catch (err) {
                console.error(err);
                reject("Error: " + (err.message || "Fallo en la transacción"));
            }
        });

        toast.promise(promise, {
            loading: 'Guardando...',
            success: (data) => `✅ ${data}`,
            error: (err) => `❌ ${err}`,
        }).finally(() => {
            setProcessing(false);
        });
    };

    // ==========================================
    // LÓGICA ASIGNADOS
    // ==========================================
    const addManualItem = () => {
        if (!selectedMaterialId || !newItem.quantity) return toast.error('Faltan datos (Selección y Cantidad).');
        setManualCart([...manualCart, { ...newItem }]);
        setNewItem({ code: '', name: '', quantity: '', unit: 'UN', price: '0' });
        setSelectedMaterialId('');

        setTimeout(() => {
            if (materialComboboxRef.current) {
                const button = materialComboboxRef.current.querySelector('button');
                if (button) button.focus();
            }
        }, 100);
    };

    const removeManualItem = (idx) => {
        setManualCart(manualCart.filter((_, i) => i !== idx));
    };

    const handleSubmitAssigned = async () => {
        if (!selectedWarehouse) return toast.error("Selecciona bodega.");
        if (!assignedForm.client_name) return toast.error("Selecciona Cliente.");
        if (!assignedForm.project_name) return toast.error("Selecciona Proyecto.");
        if (!assignedForm.document_number) return toast.error("Falta N° Guía.");
        if (manualCart.length === 0) return toast.error("Carrito vacío.");

        setProcessing(true);
        try {
            let docUrl = null;
            if (receiptFile) {
                const fileName = `MAN-${Date.now()}.${receiptFile.name.split('.').pop()}`;
                await supabase.storage.from('documents').upload(fileName, receiptFile);
                docUrl = fileName;
            }

            for (const item of manualCart) {
                let productId = null;
                const { data: existingProd } = await supabase.from('products')
                    .select('id, current_stock').eq('code', item.code).maybeSingle();

                if (existingProd) {
                    productId = existingProd.id;
                    await supabase.from('products').update({
                        price: item.price,
                        current_stock: Number(existingProd.current_stock) + Number(item.quantity)
                    }).eq('id', productId);
                } else {
                    const { data: newProd } = await supabase.from('products').insert({
                        code: item.code, name: item.name ? item.name.toUpperCase() : item.name, unit: item.unit,
                        price: item.price, current_stock: item.quantity
                    }).select().single();
                    productId = newProd.id;
                }

                await supabase.from('movements').insert({
                    type: 'INBOUND',
                    warehouse_id: selectedWarehouse,
                    product_id: productId,
                    quantity: item.quantity,
                    unit_price: item.price,
                    document_number: assignedForm.document_number,
                    client_owner: assignedForm.client_name,
                    project_id: assignedForm.project_name,
                    supplier_id: assignedForm.supplier_name,
                    reception_document_url: docUrl,
                    other_data: `Guía: ${assignedForm.document_number} | Prov: ${assignedForm.supplier_name || '-'}`,
                    comments: `Ingreso Asignado | ${assignedForm.project_name}`,
                    user_email: user?.email
                });
            }

            toast.success("✅ Ingreso Asignado Guardado.");
            if (onSuccess) onSuccess();

        } catch (err) {
            console.error(err);
            toast.error("Error: " + err.message);
        } finally {
            setProcessing(false);
        }
    };

    const handleFileChange = (e) => {
        const f = e?.target?.files?.[0];
        if (f) {
            setReceiptFile(f);
            toast.success(`✅ Documento subido: ${f.name}`);
        }
    };

    const parseQuantity = (formattedValue) => {
        if (!formattedValue) return '';
        return formattedValue.replace(/\./g, '').replace(',', '.');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header Modal */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Plus className="text-emerald-600" /> Nuevo Ingreso de Materiales
                        </h2>
                        <p className="text-xs text-slate-500">Completa los pasos para registrar una recepción</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* SELECCIÓN BODEGA */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm">1</div>
                            <h3 className="font-bold text-slate-800">Bodega de Destino</h3>
                        </div>
                        <Combobox
                            options={warehouses}
                            value={selectedWarehouse}
                            onChange={setSelectedWarehouse}
                            placeholder="-- Seleccionar Bodega --"
                        />
                    </div>

                    {/* TIPO DE INGRESO */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-sm">2</div>
                            <h3 className="font-bold text-slate-800">Tipo de Ingreso</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                onClick={() => setActiveTab('OC')}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${activeTab === 'OC' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeTab === 'OC' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <ShoppingCart size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm">Orden de Compra</h4>
                                        <p className="text-xs text-slate-500">Desde Adquisiciones</p>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => setActiveTab('ASSIGNED')}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${activeTab === 'ASSIGNED' ? 'border-purple-500 bg-purple-50' : 'border-slate-100 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${activeTab === 'ASSIGNED' ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <Package size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm">Material Asignado</h4>
                                        <p className="text-xs text-slate-500">Ingreso Manual / Cliente</p>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* CONTENIDO PESTAÑAS */}
                    {activeTab === 'OC' && (
                        <div className="animate-in fade-in">
                            {!selectedWarehouse ? (
                                <div className="p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm flex items-center gap-2">
                                    <AlertTriangle size={18} /> Selecciona una bodega primero.
                                </div>
                            ) : (
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm">3</div>
                                        <h3 className="font-bold text-slate-800">Buscar Orden de Compra</h3>
                                    </div>
                                    <GoogleSearchBar
                                        type="number"
                                        placeholder="N° Orden (Ej: 4500123)"
                                        loading={loading}
                                        onSearch={handleSearchOC}
                                    />

                                    {ocData && (
                                        <div className="space-y-4 mt-4">
                                            {/* Header Info */}
                                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs grid grid-cols-3 gap-2">
                                                <div><span className="font-bold text-slate-500">Proveedor:</span> {ocHeader?.proveedor}</div>
                                                <div><span className="font-bold text-slate-500">Fecha:</span> {ocHeader?.fecha}</div>
                                                <div><span className="font-bold text-slate-500">RUT:</span> {ocHeader?.rut}</div>
                                            </div>

                                            {/* Campos Extra */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <Combobox
                                                    options={projectsDB.map(p => ({ id: p.proyecto, name: `${p.proyecto} (${p.cliente})` }))}
                                                    value={ocProject}
                                                    onChange={setOcProject}
                                                    placeholder="-- Proyecto --"
                                                    label="Asignar Proyecto *"
                                                />
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">N° Guía / Factura *</label>
                                                    <input type="text" className="w-full p-2 border rounded-lg text-sm font-bold" onChange={(e) => setOcInputs(p => ({ ...p, global_doc: e.target.value }))} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Respaldo PDF</label>
                                                    <input type="file" accept=".pdf,.jpg,.png" className="w-full text-xs" onChange={handleFileChange} />
                                                </div>
                                            </div>

                                            {/* Tabla Items */}
                                            <div className="overflow-x-auto border rounded-lg">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-100 text-slate-500 uppercase">
                                                        <tr>
                                                            <th className="px-3 py-2">Item</th>
                                                            <th className="px-3 py-2 text-center">Total</th>
                                                            <th className="px-3 py-2 text-center text-orange-600">Pend.</th>
                                                            <th className="px-3 py-2 text-center bg-blue-50 w-24">Recibir</th>
                                                            <th className="px-3 py-2 text-center bg-green-50 w-28">$$</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {ocData.map((line) => {
                                                            const received = ocHistory[line.art_corr] || 0;
                                                            const pending = line.cantidad - received;
                                                            const isComplete = pending <= 0;
                                                            const currentInput = ocInputs[line.art_corr] || {};
                                                            if (isComplete) return null; // Opcional: Ocultar completados
                                                            return (
                                                                <tr key={line.id} className="hover:bg-slate-50">
                                                                    <td className="px-3 py-2 font-medium">{line.descripcion}</td>
                                                                    <td className="px-3 py-2 text-center">{line.cantidad}</td>
                                                                    <td className="px-3 py-2 text-center text-orange-600 font-bold">{pending}</td>
                                                                    <td className="px-3 py-1 bg-blue-50/30">
                                                                        <input type="number" min="0" max={pending}
                                                                            className="w-full text-center border rounded py-1 font-bold"
                                                                            value={currentInput.quantity || ''}
                                                                            onChange={(e) => setOcInputs(p => ({ ...p, [line.art_corr]: { ...p[line.art_corr], quantity: e.target.value } }))}
                                                                        />
                                                                    </td>
                                                                    <td className="px-3 py-1 bg-green-50/30">
                                                                        <input type="number"
                                                                            className="w-full text-right border rounded py-1 text-green-700"
                                                                            value={currentInput.price || ''}
                                                                            onChange={(e) => setOcInputs(p => ({ ...p, [line.art_corr]: { ...p[line.art_corr], price: e.target.value } }))}
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            <button
                                                onClick={handleSubmitOC}
                                                disabled={processing}
                                                className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex justify-center items-center gap-2"
                                            >
                                                {processing ? <Loader className="animate-spin" /> : <><CheckCircle size={20} /> Confirmar Recepción OC</>}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'ASSIGNED' && (
                        <div className="animate-in fade-in">
                            {!selectedWarehouse ? (
                                <div className="p-4 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-sm flex items-center gap-2">
                                    <AlertTriangle size={18} /> Selecciona una bodega primero.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Formulario Asignado */}
                                    {/* ... (Implementación simplificada del form manual) ... */}
                                    <div className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Combobox
                                            options={clientsList.map((c, idx) => ({ id: `client_${idx}_${c}`, name: c }))}
                                            value={assignedForm.client_name ? clientsList.map((c, idx) => `client_${idx}_${c}`).find(id => id.endsWith(assignedForm.client_name)) : ''}
                                            onChange={(val) => { const name = val.split('_').slice(2).join('_'); setAssignedForm({ ...assignedForm, client_name: name, project_name: '' }); setClientCatalog([]); }}
                                            placeholder="-- Cliente --"
                                            label="Cliente"
                                        />
                                        <Combobox
                                            options={filteredProjects.map(p => ({ id: p.proyecto, name: p.proyecto }))}
                                            value={assignedForm.project_name}
                                            onChange={(val) => setAssignedForm({ ...assignedForm, project_name: val })}
                                            placeholder="-- Proyecto --"
                                            label="Proyecto"
                                            disabled={!assignedForm.client_name}
                                        />
                                        {/* Proveedor y Doc */}
                                        <Combobox
                                            options={suppliersDB.map(s => ({ id: s.nombre, name: s.nombre }))}
                                            value={assignedForm.supplier_name}
                                            onChange={(val) => setAssignedForm({ ...assignedForm, supplier_name: val })}
                                            placeholder="-- Proveedor --"
                                            label="Proveedor"
                                        />
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">N° Guía</label>
                                            <input type="text" className="w-full p-2 border rounded-lg text-sm font-bold" value={assignedForm.document_number} onChange={e => setAssignedForm({ ...assignedForm, document_number: e.target.value })} />
                                        </div>
                                    </div>

                                    {/* Agregar Items */}
                                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 grid grid-cols-12 gap-2">
                                        <div className="col-span-5" ref={materialComboboxRef}>
                                            <Combobox
                                                options={clientCatalog.map(m => ({ id: m.id, name: `${m.description} (${m.code})` }))}
                                                value={selectedMaterialId}
                                                onChange={handleMaterialSelect}
                                                placeholder="-- Material --"
                                                label="Material"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-purple-700">Cant.</label>
                                            <input ref={quantityInputRef} type="text" className="w-full p-2 rounded text-center font-bold border-purple-200" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} onBlur={e => setNewItem({ ...newItem, quantity: parseQuantity(e.target.value) })} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-green-700">$$</label>
                                            <input type="number" className="w-full p-2 rounded text-right font-bold border-green-200 text-green-700" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} />
                                        </div>
                                        <div className="col-span-3 flex items-end">
                                            <button onClick={addManualItem} className="w-full bg-purple-600 text-white p-2 rounded-lg font-bold text-sm hover:bg-purple-700">
                                                <Plus size={16} className="inline mr-1" /> Agregar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Lista Manual */}
                                    {manualCart.length > 0 && (
                                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                            {manualCart.map((item, i) => (
                                                <div key={i} className="flex justify-between items-center p-3 border-b last:border-0 text-sm">
                                                    <div>
                                                        <div className="font-bold text-slate-700">{item.name}</div>
                                                        <div className="text-xs text-slate-400">{item.code}</div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="font-bold">{item.quantity} {item.unit}</span>
                                                        <button onClick={() => removeManualItem(i)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="p-4 bg-slate-50 flex justify-between items-center">
                                                <input type="file" accept=".pdf" className="text-xs w-1/2" onChange={handleFileChange} />
                                                <button onClick={handleSubmitAssigned} disabled={processing} className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700">
                                                    {processing ? <Loader className="animate-spin" /> : 'Confirmar Ingreso'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
