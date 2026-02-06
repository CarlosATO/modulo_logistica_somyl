import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import Combobox from '../components/Combobox';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer';
import TransferPDF from '../components/TransferPDF';
import {
    ArrowRightLeft, Building2, UserCheck, Search, Trash2,
    Save, FileText, X, Loader
} from 'lucide-react';

export default function CreateTransferModal({ onClose, onSuccess }) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    // Datos Maestros
    const [warehouses, setWarehouses] = useState([]);
    const [projects, setProjects] = useState([]);
    const [products, setProducts] = useState([]);

    // Correlativo
    const [nextTransferId, setNextTransferId] = useState('');

    const [isDistributionModalOpen, setIsDistributionModalOpen] = useState(false);
    const [selectedProductForModal, setSelectedProductForModal] = useState(null);
    const [locationsForProduct, setLocationsForProduct] = useState([]);

    const [formData, setFormData] = useState({
        originWarehouse: '',
        destinationWarehouse: '',
        originProjectId: '',
        destinationProjectId: '',
        authorizedBy: '',
    });

    const [cart, setCart] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [lastTransferData, setLastTransferData] = useState(null);

    // Función para obtener el siguiente folio
    const fetchNextFolio = async () => {
        try {
            const { count, error } = await supabase
                .from('transfers')
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            setNextTransferId(`TRF-${count || 0}`);
        } catch (error) {
            console.error("Error obteniendo correlativo:", error);
            setNextTransferId(`TRF-ERR`);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                await fetchNextFolio();

                const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
                setWarehouses(wh || []);

                const { data: prod } = await supabase.from('products').select('*');
                setProducts(prod || []);

                const { data: proj, error } = await supabaseProcurement
                    .from('proyectos')
                    .select('id, proyecto, cliente, activo')
                    .eq('activo', true)
                    .order('proyecto', { ascending: true });

                if (error) throw error;

                const mappedProjects = proj?.map(p => ({
                    id: p.id,
                    name: `${p.proyecto} (${p.cliente})`,
                    proyecto_solo: p.proyecto,
                    cliente_solo: p.cliente
                })) || [];

                setProjects(mappedProjects);
            } catch (error) {
                console.error("Error cargando datos maestros:", error);
            }
        };
        loadData();
    }, []);

    // Filtros de bodegas
    const availableOrigins = useMemo(() => {
        return warehouses.filter(w => w.id !== formData.destinationWarehouse);
    }, [warehouses, formData.destinationWarehouse]);

    const availableDestinations = useMemo(() => {
        return warehouses.filter(w => w.id !== formData.originWarehouse);
    }, [warehouses, formData.originWarehouse]);

    const handleOpenDistributionModal = async (product) => {
        if (!formData.originWarehouse) return alert("Selecciona primero la bodega de origen.");
        const { data: locs } = await supabase
            .from('product_locations')
            .select('*, locations(full_code, zone, row, shelf)')
            .eq('warehouse_id', formData.originWarehouse)
            .eq('product_id', product.id)
            .gt('quantity', 0);

        if (!locs || locs.length === 0) {
            alert("Este producto no tiene ubicación física asignada en esta bodega.");
            return;
        }
        setLocationsForProduct(locs);
        setSelectedProductForModal(product);
        setIsDistributionModalOpen(true);
    };

    const handleConfirmFromModal = (distribution) => {
        const totalQty = distribution.reduce((sum, item) => sum + Number(item.quantityToTake), 0);
        if (totalQty <= 0) return alert("Cantidad inválida.");
        setCart([...cart, { ...selectedProductForModal, transferQty: totalQty, distribution }]);
        setIsDistributionModalOpen(false);
        setSelectedProductForModal(null);
        setSearchTerm('');
    };

    const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

    const handleSaveTransfer = async () => {
        if (!formData.originWarehouse || !formData.destinationWarehouse) return alert("Faltan bodegas.");
        if (!formData.authorizedBy) return alert("Falta autorización.");
        if (cart.length === 0) return alert("Carrito vacío.");

        const confirm = window.confirm(`¿Confirmar Traspaso ${nextTransferId}?`);
        if (!confirm) return;

        setLoading(true);
        try {
            const transferId = nextTransferId;
            const originWhName = warehouses.find(w => w.id === formData.originWarehouse)?.name;
            const destWhName = warehouses.find(w => w.id === formData.destinationWarehouse)?.name;
            const originProjName = projects.find(p => p.id == formData.originProjectId)?.name || 'Sin Asignar';
            const destProjName = projects.find(p => p.id == formData.destinationProjectId)?.name || 'Sin Asignar';

            // Master Insert
            const { error: masterError } = await supabase.from('transfers').insert({
                transfer_number: transferId,
                origin_warehouse_id: formData.originWarehouse,
                destination_warehouse_id: formData.destinationWarehouse,
                origin_project_name: originProjName,
                destination_project_name: destProjName,
                authorized_by: formData.authorizedBy,
                user_email: user?.email
            });

            if (masterError) throw masterError;

            // Movements
            for (const item of cart) {
                for (const dist of item.distribution) {
                    if (dist.quantityToTake > 0) {
                        const { data: cur } = await supabase.from('product_locations').select('quantity').eq('id', dist.tableId).single();
                        const newQty = (cur?.quantity || 0) - Number(dist.quantityToTake);
                        if (newQty <= 0) await supabase.from('product_locations').delete().eq('id', dist.tableId);
                        else await supabase.from('product_locations').update({ quantity: newQty }).eq('id', dist.tableId);

                        await supabase.from('movements').insert({
                            type: 'TRANSFER_OUT',
                            warehouse_id: formData.originWarehouse,
                            product_id: item.id,
                            quantity: dist.quantityToTake,
                            transfer_number: transferId,
                            authorized_by: formData.authorizedBy,
                            project_origin: originProjName,
                            project_destination: destProjName,
                            other_data: `Rack: ${dist.locationCode}`,
                            user_email: user?.email
                        });
                    }
                }
                await supabase.from('movements').insert({
                    type: 'TRANSFER_IN',
                    warehouse_id: formData.destinationWarehouse,
                    product_id: item.id,
                    quantity: item.transferQty,
                    transfer_number: transferId,
                    authorized_by: formData.authorizedBy,
                    project_origin: originProjName,
                    project_destination: destProjName,
                    other_data: `Pendiente Recepción`,
                    user_email: user?.email
                });
            }

            alert(`✅ Traspaso ${transferId} completado.`);
            onSuccess(); // Refresh list in parent
            onClose(); // Close modal

        } catch (error) {
            alert("Error: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return [];
        return products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10);
    }, [searchTerm, products]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRightLeft className="text-indigo-600" /> Nuevo Traspaso
                        </h2>
                        <p className="text-xs text-slate-500">Folio asignado: <strong>{nextTransferId}</strong></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">

                        {/* Configuration Panel */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100">
                                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Building2 size={18} /> Ruta</h3>
                                <div className="space-y-4">
                                    <Combobox options={availableOrigins} value={formData.originWarehouse} onChange={(val) => { setFormData({ ...formData, originWarehouse: val }); setCart([]); }} label="Origen" />
                                    <div className="flex justify-center -my-2"><ArrowRightLeft size={16} className="rotate-90 text-slate-400" /></div>
                                    <Combobox options={availableDestinations} value={formData.destinationWarehouse} onChange={(val) => setFormData({ ...formData, destinationWarehouse: val })} label="Destino" />
                                </div>
                            </div>

                            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><UserCheck size={18} /> Proyectos</h3>
                                <div className="space-y-3">
                                    <input type="text" className="w-full border p-2 rounded-lg outline-none text-sm" placeholder="Autorizado Por" value={formData.authorizedBy} onChange={e => setFormData({ ...formData, authorizedBy: e.target.value })} />
                                    <Combobox options={[{ id: '', name: '-- Sin Proyecto --' }, ...projects]} value={formData.originProjectId} onChange={(val) => setFormData({ ...formData, originProjectId: val })} label="Proyecto Origen" />
                                    <Combobox options={[{ id: '', name: '-- Sin Proyecto --' }, ...projects]} value={formData.destinationProjectId} onChange={(val) => setFormData({ ...formData, destinationProjectId: val })} label="Proyecto Destino" />
                                </div>
                            </div>
                        </div>

                        {/* Cart & Actions */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {/* Search */}
                            <div className={`bg-white p-5 rounded-xl shadow-sm border ${!formData.originWarehouse ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex items-center gap-3 border bg-slate-50 p-3 rounded-xl">
                                    <Search className="text-slate-400" /><input type="text" placeholder="Buscar producto por nombre o SKU..." className="bg-transparent w-full outline-none text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                </div>
                                {searchTerm && (
                                    <div className="max-h-40 overflow-y-auto border rounded-lg bg-white absolute shadow-xl w-full max-w-lg z-20 mt-2">
                                        {filteredProducts.map(prod => (
                                            <div key={prod.id} className="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-0" onClick={() => handleOpenDistributionModal(prod)}>
                                                <p className="font-bold text-sm text-slate-700">{prod.name}</p><p className="text-xs text-slate-400">{prod.code}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Items List */}
                            <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex-1 flex flex-col">
                                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
                                    <h3 className="font-bold text-indigo-900 flex items-center gap-2"><FileText size={18} /> Items a Traspasar</h3>
                                </div>
                                <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                                    {cart.map(item => (
                                        <div key={item.id} className="bg-white border p-3 rounded-lg shadow-sm flex justify-between items-center group hover:border-indigo-200 transition-colors">
                                            <div>
                                                <p className="font-bold text-sm text-slate-700">{item.name}</p>
                                                <p className="text-xs text-slate-400">{item.code}</p>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-lg text-sm">{item.transferQty} UN</span>
                                                <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                    ))}
                                    {cart.length === 0 && <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                                        <ArrowRightLeft size={48} className="mb-2" />
                                        <p>Agregue materiales para iniciar</p>
                                    </div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white border-t flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button
                        onClick={handleSaveTransfer}
                        disabled={loading || cart.length === 0}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading ? <Loader className="animate-spin" size={20} /> : <><Save size={20} /> Confirmar Traspaso</>}
                    </button>
                </div>

                {/* Nested Distribution Modal */}
                {isDistributionModalOpen && selectedProductForModal && (
                    <DistributionModal
                        product={selectedProductForModal}
                        locations={locationsForProduct}
                        onConfirm={handleConfirmFromModal}
                        onClose={() => setIsDistributionModalOpen(false)}
                    />
                )}

            </div>
        </div>
    );
}

// Distribution Modal Component
function DistributionModal({ product, locations, onConfirm, onClose }) {
    const [inputs, setInputs] = useState({});
    const handleInputChange = (id, max, val) => setInputs(prev => ({ ...prev, [id]: Math.min(Math.max(Number(val), 0), max) }));
    const handleSave = () => {
        const dist = locations.map(l => ({ tableId: l.id, locationId: l.location_id, locationCode: l.locations?.full_code || '?', quantityToTake: inputs[l.id] || 0 })).filter(d => d.quantityToTake > 0);
        onConfirm(dist);
    };
    const total = Object.values(inputs).reduce((a, b) => a + b, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-5">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div><h3 className="font-bold text-lg text-slate-800">{product.name}</h3><p className="text-xs text-slate-500">Distribución de Rack</p></div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {locations.map(loc => (
                        <div key={loc.id} className="flex items-center justify-between p-3 border rounded-xl hover:bg-slate-50 transition-colors">
                            <div><p className="font-black text-slate-700 text-sm">{loc.locations?.full_code}</p><p className="text-xs text-slate-400">Stock: {loc.quantity}</p></div>
                            <input type="number" className="w-24 p-2 text-center border-2 rounded-lg font-bold text-indigo-600 outline-none focus:border-indigo-400 pointer-events-auto" value={inputs[loc.id] || ''} placeholder="0" autoFocus={false} onChange={(e) => handleInputChange(loc.id, loc.quantity, e.target.value)} />
                        </div>
                    ))}
                </div>
                <div className="p-5 border-t bg-slate-50 flex justify-between items-center rounded-b-2xl">
                    <span className="font-black text-2xl text-indigo-700">{total} UN</span>
                    <button onClick={handleSave} disabled={total === 0} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50">Confirmar</button>
                </div>
            </div>
        </div>
    );
}
