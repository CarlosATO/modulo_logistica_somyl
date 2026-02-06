import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement, getProveedores } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import {
    Search, ArrowRight, Truck, User, FileText,
    MapPin, Package, X, CheckCircle, Loader, Briefcase, Plus, AlertCircle, Users, Building2, Upload
} from 'lucide-react';
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
const DispatchDocument = ({ data }) => {
    // Validación defensiva
    const items = data?.items || [];

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>
                            {data?.isExternal ? 'GUÍA DE TRANSFERENCIA EXTERNA' : 'GUÍA DE DESPACHO'}
                        </Text>
                        <Text style={styles.subtitle}>Folio: {data?.folio || 'N/A'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={styles.subtitle}>{new Date().toLocaleDateString()}</Text></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.section, { flex: 1 }]}><Text style={styles.label}>Origen</Text><Text style={styles.value}>{data?.warehouseName || 'N/A'}</Text></View>
                    <View style={[styles.section, { flex: 1 }]}>
                        <Text style={styles.label}>{data?.isExternal ? 'Destino Externo' : 'Destino / Proyecto'}</Text>
                        <Text style={styles.value}>{data?.projectName || 'N/A'}</Text>
                        {data?.isExternal && data?.externalCompany && (
                            <>
                                <Text style={{ fontSize: 9, marginTop: 2 }}>RUT: {data.externalCompany.rut}</Text>
                                <Text style={{ fontSize: 9, marginTop: 4, color: '#7c3aed', fontWeight: 'bold' }}>
                                    MOTIVO: {data.externalCompany.reason || 'Transferencia externa'}
                                </Text>
                            </>
                        )}
                        {!data?.isExternal && <Text style={{ fontSize: 9, marginTop: 2 }}>{data?.stage || ''}</Text>}
                        {data?.isSubcontract && (
                            <Text style={{ fontSize: 9, marginTop: 4, color: '#4f46e5', fontWeight: 'bold' }}>
                                ENTREGADO A: {data?.providerName || 'CONTRATISTA'}
                            </Text>
                        )}
                    </View>
                </View>
                <View style={styles.section}><Text style={styles.label}>Receptor (Firma)</Text><Text style={styles.value}>{data?.receiverName || 'N/A'} | RUT: {data?.receiverRut || 'N/A'}</Text></View>
                <View style={styles.table}>
                    <View style={styles.tableHeader}><Text style={styles.col1}>COD</Text><Text style={styles.col2}>DESC</Text><Text style={styles.col3}>UBICACIÓN</Text><Text style={styles.col4}>CANT</Text></View>
                    {items.map((item, i) => (
                        <View key={i} style={styles.tableRow}><Text style={styles.col1}>{item.code}</Text><Text style={styles.col2}>{item.name}</Text><Text style={styles.col3}>{item.locationName}</Text><Text style={styles.col4}>{item.quantity}</Text></View>
                    ))}
                </View>
                <Text style={styles.footer}>
                    Sistema Somyl - {data?.id || 'N/A'} - {data?.isExternal ? 'Transferencia Externa' : (data?.isSubcontract ? 'Cargo a Subcontrato' : 'Consumo Interno')}
                </Text>
            </Page>
        </Document>
    );
};

