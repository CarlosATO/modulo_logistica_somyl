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

export default function InventoryAdjustments() {
    const { user } = useAuth();

    // --- Estados Maestros ---
    const [warehouses, setWarehouses] = useState([]);
    const [projects, setProjects] = useState([]);
    const [locations, setLocations] = useState([]);
    const [allProducts, setAllProducts] = useState([]); // Para INCREASE (catálogo)
    const [stockProducts, setStockProducts] = useState([]); // Para DECREASE (con stock)

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

            // Cargar todos los productos para INCREASE
            const { data: prods } = await supabase.from('products').select('id, name, code, unit').order('name');
            setAllProducts(prods || []);
        };
        fetchMasters();
    }, []);

    // Cargar Ubicaciones y Stock al cambiar Bodega
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
            // Ubicaciones
            const { data: locs } = await supabase
                .from('locations')
                .select('*')
                .eq('warehouse_id', selectedWarehouse)
                .order('full_code');
            setLocations(locs || []);

            // Productos con stock en esta bodega (para DECREASE)
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

    // Cuando cambia el tipo de ajuste, limpiar selección
    useEffect(() => {
        setSelectedProduct('');
        setSelectedProductData(null);
        setTargetLocation('');
        setQuantity('');
    }, [adjustmentType]);

    // Cuando se selecciona un producto (DECREASE - tiene ubicación incluida)
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
            // INCREASE - buscar en catálogo completo
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
            if (!evidenceFile) {
                if (!confirm("⚠️ ¿Registrar pérdida sin foto de evidencia?")) return;
            }
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

            // Reset Form
            setQuantity('');
            setReason('');
            setComments('');
            setEvidenceFile(null);
            setSelectedProduct('');
            setSelectedProductData(null);
            setTargetLocation('');

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
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* HEADER TIPO SELECTOR */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-2">
                    <button
                        onClick={() => setAdjustmentType('DECREASE')}
                        className={`p-5 flex items-center justify-center gap-3 transition-all ${adjustmentType === 'DECREASE'
                            ? 'bg-red-50 text-red-600 border-b-4 border-red-500'
                            : 'text-slate-400 hover:bg-slate-50'
                            }`}
                    >
                        <ArrowDownCircle size={28} />
                        <div className="text-left">
                            <span className="font-bold block">Pérdida / Merma</span>
                            <span className="text-xs opacity-75">Descontar del inventario</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setAdjustmentType('INCREASE')}
                        className={`p-5 flex items-center justify-center gap-3 transition-all ${adjustmentType === 'INCREASE'
                            ? 'bg-emerald-50 text-emerald-600 border-b-4 border-emerald-500'
                            : 'text-slate-400 hover:bg-slate-50'
                            }`}
                    >
                        <ArrowUpCircle size={28} />
                        <div className="text-left">
                            <span className="font-bold block">Hallazgo / Sobrante</span>
                            <span className="text-xs opacity-75">Sumar al inventario</span>
                        </div>
                    </button>
                </div>
            </div>

            {/* PASO 1: CONTEXTO */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 ${isStep1Complete ? `bg-${accentColor}-500 text-white` : `bg-${accentColor}-100 text-${accentColor}-600`} rounded-lg flex items-center justify-center font-bold text-sm transition-all`}>
                        {isStep1Complete ? <CheckCircle size={18} /> : '1'}
                    </div>
                    <h3 className="font-bold text-slate-800">Contexto del Ajuste</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                            <Warehouse size={14} className="inline mr-1" /> Bodega Afectada
                        </label>
                        <Combobox
                            options={warehouses}
                            value={selectedWarehouse}
                            onChange={setSelectedWarehouse}
                            placeholder="-- Seleccionar Bodega --"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                            <FileText size={14} className="inline mr-1" /> Proyecto (Dueño del Stock)
                        </label>
                        <Combobox
                            options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))}
                            value={selectedProject}
                            onChange={setSelectedProject}
                            placeholder="-- Seleccionar Proyecto --"
                        />
                    </div>
                </div>
            </div>

            {/* PASO 2: PRODUCTO */}
            <div className={`bg-white p-6 rounded-2xl shadow-sm border transition-all ${!isStep1Complete ? 'opacity-50 pointer-events-none' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 ${isStep2Complete ? `bg-${accentColor}-500 text-white` : isStep1Complete ? `bg-${accentColor}-100 text-${accentColor}-600` : 'bg-slate-100 text-slate-400'} rounded-lg flex items-center justify-center font-bold text-sm transition-all`}>
                        {isStep2Complete ? <CheckCircle size={18} /> : '2'}
                    </div>
                    <h3 className="font-bold text-slate-800">Producto a Ajustar</h3>
                    {!isStep1Complete && (
                        <span className="text-xs text-slate-400 ml-2">← Completa el paso anterior</span>
                    )}
                </div>

                {loading ? (
                    <div className="text-center py-8 text-slate-400">
                        <Loader className="animate-spin mx-auto mb-2" size={32} />
                        <p>Cargando productos...</p>
                    </div>
                ) : (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                            <Package size={14} className="inline mr-1" />
                            {adjustmentType === 'DECREASE'
                                ? 'Producto con Stock (busca por nombre)'
                                : 'Producto del Catálogo'}
                        </label>
                        <Combobox
                            options={adjustmentType === 'DECREASE'
                                ? stockProducts
                                : allProducts.map(p => ({ id: p.id, name: `${p.name} (${p.code})` }))
                            }
                            value={selectedProduct}
                            onChange={handleProductSelect}
                            placeholder={adjustmentType === 'DECREASE'
                                ? `-- ${stockProducts.length} productos con stock disponible --`
                                : `-- ${allProducts.length} productos en catálogo --`
                            }
                        />

                        {selectedProductData && (
                            <div className={`mt-4 p-4 rounded-xl border-2 ${adjustmentType === 'DECREASE' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'} animate-in zoom-in`}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-slate-800">{selectedProductData.name}</p>
                                        <p className="text-xs text-slate-500 font-mono">{selectedProductData.code}</p>
                                        {adjustmentType === 'DECREASE' && (
                                            <p className="text-sm mt-1 font-bold text-red-600">
                                                Stock disponible: {selectedProductData.maxQty} {selectedProductData.unit || 'UN'}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => { setSelectedProduct(''); setSelectedProductData(null); setTargetLocation(''); }}
                                        className="text-slate-400 hover:text-red-500"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* PASO 3: DETALLES */}
            {isStep1Complete && isStep2Complete && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center gap-3 mb-4">
                        <div className={`w-8 h-8 bg-${accentColor}-100 text-${accentColor}-600 rounded-lg flex items-center justify-center font-bold text-sm`}>
                            3
                        </div>
                        <h3 className="font-bold text-slate-800">Detalles del Ajuste</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* SI ES INCREASE, PEDIR UBICACIÓN */}
                        {adjustmentType === 'INCREASE' && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                    <MapPin size={14} className="inline mr-1" /> ¿Dónde se guardará el hallazgo?
                                </label>
                                <Combobox
                                    options={locations.map(l => ({ id: l.id, name: l.full_code }))}
                                    value={targetLocation}
                                    onChange={setTargetLocation}
                                    placeholder="-- Seleccionar Rack / Ubicación --"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Motivo</label>
                            <select
                                className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                            >
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
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                                Cantidad a {adjustmentType === 'INCREASE' ? 'Sumar' : 'Descontar'}
                            </label>
                            <input
                                type="number"
                                className={`w-full border-2 p-3 rounded-xl font-black text-2xl text-center outline-none ${adjustmentType === 'DECREASE'
                                    ? 'border-red-200 text-red-600 focus:border-red-400'
                                    : 'border-emerald-200 text-emerald-600 focus:border-emerald-400'
                                    }`}
                                placeholder="0"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                max={adjustmentType === 'DECREASE' ? selectedProductData?.maxQty : undefined}
                            />
                            {adjustmentType === 'DECREASE' && selectedProductData?.maxQty && (
                                <p className="text-xs text-slate-400 mt-1 text-center">
                                    Máximo: {selectedProductData.maxQty}
                                </p>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Comentarios / Observación</label>
                            <textarea
                                className="w-full border border-slate-200 p-3 rounded-xl outline-none focus:border-blue-400"
                                rows="2"
                                placeholder="Detalle de la incidencia..."
                                value={comments}
                                onChange={e => setComments(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Evidencia Fotográfica / Acta</label>
                            <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${evidenceFile
                                ? 'bg-emerald-50 border-emerald-400'
                                : 'hover:bg-slate-50 border-slate-300'
                                }`}>
                                {evidenceFile
                                    ? <CheckCircle className="text-emerald-500 mb-2" size={32} />
                                    : <Camera className="text-slate-300 mb-2" size={32} />
                                }
                                <span className="text-sm font-bold text-slate-600">
                                    {evidenceFile ? evidenceFile.name : "Click para subir foto o documento"}
                                </span>
                                <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => setEvidenceFile(e.target.files[0])} />
                            </label>
                        </div>

                        <div className="md:col-span-2 pt-4">
                            <button
                                onClick={handleSubmit}
                                disabled={processing || !reason || !quantity || (adjustmentType === 'INCREASE' && !targetLocation)}
                                className={`w-full py-4 rounded-xl font-black text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${adjustmentType === 'DECREASE'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                            >
                                {processing ? <Loader className="animate-spin" /> : (
                                    <>
                                        {adjustmentType === 'DECREASE' ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                                        CONFIRMAR {adjustmentType === 'DECREASE' ? 'PÉRDIDA' : 'HALLAZGO'}
                                    </>
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}