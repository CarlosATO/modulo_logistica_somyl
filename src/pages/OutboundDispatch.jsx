import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement, getProveedores } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import {
    Search, ArrowRight, Truck, User, FileText,
    MapPin, Package, X, CheckCircle, Loader, Briefcase, Plus, AlertCircle, Users
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar';
import Combobox from '../components/Combobox';
import { toast } from 'sonner';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// --- ESTILOS PDF ---
const styles = StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: 1, borderColor: '#eee', paddingBottom: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 10, color: '#666', marginTop: 4 },
    section: { marginVertical: 10, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
    label: { fontSize: 8, color: '#888', marginBottom: 2, textTransform: 'uppercase' },
    value: { fontSize: 11, fontWeight: 'bold', color: '#333' },
    table: { marginTop: 20, borderTop: 1, borderColor: '#eee' },
    tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: 6, fontWeight: 'bold' },
    tableRow: { flexDirection: 'row', borderBottom: 1, borderColor: '#eee', padding: 6 },
    col1: { width: '15%' }, col2: { width: '45%' }, col3: { width: '25%' }, col4: { width: '15%', textAlign: 'center' },
    footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#aaa', fontSize: 8, borderTop: 1, borderColor: '#eee', paddingTop: 10 }
});

// --- DOCUMENTO PDF ---
const DispatchDocument = ({ data }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            <View style={styles.header}>
                <View><Text style={styles.title}>GUÍA DE DESPACHO</Text><Text style={styles.subtitle}>Folio: {data.folio}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.subtitle}>{new Date().toLocaleDateString()}</Text></View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.section, { flex: 1 }]}><Text style={styles.label}>Origen</Text><Text style={styles.value}>{data.warehouseName}</Text></View>
                <View style={[styles.section, { flex: 1 }]}>
                    <Text style={styles.label}>Destino / Proyecto</Text>
                    <Text style={styles.value}>{data.projectName}</Text>
                    <Text style={{ fontSize: 9, marginTop: 2 }}>{data.stage}</Text>
                    {/* MOSTRAR QUIÉN RECIBE SI ES SUBCONTRATO */}
                    {data.isSubcontract && (
                        <Text style={{ fontSize: 9, marginTop: 4, color: '#4f46e5', fontWeight: 'bold' }}>
                            ENTREGADO A: {data.providerName || 'CONTRATISTA'}
                        </Text>
                    )}
                </View>
            </View>
            <View style={styles.section}><Text style={styles.label}>Receptor (Firma)</Text><Text style={styles.value}>{data.receiverName} | RUT: {data.receiverRut}</Text></View>
            <View style={styles.table}>
                <View style={styles.tableHeader}><Text style={styles.col1}>COD</Text><Text style={styles.col2}>DESC</Text><Text style={styles.col3}>UBICACIÓN</Text><Text style={styles.col4}>CANT</Text></View>
                {data.items.map((item, i) => (
                    <View key={i} style={styles.tableRow}><Text style={styles.col1}>{item.code}</Text><Text style={styles.col2}>{item.name}</Text><Text style={styles.col3}>{item.locationName}</Text><Text style={styles.col4}>{item.quantity}</Text></View>
                ))}
            </View>
            <Text style={styles.footer}>Sistema Somyl - {data.id} - {data.isSubcontract ? 'Cargo a Subcontrato' : 'Consumo Interno'}</Text>
        </Page>
    </Document>
);

