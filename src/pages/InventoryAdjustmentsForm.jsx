import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import Combobox from '../components/Combobox';
import { toast } from 'sonner';
import {
    AlertTriangle, CheckCircle, Camera, Package, Warehouse,
    ArrowUpCircle, ArrowDownCircle, Loader, MapPin, FileText, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryAdjustmentsForm({ onClose, onSuccess }) {
    const { user } = useAuth();

    // --- Estados Maestros ---
    const [warehouses, setWarehouses] = useState([]);
    const [projects, setProjects] = useState([]);
    const [locations, setLocations] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [stockProducts, setStockProducts] = useState([]);

    // --- Estados de Formulario ---
    const [adjustmentType, setAdjustmentType] = useState('DECREASE');
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedProduct, setSelectedProduct] = useState('');
    const [selectedProductData, setSelectedProductData] = useState(null);
    const [targetLocation, setTargetLocation] = useState('');

    // --- Estados Específicos de Ajuste ---
    const [reason, setReason] = useState('');
    const [quantity, setQuantity] = useState('');
    const [comments, setComments] = useState('');
    const [evidenceFile, setEvidenceFile] = useState(null);

    // --- UI ---
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Cargar Maestros Iniciales
    useEffect(() => {
        const fetchMasters = async () => {
            const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
            setWarehouses(wh || []);

            const { data: prj } = await supabaseProcurement.from('proyectos').select('id, proyecto, cliente').eq('activo', true);
            setProjects(prj || []);

            const { data: prods } = await supabase.from('products').select('id, name, code, unit').order('name');
            setAllProducts(prods || []);
        };
        fetchMasters();
    }, []);

    // Cargar Ubicaciones y Stock
    useEffect(() => {
        if (!selectedWarehouse) {
            setLocations([]);
            setStockProducts([]);
            setSelectedProduct('');
            setSelectedProductData(null);
            return;
        }

        const fetchWarehouseData = async () => {
            setLoading(true);
            const { data: locs } = await supabase
                .from('locations')
                .select('*')
                .eq('warehouse_id', selectedWarehouse)
                .order('full_code');
            setLocations(locs || []);

            const { data: stock } = await supabase
                .from('product_locations')
                .select('id, product_id, location_id, quantity, products(id, name, code, unit), locations(full_code)')
                .eq('warehouse_id', selectedWarehouse)
                .gt('quantity', 0)
                .order('products(name)');

            if (stock) {
                const options = stock.map(item => ({
                    id: `${item.product_id}-${item.location_id}`,
                    name: `${item.products.name} (${item.locations.full_code}) - ${item.quantity} ${item.products.unit || 'UN'}`,
                    productId: item.product_id,
                    productName: item.products.name,
                    productCode: item.products.code,
                    locationId: item.location_id,
                    locationName: item.locations.full_code,
                    quantity: item.quantity,
                    unit: item.products.unit
                }));
                setStockProducts(options);
            }
            setLoading(false);
        };
        fetchWarehouseData();
    }, [selectedWarehouse]);

    useEffect(() => {
        setSelectedProduct('');
        setSelectedProductData(null);
        setTargetLocation('');
        setQuantity('');
    }, [adjustmentType]);

    const handleProductSelect = (value) => {
        setSelectedProduct(value);
        if (adjustmentType === 'DECREASE') {
            const opt = stockProducts.find(p => String(p.id) === String(value));
            if (opt) {
                setSelectedProductData({
                    id: opt.productId,
                    name: opt.productName,
                    code: opt.productCode,
                    maxQty: opt.quantity,
                    unit: opt.unit
                });
                setTargetLocation(opt.locationId);
            }
        } else {
            const prod = allProducts.find(p => String(p.id) === String(value));
            if (prod) {
                setSelectedProductData({
                    id: prod.id,
                    name: prod.name,
                    code: prod.code,
                    unit: prod.unit
                });
            }
        }
    };

    const handleSubmit = async () => {
        if (!selectedWarehouse || !selectedProject || !selectedProduct || !quantity || !reason || !targetLocation) {
            return toast.error("⚠️ Faltan campos obligatorios.");
        }

        if (adjustmentType === 'DECREASE') {
            if (Number(quantity) > selectedProductData?.maxQty) {
                return toast.error(`⚠️ No puedes descontar más de ${selectedProductData.maxQty} unidades.`);
            }
            if (!evidenceFile && !confirm("⚠️ ¿Registrar pérdida sin foto de evidencia?")) return;
        }

        setProcessing(true);
        try {
            let evidenceUrl = null;
            if (evidenceFile) {
                const fileName = `ADJ-${Date.now()}.${evidenceFile.name.split('.').pop()}`;
                await supabase.storage.from('documents').upload(fileName, evidenceFile);
                evidenceUrl = fileName;
            }

            const { error } = await supabase.rpc('process_inventory_adjustment', {
                p_warehouse_id: selectedWarehouse,
                p_product_id: selectedProductData.id,
                p_qty: Number(quantity),
                p_type: adjustmentType,
                p_reason: reason,
                p_location_id: targetLocation,
                p_comments: comments || '',
                p_user_email: user?.email,
                p_project_id: String(selectedProject),
                p_evidence_url: evidenceUrl
            });

            if (error) throw error;

            toast.success("✅ Ajuste procesado correctamente.");
            if (onSuccess) onSuccess();

        } catch (err) {
            console.error(err);
            toast.error(`Error: ${err.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const isStep1Complete = selectedWarehouse && selectedProject;
    const isStep2Complete = selectedProduct && selectedProductData;
    const accentColor = adjustmentType === 'DECREASE' ? 'red' : 'emerald';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden relative">

                {/* Header Modal */}
                <div className="flex justify-between items-center p-6 border-b bg-slate-50">
                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                        {adjustmentType === 'DECREASE' ? <ArrowDownCircle className="text-red-500" /> : <ArrowUpCircle className="text-emerald-500" />}
                        Nuevo Ajuste de Inventario
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={24} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">

                    {/* TYPE SELECTOR */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setAdjustmentType('DECREASE')}
                            className={`p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all ${adjustmentType === 'DECREASE'
                                ? 'bg-red-50 text-red-700 border-red-500'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                }`}
                        >
                            <ArrowDownCircle size={24} />
                            <div className="text-left leading-tight">
                                <span className="font-bold block">Pérdida / Merma</span>
                                <span className="text-[10px] uppercase font-bold opacity-75">Descontar Stock</span>
                            </div>
                        </button>
                        <button
                            onClick={() => setAdjustmentType('INCREASE')}
                            className={`p-4 rounded-xl border-2 flex items-center justify-center gap-3 transition-all ${adjustmentType === 'INCREASE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-500'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                                }`}
                        >
                            <ArrowUpCircle size={24} />
                            <div className="text-left leading-tight">
                                <span className="font-bold block">Hallazgo / Sobrante</span>
                                <span className="text-[10px] uppercase font-bold opacity-75">Sumar Stock</span>
                            </div>
                        </button>
                    </div>

                    {/* STEPS CARD */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">

                        {/* 1. CONTEXT */}
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded text-xs">1</span>
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Ubicación y Proyecto</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bodega</label>
                                    <Combobox options={warehouses} value={selectedWarehouse} onChange={setSelectedWarehouse} placeholder="Seleccionar Bodega" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Proyecto</label>
                                    <Combobox options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))} value={selectedProject} onChange={setSelectedProject} placeholder="Seleccionar Proyecto" />
                                </div>
                            </div>
                        </div>

                        {/* 2. PRODUCT */}
                        <div className={`transition-all ${!isStep1Complete ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded text-xs">2</span>
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Producto</h3>
                            </div>
                            <Combobox
                                options={adjustmentType === 'DECREASE' ? stockProducts : allProducts.map(p => ({ id: p.id, name: `${p.name} (${p.code})` }))}
                                value={selectedProduct}
                                onChange={handleProductSelect}
                                placeholder={adjustmentType === 'DECREASE' ? "Buscar producto con stock..." : "Buscar producto en catálogo..."}
                            />
                            {selectedProductData && (
                                <div className={`mt-3 p-3 rounded-lg border flex justify-between items-center ${adjustmentType === 'DECREASE' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
                                    <div>
                                        <p className="font-bold text-sm">{selectedProductData.name}</p>
                                        <p className="text-xs font-mono opacity-75">{selectedProductData.code}</p>
                                        {adjustmentType === 'DECREASE' && <p className="text-xs font-bold mt-1">Stock Máx: {selectedProductData.maxQty}</p>}
                                    </div>
                                    <button onClick={() => { setSelectedProduct(''); setSelectedProductData(null); }} className="p-1 hover:bg-black/10 rounded"><X size={16} /></button>
                                </div>
                            )}
                        </div>

                        {/* 3. DETAILS */}
                        <div className={`transition-all ${(!isStep1Complete || !isStep2Complete) ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="bg-slate-100 text-slate-600 font-bold w-6 h-6 flex items-center justify-center rounded text-xs">3</span>
                                <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Detalle y Confirmación</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {adjustmentType === 'INCREASE' && (
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Destino Físico</label>
                                        <Combobox options={locations.map(l => ({ id: l.id, name: l.full_code }))} value={targetLocation} onChange={setTargetLocation} placeholder="Seleccionar Rack/Ubicación" />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Motivo</label>
                                    <select className="w-full border p-2 rounded-lg bg-slate-50 text-sm" value={reason} onChange={e => setReason(e.target.value)}>
                                        <option value="">-- Seleccionar --</option>
                                        {adjustmentType === 'DECREASE' ? (
                                            <>
                                                <option value="Merma / Daño">Merma / Daño</option>
                                                <option value="Robo / Pérdida">Robo / Pérdida</option>
                                                <option value="Vencimiento">Vencimiento</option>
                                                <option value="Error Inventario">Error de Conteo (Falta)</option>
                                                <option value="Consumo Interno">Consumo Interno</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Hallazgo">Hallazgo Físico</option>
                                                <option value="Devolución Sin Papel">Devolución Obra (Sin Doc)</option>
                                                <option value="Error Inventario">Error de Conteo (Sobra)</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cantidad</label>
                                    <input type="number" className="w-full border p-2 rounded-lg text-sm font-bold" placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Evidencia (Foto)</label>
                                    <label className="flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:bg-slate-50 transition-colors">
                                        <Camera size={20} className="text-slate-400" />
                                        <span className="text-xs text-slate-500 font-bold">{evidenceFile ? evidenceFile.name : "Subir Foto"}</span>
                                        <input type="file" className="hidden" accept="image/*" onChange={e => setEvidenceFile(e.target.files[0])} />
                                    </label>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="p-6 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button
                        onClick={handleSubmit}
                        disabled={processing || !reason || !quantity || (adjustmentType === 'INCREASE' && !targetLocation)}
                        className={`px-8 py-3 rounded-xl font-bold text-white shadow-lg flex items-center gap-2 ${adjustmentType === 'DECREASE' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                        {processing ? <Loader className="animate-spin" /> : <CheckCircle size={20} />}
                        Confirmar Ajuste
                    </button>
                </div>
            </div>
        </div>
    );
}