export default function OutboundDispatchForm({ onClose, onSuccess }) {
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

    // Dispatch Mode: 'DIRECT' | 'SUBCONTRACT' | 'EXTERNAL'
    const [dispatchMode, setDispatchMode] = useState('DIRECT');
    const [selectedProvider, setSelectedProvider] = useState('');
    const [externalCompany, setExternalCompany] = useState({ name: '', rut: '', reason: '' });

    // Estados para Subida de Guía Firmada
    const [dispatchSuccess, setDispatchSuccess] = useState(false);
    const [lastDispatchFolio, setLastDispatchFolio] = useState('');
    const [signedFile, setSignedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Estados PDF
    const [pdfPreviewData, setPdfPreviewData] = useState(null);

    // Picking
    const [searchResults, setSearchResults] = useState([]);
    const [cart, setCart] = useState([]);

    // MODAL DE PICKING
    const [showPickModal, setShowPickModal] = useState(false);
    const [pickingProduct, setPickingProduct] = useState(null);
    const [pickingLocations, setPickingLocations] = useState([]);
    const [pickQuantities, setPickQuantities] = useState({});

    // Estado PDF
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

    // Cargar automáticamente materiales disponibles cuando se selecciona bodega
    useEffect(() => {
        const loadAvailableMaterials = async () => {
            if (!selectedWarehouse) return;
            if (dispatchMode !== 'EXTERNAL' && !selectedProject) return;

            try {
                const { data: rackStock } = await supabase
                    .from('product_locations')
                    .select('product_id, quantity')
                    .eq('warehouse_id', selectedWarehouse)
                    .gt('quantity', 0)
                    .limit(2000);

                if (!rackStock || rackStock.length === 0) {
                    setSearchResults([]);
                    return;
                }

                const productIds = [...new Set(rackStock.map(r => r.product_id))];
                const { data: prods } = await supabase
                    .from('products')
                    .select('*')
                    .in('id', productIds)
                    .order('name', { ascending: true });

                const stockMap = {};
                rackStock.forEach(rs => {
                    stockMap[rs.product_id] = (stockMap[rs.product_id] || 0) + Number(rs.quantity);
                });

                let enriched = (prods || []).map(p => ({ ...p, warehouseStock: stockMap[p.id] || 0 }))
                    .filter(prod => prod.warehouseStock > 0);

                if (dispatchMode !== 'EXTERNAL' && projectClient) {
                    enriched = enriched.filter(prod => {
                        const assignedInfo = assignedMaterials.find(a => a.code === prod.code);
                        if (!assignedInfo) return true;
                        return assignedInfo.client_name === projectClient;
                    });
                }

                setSearchResults(enriched);
            } catch (err) {
                console.error('Error cargando materiales disponibles:', err);
                setSearchResults([]);
            }
        };

        loadAvailableMaterials();
    }, [selectedWarehouse, selectedProject, projectClient, assignedMaterials, dispatchMode]);

    useEffect(() => {
        if (cart.length === 0) setPdfDownloaded(false);
    }, [cart]);

    // 2. Buscar Producto
    const handleSearch = async (term) => {
        if (!term || term.trim().length === 0) {
            setSearchResults([]);
            return;
        }

        if (!selectedWarehouse) return toast.error("⚠️ Primero selecciona una bodega.");

        const { data: prods } = await supabase
            .from('products')
            .select('*')
            .ilike('name', `%${term}%`)
            .limit(20);

        if (!prods || prods.length === 0) {
            setSearchResults([]);
            return;
        }

        const { data: rackStock } = await supabase
            .from('product_locations')
            .select('product_id, quantity')
            .eq('warehouse_id', selectedWarehouse)
            .in('product_id', prods.map(p => p.id));

        const stockMap = {};
        rackStock?.forEach(rs => {
            stockMap[rs.product_id] = (stockMap[rs.product_id] || 0) + Number(rs.quantity);
        });

        const enrichedResults = prods.map(p => ({
            ...p,
            warehouseStock: stockMap[p.id] || 0
        })).filter(prod => {
            if (prod.warehouseStock <= 0) return false;
            const assignedInfo = assignedMaterials.find(a => a.code === prod.code);
            if (!assignedInfo) return true;
            return assignedInfo.client_name === projectClient;
        });

        setSearchResults(enrichedResults);
    };

    const openPickModal = async (product) => {
        setPickingProduct(product);
        setPickQuantities({});

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

    const handleDispatch = async () => {
        if (!selectedWarehouse) return toast.error("⚠️ Selecciona la Bodega de Origen.");
        if (!selectedProject && dispatchMode !== 'EXTERNAL') return toast.error("⚠️ Selecciona el Proyecto de Destino.");
        if (dispatchMode === 'SUBCONTRACT' && !selectedProvider) return toast.error("⚠️ Selecciona el Subcontrato/Cuadrilla.");
        if (dispatchMode === 'EXTERNAL' && !externalCompany.name) return toast.error("⚠️ Ingresa la Razón Social del tercero.");
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

            let finalReceiverName = receiver.name;
            let finalReceiverRut = receiver.rut || '';
            let finalReceiverStage = receiver.stage || '';
            let finalProjectId = selectedProject ? Number(selectedProject) : null;

            if (dispatchMode === 'EXTERNAL') {
                finalReceiverName = externalCompany.name;
                finalReceiverRut = externalCompany.rut;
                finalReceiverStage = `EXTERNO: ${externalCompany.reason}`;
            }

            const { error: rpcError } = await supabase.rpc('dispatch_materials', {
                p_warehouse_id: selectedWarehouse,
                p_project_id: finalProjectId,
                p_document_number: folio,
                p_receiver_name: finalReceiverName,
                p_user_email: user?.email,
                p_items: itemsToProcess,
                p_receiver_rut: finalReceiverRut,
                p_receiver_stage: finalReceiverStage,
                p_is_subcontract: dispatchMode === 'SUBCONTRACT',
                p_provider_id: selectedProvider ? Number(selectedProvider) : null
            });

            if (rpcError) throw rpcError;

            // Sincronizar stock y luego actualizar UI
            for (const item of cart) {
                const { data: productData } = await supabase
                    .from('products').select('current_stock').eq('id', item.productId).single();
                if (productData) {
                    const newStock = Math.max(0, productData.current_stock - item.quantity);
                    await supabase.from('products').update({ current_stock: newStock }).eq('id', item.productId);
                }
            }

            setLastDispatchFolio(folio);
            setDispatchSuccess(true);
            setPdfDownloaded(false);
            toast.success("✅ Despacho registrado correctamente.");
            if (onSuccess) onSuccess(); // Notificar al padre para recargar historial

        } catch (error) {
            console.error(error);
            toast.error("Error al procesar el despacho: " + error.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUploadSignedGuide = async () => {
        if (!signedFile) return toast.error("Selecciona un archivo PDF o Imagen.");
        setIsUploading(true);
        try {
            const fileName = `dispatch_signed/${lastDispatchFolio}_${Date.now()}.${signedFile.name.split('.').pop()}`;
            const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, signedFile);
            if (uploadError) throw uploadError;

            const { error: updateError } = await supabase
                .from('movements')
                .update({ reception_document_url: fileName })
                .eq('document_number', lastDispatchFolio);

            if (updateError) throw updateError;
            toast.success("✅ Documento subido correctamente.");
            if (onSuccess) onSuccess(); // Recargar historial otra vez por si acaso
            onClose(); // Cerrar modal al finalizar

        } catch (error) {
            console.error(error);
            toast.error("Error al subir documento: " + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handlePdfDownloaded = () => setPdfDownloaded(true);
    const selectedProj = projects.find(p => p.id === Number(selectedProject));
    const providerNamePreview = dispatchMode === 'SUBCONTRACT' ? providers.find(p => p.id === Number(selectedProvider))?.nombre : null;

    const previewData = pdfPreviewData || {
        id: 'PREVIEW', folio: 'PREVIEW',
        warehouseName: warehouses.find(w => w.id === selectedWarehouse)?.name || '',
        projectName: dispatchMode === 'EXTERNAL' ? externalCompany.name || 'Tercero Externo' : (selectedProj ? `${selectedProj.proyecto} (${selectedProj.cliente})` : 'Cargando...'),
        stage: receiver.stage,
        receiverName: receiver.name, receiverRut: receiver.rut, receiverPlate: receiver.plate,
        items: cart,
        dispatchMode,
        isSubcontract: dispatchMode === 'SUBCONTRACT',
        isExternal: dispatchMode === 'EXTERNAL',
        providerName: providerNamePreview,
        externalCompany: dispatchMode === 'EXTERNAL' ? externalCompany : null
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-hidden">
                {/* Header Modal */}
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRight className="text-orange-600" /> Nuevo Despacho de Bodega
                        </h2>
                        <p className="text-xs text-slate-500">Salida de materiales a obra, subcontrato o terceros</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {dispatchSuccess ? (
                        <div className="bg-white p-8 rounded-2xl border border-dashed border-emerald-300 text-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                                <CheckCircle size={32} />
                            </div>
                            <h2 className="text-xl font-black text-slate-800 mb-2">¡Despacho {lastDispatchFolio} Exitoso!</h2>

                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 mb-4 text-left max-w-xl mx-auto">
                                <h3 className="font-bold text-indigo-900 mb-2 flex items-center gap-2"><Upload size={18} /> Subir Guía Firmada</h3>
                                <input type="file" accept=".pdf,image/*" className="w-full text-sm mb-4" onChange={e => setSignedFile(e.target.files[0])} />
                                <button onClick={handleUploadSignedGuide} disabled={!signedFile || isUploading} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50">
                                    {isUploading ? <Loader className="animate-spin mx-auto" /> : 'Subir y Finalizar'}
                                </button>
                            </div>
                            <button onClick={onClose} className="text-slate-400 font-bold underline hover:text-slate-600">Cerrar sin subir</button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs">1</div><h3 className="font-bold text-slate-800 text-sm">Origen y Destino</h3></div>
                                    <Combobox options={warehouses} value={selectedWarehouse} onChange={v => { setSelectedWarehouse(v); setSearchResults([]); setCart([]); }} placeholder="-- Bodega Origen --" className="mb-3" />
                                    <Combobox options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))} value={selectedProject} onChange={setSelectedProject} placeholder="-- Proyecto Destino --" />
                                </div>

                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-xs">2</div><h3 className="font-bold text-slate-800 text-sm">Tipo y Receptor</h3></div>
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        <button onClick={() => setDispatchMode('DIRECT')} className={`p-2 rounded border text-xs font-bold ${dispatchMode === 'DIRECT' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-slate-50'}`}>Directo</button>
                                        <button onClick={() => setDispatchMode('SUBCONTRACT')} className={`p-2 rounded border text-xs font-bold ${dispatchMode === 'SUBCONTRACT' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-slate-50'}`}>Subcontrato</button>
                                        <button onClick={() => setDispatchMode('EXTERNAL')} className={`p-2 rounded border text-xs font-bold ${dispatchMode === 'EXTERNAL' ? 'bg-purple-50 border-purple-500 text-purple-700' : 'bg-slate-50'}`}>Externo</button>
                                    </div>
                                    <input className="w-full border p-2 rounded mb-2 text-sm" placeholder="Nombre Receptor *" value={receiver.name} onChange={e => setReceiver({ ...receiver, name: e.target.value })} />
                                    {dispatchMode === 'SUBCONTRACT' && <Combobox options={providers.map(p => ({ id: p.id, name: p.nombre }))} value={selectedProvider} onChange={setSelectedProvider} placeholder="-- Subcontratista --" className="mb-2" />}
                                    {dispatchMode === 'EXTERNAL' && <input className="w-full border p-2 rounded mb-2 text-sm" placeholder="Empresa Externa *" value={externalCompany.name} onChange={e => setExternalCompany({ ...externalCompany, name: e.target.value })} />}
                                </div>
                            </div>

                            {(selectedWarehouse && (selectedProject || dispatchMode === 'EXTERNAL')) && (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[400px]">
                                    <div className="md:col-span-4 flex flex-col bg-white p-4 rounded-xl border border-slate-200">
                                        <h3 className="font-bold text-sm mb-3">Buscar Productos</h3>
                                        <Combobox
                                            options={searchResults.map(p => ({ id: p.id, name: `${p.name} | Stock: ${p.warehouseStock}` }))}
                                            value={null}
                                            onChange={val => { const p = searchResults.find(x => String(x.id) === String(val)); if (p) openPickModal(p); }}
                                            placeholder="Escribe para buscar..."
                                        />
                                    </div>
                                    <div className="md:col-span-8 flex flex-col bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <h3 className="font-bold text-sm mb-3">Carrito de Salida ({cart.length})</h3>
                                        <div className="flex-1 overflow-y-auto bg-white rounded border mb-4">
                                            {cart.map((item, i) => (
                                                <div key={i} className="flex justify-between p-2 border-b text-sm">
                                                    <div><span className="font-bold">{item.name}</span> <span className="text-xs text-slate-400">({item.locationName})</span></div>
                                                    <div className="flex gap-4">
                                                        <span className="font-bold">{item.quantity}</span>
                                                        <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-400"><X size={16} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex justify-end gap-3">
                                            {cart.length > 0 && (
                                                <PDFDownloadLink document={<DispatchDocument data={previewData} />} fileName={`PREVIEW_SALIDA.pdf`}>
                                                    {({ loading }) => (
                                                        <button onClick={handlePdfDownloaded} disabled={loading} className={`px-4 py-2 rounded-lg font-bold border text-xs ${pdfDownloaded ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-indigo-600'}`}>
                                                            {pdfDownloaded ? 'PDF Listo' : 'Generar PDF'}
                                                        </button>
                                                    )}
                                                </PDFDownloadLink>
                                            )}
                                            <button onClick={handleDispatch} disabled={isProcessing || !pdfDownloaded} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50">
                                                {isProcessing ? <Loader className="animate-spin" /> : 'Confirmar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Modal Picking Interno */}
            {showPickModal && pickingProduct && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <h3 className="font-bold text-slate-800 mb-4">Retirar: {pickingProduct.name}</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                            {pickingLocations.map(loc => (
                                <div key={loc.id} className="flex justify-between items-center p-2 bg-slate-50 rounded border">
                                    <span className="text-xs font-bold">{loc.name} (Max: {loc.stock})</span>
                                    <input type="number" className="w-20 p-1 border rounded text-right" max={loc.stock} placeholder="0"
                                        onChange={e => setPickQuantities({ ...pickQuantities, [loc.id]: e.target.value })}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setShowPickModal(false)} className="px-4 py-2 text-slate-500">Cancelar</button>
                            <button onClick={handleConfirmPick} className="bg-indigo-600 text-white px-4 py-2 rounded font-bold">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