export default function OutboundDispatch() {
    const { user } = useAuth();

    // Maestros
    const [warehouses, setWarehouses] = useState([]);
    const [projects, setProjects] = useState([]);
    const [assignedMaterials, setAssignedMaterials] = useState([]);

    // Proveedores (Subcontratos)
    const [providers, setProviders] = useState([]);

    // Cabecera
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [projectClient, setProjectClient] = useState('');
    const [receiver, setReceiver] = useState({ name: '', rut: '', plate: '', stage: '' });

    // Switch Subcontrato
    const [isSubcontract, setIsSubcontract] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState('');

    // Picking
    const [searchResults, setSearchResults] = useState([]);
    const [cart, setCart] = useState([]);

    // MODAL DE PICKING
    const [showPickModal, setShowPickModal] = useState(false);
    const [pickingProduct, setPickingProduct] = useState(null);
    const [pickingLocations, setPickingLocations] = useState([]);
    const [pickQuantities, setPickQuantities] = useState({});

    // Estado PDF
    const [lastDispatchData, setLastDispatchData] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [pdfDownloaded, setPdfDownloaded] = useState(false);

    // 1. Cargar Datos Iniciales
    useEffect(() => {
        const init = async () => {
            const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
            setWarehouses(wh || []);

            const { data: pj } = await supabaseProcurement.from('proyectos').select('id, proyecto, cliente').eq('activo', true);
            setProjects(pj || []);

            const { data: asm } = await supabase.from('assigned_materials').select('code, client_name');
            setAssignedMaterials(asm || []);

            // Cargar Proveedores (Solo Subcontratos = true)
            const provs = await getProveedores(true);
            setProviders(provs || []);
        };
        init();
    }, []);

    // Detectar Cliente al cambiar Proyecto
    useEffect(() => {
        if (selectedProject) {
            const p = projects.find(x => x.id === Number(selectedProject));
            setProjectClient(p ? p.cliente : '');
        } else {
            setProjectClient('');
        }
    }, [selectedProject, projects]);

    // Cargar automáticamente materiales disponibles cuando se selecciona bodega + proyecto
    useEffect(() => {
        const loadAvailableMaterials = async () => {
            if (!selectedWarehouse || !selectedProject) return;

            try {
                // 1) Obtener stock físico en la bodega
                const { data: rackStock } = await supabase
                    .from('product_locations')
                    .select('product_id, quantity')
                    .eq('warehouse_id', selectedWarehouse)
                    .gt('quantity', 0)
                    .limit(1000);

                if (!rackStock || rackStock.length === 0) {
                    setSearchResults([]);
                    return;
                }

                const productIds = [...new Set(rackStock.map(r => r.product_id))];

                // 2) Traer datos de productos
                const { data: prods } = await supabase
                    .from('products')
                    .select('*')
                    .in('id', productIds)
                    .order('name', { ascending: true });

                // 3) Mapear stock por producto
                const stockMap = {};
                rackStock.forEach(rs => {
                    stockMap[rs.product_id] = (stockMap[rs.product_id] || 0) + Number(rs.quantity);
                });

                // 4) Cruzar y filtrar por cliente/proyecto (si aplica)
                const enriched = (prods || []).map(p => ({ ...p, warehouseStock: stockMap[p.id] || 0 }))
                    .filter(prod => prod.warehouseStock > 0)
                    .filter(prod => {
                        const assignedInfo = assignedMaterials.find(a => a.code === prod.code);
                        if (!assignedInfo) return true;
                        return assignedInfo.client_name === projectClient;
                    });

                setSearchResults(enriched);
            } catch (err) {
                console.error('Error cargando materiales disponibles:', err);
                setSearchResults([]);
            }
        };

        loadAvailableMaterials();
    }, [selectedWarehouse, selectedProject, projectClient, assignedMaterials]);

    useEffect(() => {
        if (cart.length === 0) setPdfDownloaded(false);
    }, [cart]);

    // 2. Buscar Producto
    const handleSearch = async (term) => {
        if (!term || term.trim().length === 0) {
            setSearchResults([]);
            return;
        }

        if (!selectedWarehouse) {
            toast.error("⚠️ Primero selecciona una bodega.");
            return;
        }

        // A. Buscar productos que coincidan con el término
        const { data: prods } = await supabase
            .from('products')
            .select('*')
            .ilike('name', `%${term}%`)
            .limit(20);

        if (!prods || prods.length === 0) {
            setSearchResults([]);
            return;
        }

        // B. Obtener stock FÍSICO en la bodega seleccionada para estos productos
        const { data: rackStock } = await supabase
            .from('product_locations')
            .select('product_id, quantity')
            .eq('warehouse_id', selectedWarehouse)
            .in('product_id', prods.map(p => p.id));

        // Agrupar stock físico por producto
        const stockMap = {};
        rackStock?.forEach(rs => {
            stockMap[rs.product_id] = (stockMap[rs.product_id] || 0) + Number(rs.quantity);
        });

        // C. Cruzar datos y aplicar filtros (Cliente Asignado + Stock Bodega > 0)
        const enrichedResults = prods.map(p => ({
            ...p,
            warehouseStock: stockMap[p.id] || 0
        })).filter(prod => {
            // Validación 1: Debe tener stock físico en ESTA bodega (racks)
            if (prod.warehouseStock <= 0) return false;

            // Validación 2: Filtro de cliente asignado (si aplica)
            const assignedInfo = assignedMaterials.find(a => a.code === prod.code);
            if (!assignedInfo) return true;
            return assignedInfo.client_name === projectClient;
        });

        setSearchResults(enrichedResults);
    };

    // 3. Abrir Modal de Picking (SOLO RACKS VALIDADOS)
    const openPickModal = async (product) => {
        setPickingProduct(product);
        setPickQuantities({});

        // Buscar desglose físico de ubicaciones en la bodega seleccionada
        const { data: rackStock } = await supabase
            .from('product_locations')
            .select('*, locations(full_code)')
            .eq('product_id', product.id)
            .eq('warehouse_id', selectedWarehouse)
            .gt('quantity', 0);

        if (!rackStock || rackStock.length === 0) {
            toast.error("Error: Este producto no tiene stock físico disponible en los racks de esta bodega.");
            return;
        }

        // Convertimos a formato de opciones para el modal
        const options = rackStock.map(r => ({
            id: r.id,
            name: r.locations?.full_code || 'UBICACIÓN SIN NOMBRE',
            stock: r.quantity,
            isRack: true,
            locationId: r.location_id
        }));

        setPickingLocations(options);
        setShowPickModal(true);
    };

    // 4. Confirmar Agregado al Carrito
    const handleConfirmPick = () => {
        let totalPicked = 0;
        const newCartItems = [];

        pickingLocations.forEach(loc => {
            const qty = Number(pickQuantities[loc.id] || 0);
            if (qty > 0) {
                totalPicked += qty;
                newCartItems.push({
                    uid: Date.now() + Math.random(),
                    productId: pickingProduct.id,
                    code: pickingProduct.code,
                    name: pickingProduct.name,
                    locationName: loc.name,
                    quantity: qty,
                    sourceId: loc.id,
                    isRack: loc.isRack
                });
            }
        });

        if (totalPicked === 0) {
            toast.error("⚠️ Ingresa una cantidad válida para retirar.");
            return;
        }

        setCart([...cart, ...newCartItems]);
        setShowPickModal(false);
        setSearchResults(searchResults.filter(prod => prod.id !== pickingProduct.id));
    };

    // 5. Procesar Despacho (FUNCIÓN CORREGIDA)
    const handleDispatch = async () => {
        if (!selectedWarehouse) return toast.error("⚠️ Selecciona la Bodega de Origen.");
        if (!selectedProject) return toast.error("⚠️ Selecciona el Proyecto de Destino.");
        if (isSubcontract && !selectedProvider) return toast.error("⚠️ Selecciona el Subcontrato/Cuadrilla.");
        if (!receiver.name) return toast.error("⚠️ Falta el nombre del Receptor.");
        if (cart.length === 0) return toast.warning("⚠️ El carrito está vacío.");

        setIsProcessing(true);

        try {
            const folio = `SAL-${Date.now().toString().slice(-6)}`;

            const itemsToProcess = cart.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                isRack: item.isRack,
                sourceId: String(item.sourceId),
                name: item.name,
                code: item.code,
                locationName: item.locationName
            }));

            // --- CORRECCIÓN CRÍTICA AQUÍ ---
            // Usamos la función v2 y convertimos a String los campos de texto
            const { error: rpcError } = await supabase.rpc('dispatch_materials_v2', {
                p_warehouse_id: selectedWarehouse,
                p_project_id: String(selectedProject), // <-- IMPORTANTE: String
                p_document_number: folio,
                p_receiver_name: receiver.name,
                p_user_email: user?.email,
                p_items: itemsToProcess,
                p_receiver_rut: receiver.rut || '',
                p_receiver_stage: receiver.stage || '',
                p_is_subcontract: isSubcontract,
                p_provider_id: selectedProvider ? String(selectedProvider) : null // <-- IMPORTANTE: String
            });

            if (rpcError) throw rpcError;

            // Sincronizar stock maestro (global) tras despacho exitoso
            for (const item of cart) {
                const { data: productData } = await supabase
                    .from('products')
                    .select('current_stock')
                    .eq('id', item.productId)
                    .single();

                if (productData) {
                    const newStock = Math.max(0, productData.current_stock - item.quantity);
                    await supabase.from('products').update({ current_stock: newStock }).eq('id', item.productId);
                }
            }

            const whName = warehouses.find(w => w.id === selectedWarehouse)?.name;
            const prj = projects.find(p => p.id === Number(selectedProject));
            const providerName = isSubcontract ? providers.find(p => p.id === Number(selectedProvider))?.nombre : null;

            setLastDispatchData({
                id: folio, folio, warehouseName: whName,
                projectName: prj ? `${prj.proyecto} (${prj.cliente})` : 'Externo',
                stage: receiver.stage,
                receiverName: receiver.name, receiverRut: receiver.rut, receiverPlate: receiver.plate,
                items: cart,
                isSubcontract,
                providerName
            });

            setCart([]);
            setReceiver({ name: '', rut: '', plate: '', stage: '' });
            setPdfDownloaded(false);
            setIsSubcontract(false);
            setSelectedProvider('');
            toast.success(`✅ Despacho ${folio} completado con éxito.`);

        } catch (err) {
            console.error(err);
            toast.error(`❌ Error al procesar: ${err.message || "Fallo en la base de datos"}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handlePdfDownloaded = () => setPdfDownloaded(true);

    // Preview Data
    const selectedProj = projects.find(p => p.id === Number(selectedProject));
    const providerNamePreview = isSubcontract ? providers.find(p => p.id === Number(selectedProvider))?.nombre : null;

    const pdfPreviewData = {
        id: 'PREVIEW', folio: 'PREVIEW',
        warehouseName: warehouses.find(w => w.id === selectedWarehouse)?.name || '',
        projectName: selectedProj ? `${selectedProj.proyecto} (${selectedProj.cliente})` : 'Cargando...',
        stage: receiver.stage,
        receiverName: receiver.name, receiverRut: receiver.rut, receiverPlate: receiver.plate,
        items: cart,
        isSubcontract,
        providerName: providerNamePreview
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* PASO 1: SELECCIÓN DE CABECERA */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-sm">1</div>
                    <h3 className="font-bold text-slate-800">Origen y Destino</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Combobox
                        options={warehouses}
                        value={selectedWarehouse}
                        onChange={(val) => { setSelectedWarehouse(val); setSearchResults([]); setCart([]); }}
                        placeholder="-- Seleccionar Bodega Origen --"
                        label="Bodega de Origen"
                    />
                    <div>
                        <Combobox
                            options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))}
                            value={selectedProject}
                            onChange={setSelectedProject}
                            placeholder="-- Seleccionar Proyecto Destino --"
                            label="Proyecto / Cliente Destino"
                        />
                        {projectClient && <p className="text-xs text-indigo-600 mt-1 font-black">Cliente: {projectClient}</p>}
                    </div>
                </div>
            </div>

            {/* PASO 2: SUBCONTRATO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-sm">2</div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18} /> Asignación a Subcontrato</h3>
                    </div>

                    {/* SWITCH SUBCONTRATO */}
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-full border">
                        <span className={`text-xs font-bold ${!isSubcontract ? 'text-slate-600' : 'text-slate-400'}`}>Directo</span>
                        <div
                            onClick={() => { setIsSubcontract(!isSubcontract); setSelectedProvider(''); }}
                            className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all ${isSubcontract ? 'bg-indigo-600' : 'bg-slate-300'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isSubcontract ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                        <span className={`text-xs font-bold ${isSubcontract ? 'text-indigo-600' : 'text-slate-400'}`}>Subcontrato</span>
                    </div>
                </div>

                {isSubcontract && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 pt-2">
                        <label className="block text-xs font-bold text-indigo-600 uppercase mb-2">Seleccionar Cuadrilla / Empresa</label>
                        <Combobox
                            options={providers.map(p => ({ id: p.id, name: p.nombre, subtitle: p.rut }))}
                            value={selectedProvider}
                            onChange={setSelectedProvider}
                            placeholder="-- Buscar Contratista --"
                        />
                        <div className="mt-2 text-xs text-slate-400 flex items-center gap-1">
                            <AlertCircle size={12} /> El material se descontará del inventario y se cargará a la cuenta de este contratista.
                        </div>
                    </div>
                )}
            </div>

            {/* PASO 3: DATOS DEL RECEPTOR */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-sm">3</div>
                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><User size={18} /> Datos del Receptor</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input className="border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all" placeholder="Nombre Receptor" value={receiver.name} onChange={e => setReceiver({ ...receiver, name: e.target.value })} />
                    <input className="border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all" placeholder="RUT" value={receiver.rut} onChange={e => setReceiver({ ...receiver, rut: e.target.value })} />
                    <input className="border border-slate-200 p-3 rounded-xl focus:ring-2 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all" placeholder="Patente Vehículo" value={receiver.plate} onChange={e => setReceiver({ ...receiver, plate: e.target.value })} />
                    <input className="border border-amber-200 p-3 rounded-xl bg-amber-50 focus:ring-2 focus:ring-amber-100 focus:border-amber-400 outline-none transition-all" placeholder="Ubicación Destino (Etapa)" value={receiver.stage} onChange={e => setReceiver({ ...receiver, stage: e.target.value })} />
                </div>
            </div>

            {/* 4. BÚSQUEDA Y CARRITO */}
            {selectedWarehouse && selectedProject && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    <div className="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm border h-fit">
                        <div className="mb-6">
                            <GoogleSearchBar
                                placeholder="Buscar material por nombre o código..."
                                onSearch={(val) => handleSearch(val)}
                            />
                        </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                            {searchResults.length === 0 && <p className="text-center text-slate-400 py-10 text-sm italic">Usa el buscador para encontrar materiales en esta bodega...</p>}
                            {searchResults.map(prod => (
                                <div key={prod.id} onClick={() => openPickModal(prod)} className="p-3 border rounded-lg cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-all flex justify-between items-center group shadow-sm">
                                    <div className="flex-1">
                                        <div className="font-bold text-sm text-slate-700 group-hover:text-indigo-700 transition-colors uppercase">{prod.name}</div>
                                        <div className="text-[10px] font-mono text-slate-400">{prod.code}</div>
                                    </div>
                                    <div className="text-right ml-4">
                                        <span className="bg-indigo-100 text-indigo-700 text-lg px-3 py-1 rounded-lg font-black">{prod.warehouseStock}</span>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Disp. Bodega</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="lg:col-span-7 bg-slate-50 p-6 rounded-xl border flex flex-col min-h-[500px]">
                        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wider"><Truck size={18} /> Artículos para Salida</h3>

                        <div className="flex-1 bg-white rounded-xl border shadow-inner overflow-hidden mb-6">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 font-black text-[10px] text-slate-500 uppercase">
                                    <tr><th className="p-4">Material</th><th className="p-4">Origen Rack</th><th className="p-4 text-center">Cant.</th><th className="p-4"></th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {cart.map((item, i) => (
                                        <tr key={item.uid} className="hover:bg-slate-50">
                                            <td className="p-4"><div className="font-bold text-slate-800">{item.name}</div><div className="text-[10px] font-mono text-slate-400">{item.code}</div></td>
                                            <td className="p-4 text-xs font-bold text-indigo-600 uppercase">{item.locationName}</td>
                                            <td className="p-4 text-center"><span className="text-lg font-black">{item.quantity}</span></td>
                                            <td className="p-4 text-right">
                                                <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-300 hover:text-red-500 transition-colors"><X size={20} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {cart.length === 0 && <tr><td colSpan="4" className="py-20 text-center text-slate-400 italic">El carrito está vacío</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                            <div className="text-xs">
                                <span className="block text-slate-400 font-bold uppercase tracking-widest">Total Ítems</span>
                                <span className="text-2xl font-black text-slate-800">{cart.length}</span>
                            </div>
                            <div className="flex gap-4">
                                {cart.length > 0 && (
                                    <PDFDownloadLink document={<DispatchDocument data={pdfPreviewData} />} fileName={`PREVIEW_SALIDA.pdf`}>
                                        {({ loading }) => (
                                            <button onClick={handlePdfDownloaded} disabled={loading} className={`px-6 py-3 rounded-xl font-bold border transition-all flex items-center gap-2 ${pdfDownloaded ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-white text-indigo-600 border-indigo-600 hover:bg-indigo-50'}`}>
                                                <FileText size={18} /> {pdfDownloaded ? 'Documento Listo ✓' : 'Generar Guía PDF'}
                                            </button>
                                        )}
                                    </PDFDownloadLink>
                                )}
                                <button
                                    onClick={handleDispatch}
                                    disabled={isProcessing || cart.length === 0 || !pdfDownloaded || !receiver.name || (isSubcontract && !selectedProvider)}
                                    className={`px-8 py-3 rounded-xl font-black shadow-lg flex items-center gap-2 transition-all ${(isProcessing || cart.length === 0 || !pdfDownloaded || !receiver.name || (isSubcontract && !selectedProvider)) ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95'}`}
                                >
                                    {isProcessing ? <Loader className="animate-spin" /> : <><CheckCircle size={18} /> Confirmar Despacho</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. MODAL PICKING */}
            {showPickModal && pickingProduct && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight"><Package className="text-indigo-600" /> Distribución de Retiro</h3>
                                <p className="text-sm font-medium text-slate-500">{pickingProduct.name} | Código: <span className="font-mono text-indigo-600">{pickingProduct.code}</span></p>
                            </div>
                            <button onClick={() => setShowPickModal(false)} className="bg-white p-2 rounded-full border hover:bg-red-50 hover:text-red-500 transition-all"><X size={20} /></button>
                        </div>

                        <div className="p-2 max-h-[55vh] overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black sticky top-0 z-10">
                                    <tr><th className="p-4">Ubicación Rack</th><th className="p-4 text-center">Disponible</th><th className="p-4 text-center">Cantidad a Retirar</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {pickingLocations.map(loc => (
                                        <tr key={loc.id} className="hover:bg-indigo-50/30 transition-colors">
                                            <td className="p-4">
                                                <div className="font-black text-lg text-slate-800">{loc.name}</div>
                                                <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Estantería Validada</div>
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="text-2xl font-black text-slate-400">{loc.stock}</div>
                                                <div className="text-[10px] font-bold uppercase">Unidades</div>
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    min="0" max={loc.stock}
                                                    className="w-full border-2 border-slate-200 rounded-xl p-3 text-center font-black text-xl focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                                                    placeholder="0"
                                                    value={pickQuantities[loc.id] || ''}
                                                    onChange={(e) => {
                                                        const val = Math.min(Number(e.target.value), loc.stock);
                                                        setPickQuantities({ ...pickQuantities, [loc.id]: val });
                                                    }}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-6 border-t bg-slate-50 flex justify-between items-center">
                            <div className="bg-white px-6 py-3 rounded-xl border">
                                <span className="text-xs font-bold text-slate-400 uppercase block tracking-widest">Total Selección</span>
                                <span className="font-black text-3xl text-indigo-600">
                                    {Object.values(pickQuantities).reduce((a, b) => a + Number(b), 0)} <span className="text-sm">UN</span>
                                </span>
                            </div>
                            <button onClick={handleConfirmPick} className="bg-indigo-600 text-white px-10 py-4 rounded-xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center gap-3 active:scale-95">
                                <Plus size={20} /> Agregar Artículos
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}