import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient'; // <--- Importante
import Combobox from '../components/Combobox';
import {
    Search, ArrowUpCircle, ArrowDownCircle, Layers, History,
    Loader, MapPin, Download, Grid, Wallet, X, ArrowRight, Briefcase
} from 'lucide-react';

export default function InventoryViewer() {
    const [activeTab, setActiveTab] = useState('STOCK');
    const [loading, setLoading] = useState(false);

    // Datos Maestros
    const [warehouses, setWarehouses] = useState([]);
    const [products, setProducts] = useState([]);
    const [movements, setMovements] = useState([]);
    const [locations, setLocations] = useState([]);
    const [stockInRacks, setStockInRacks] = useState([]);

    // Nuevo: Lista de Proyectos
    const [projectsList, setProjectsList] = useState([]);

    // Filtros
    const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
    const [selectedProject, setSelectedProject] = useState('ALL'); // <--- Nuevo Estado Filtro Proyecto
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showPutawayMovements, setShowPutawayMovements] = useState(false);

    const formatMoney = (amount) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount || 0);
    };

    const translateMovementType = (type) => {
        const translations = {
            'INBOUND': 'Recepción', 'OUTBOUND': 'Despacho',
            'TRANSFER_IN': 'Transf. Entrada', 'TRANSFER_OUT': 'Transf. Salida', 'PUTAWAY': 'Ubicación'
        };
        return translations[type] || type;
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Carga de datos locales (Supabase Logística)
                const { data: wh } = await supabase.from('warehouses').select('*');
                setWarehouses(wh || []);
                const { data: prod } = await supabase.from('products').select('*');
                setProducts(prod || []);
                const { data: locs } = await supabase.from('locations').select('*');
                setLocations(locs || []);
                const { data: mov } = await supabase.from('movements').select('*').order('created_at', { ascending: false });
                setMovements(mov || []);
                const { data: rackStock } = await supabase.from('product_locations').select('*');
                setStockInRacks(rackStock || []);

                // 2. Carga de Proyectos (Supabase Adquisiciones)
                const { data: projs } = await supabaseProcurement
                    .from('proyectos')
                    .select('id, proyecto, cliente')
                    .eq('activo', true)
                    .order('proyecto', { ascending: true });
                setProjectsList(projs || []);

            } catch (error) {
                console.error("Error cargando inventario:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // --- LÓGICA DE BÚSQUEDA FLOTANTE ---
    const searchResults = useMemo(() => {
        if (!searchTerm || selectedProduct) return [];
        const term = searchTerm.toLowerCase();
        return products
            .filter(p => (p.name || '').toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term))
            .slice(0, 6);
    }, [searchTerm, products, selectedProduct]);

    // --- LÓGICA 1: STOCK GLOBAL (FILTRADO POR PROYECTO) ---
    // --- LÓGICA 1: STOCK GLOBAL (FILTRADO POR PROYECTO) ---
    // --- LÓGICA 1: STOCK GLOBAL (FILTRADO POR PROYECTO) ---
    const stockByWarehouse = useMemo(() => {
        const stockMap = {};

        // Obtenemos datos del proyecto seleccionado para filtrado híbrido (ID o Nombre)
        const targetProject = selectedProject !== 'ALL'
            ? projectsList.find(p => String(p.id) === String(selectedProject))
            : null;

        movements.forEach(m => {
            // 1. Filtro de Bodega (Hardened comparison)
            if (selectedWarehouse !== 'ALL' && String(m.warehouse_id) !== String(selectedWarehouse)) return;

            // 2. Filtro de Proyecto
            if (selectedProject !== 'ALL' && targetProject) {
                const movProj = String(m.project_id || '').trim();
                const matchId = movProj === String(targetProject.id);
                const matchName = movProj === String(targetProject.proyecto);

                if (!matchId && !matchName) return;
            }

            // 3. Filtro Producto (Si hay uno seleccionado)
            if (selectedProduct && String(m.product_id) !== String(selectedProduct)) return;

            if (!m.product_id) return;

            const key = `${m.product_id}_${m.warehouse_id}`;
            if (!stockMap[key]) stockMap[key] = { productId: m.product_id, warehouseId: m.warehouse_id, inbound: 0, outbound: 0 };

            const qty = Number(m.quantity);
            if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') stockMap[key].inbound += qty;
            if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') stockMap[key].outbound += qty;
        });

        return Object.values(stockMap).map(item => {
            const prod = products.find(p => p.id === item.productId);
            const wh = warehouses.find(w => w.id === item.warehouseId);
            const currentStock = item.inbound - item.outbound;
            const price = Number(prod?.price || 0);

            return {
                ...item,
                code: prod?.code || '???',
                name: prod?.name || 'Desconocido',
                warehouseName: wh?.name || 'Desconocida',
                currentStock,
                unitPrice: price,
                totalValue: currentStock * price
            };
        }).filter(item => item.currentStock !== 0);
    }, [movements, products, warehouses, selectedWarehouse, selectedProject, projectsList, selectedProduct]);

    // --- LÓGICA 2: POR UBICACIÓN (Físico) ---
    const stockByLocation = useMemo(() => {
        return stockInRacks.filter(item => {
            // Filtro Bodega (Hardened)
            const matchWh = selectedWarehouse === 'ALL' || String(item.warehouse_id) === String(selectedWarehouse);
            if (!matchWh) return false;

            // Filtro estricto por producto seleccionado
            if (selectedProduct && String(item.product_id) !== String(selectedProduct)) return false;

            return true;
        }).map(item => {
            const prod = products.find(p => p.id === item.product_id);
            const wh = warehouses.find(w => w.id === item.warehouse_id);
            const loc = locations.find(l => l.id === item.location_id);
            const price = Number(prod?.price || 0);
            return {
                id: item.id, productId: item.product_id, warehouseName: wh?.name || '?',
                locationCode: loc?.full_code || 'S/N', productCode: prod?.code || '?',
                productName: prod?.name || '?', quantity: Number(item.quantity), totalValue: Number(item.quantity) * price
            };
        });
    }, [stockInRacks, products, warehouses, locations, selectedWarehouse, selectedProduct]);

    // --- KPI CARDS DATA (NUEVO) ---
    const kpiData = useMemo(() => {
        const totalStock = stockByWarehouse.reduce((sum, i) => sum + i.currentStock, 0);
        const totalValue = stockByWarehouse.reduce((sum, i) => sum + i.totalValue, 0);
        const totalSKUs = new Set(stockByWarehouse.map(i => i.productId)).size;
        return { totalStock, totalValue, totalSKUs };
    }, [stockByWarehouse]);

    // --- LÓGICA 3: KÁRDEX (FILTRADO POR PROYECTO) ---
    const kardexWithBalance = useMemo(() => {
        if (!selectedProduct) return [];

        let productMovements = movements.filter(m => String(m.product_id) === String(selectedProduct));

        // Filtro Bodega
        if (selectedWarehouse !== 'ALL') {
            productMovements = productMovements.filter(m => m.warehouse_id === selectedWarehouse);
        }

        // Filtro Proyecto (Igual lógica híbrida que arriba)
        if (selectedProject !== 'ALL') {
            const targetProject = projectsList.find(p => String(p.id) === String(selectedProject));
            if (targetProject) {
                productMovements = productMovements.filter(m => {
                    const movProj = String(m.project_id || '').trim();
                    return movProj === String(targetProject.id) || movProj === String(targetProject.proyecto);
                });
            }
        }

        const sorted = [...productMovements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let runningBalance = 0;

        return sorted.map(mov => {
            const qty = Number(mov.quantity);
            if (mov.type === 'INBOUND' || mov.type === 'TRANSFER_IN') runningBalance += qty;
            else if (mov.type === 'OUTBOUND' || mov.type === 'TRANSFER_OUT') runningBalance -= qty;
            return { ...mov, balance: runningBalance };
        }).filter(m => showPutawayMovements || m.type !== 'PUTAWAY')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Orden inverso para visualización
    }, [movements, selectedProduct, selectedWarehouse, showPutawayMovements, selectedProject, projectsList]);

    // Info del Banner
    const selectedProductInfo = useMemo(() => {
        if (!selectedProduct) return null;
        const prod = products.find(p => String(p.id) === String(selectedProduct));
        // El stock de Kardex es el "Stock del Proyecto" si el filtro está activo
        const kardexStock = kardexWithBalance.length > 0 ? kardexWithBalance[0].balance : 0;

        // El stock de Racks siempre es el físico total (la bodega no sabe de dueños en sus estantes)
        const rackStock = stockByLocation.reduce((sum, i) => sum + i.quantity, 0);

        return {
            name: prod?.name, code: prod?.code,
            stockKardex: kardexStock, stockRack: rackStock,
            totalValue: kardexStock * Number(prod?.price || 0) // Valorizamos lo que es del proyecto
        };
    }, [selectedProduct, products, kardexWithBalance, stockByLocation]);

    const grandTotal = useMemo(() => {
        if (activeTab === 'STOCK') return stockByWarehouse.reduce((sum, i) => sum + i.totalValue, 0);
        // En ubicación no filtramos valor por proyecto porque es físico
        if (activeTab === 'LOCATIONS') return stockByLocation.reduce((sum, i) => sum + i.totalValue, 0);
        return 0;
    }, [activeTab, stockByWarehouse, stockByLocation]);

    return (
        <div className="flex flex-col h-full bg-slate-50/50 space-y-6 pb-20">

            {/* 1. HEADER & KPI DASHBOARD */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                            <Layers className="text-indigo-600" /> Visor de Inventario
                        </h1>
                        <p className="text-slate-500 text-sm">Control y valorización de existencias en tiempo real.</p>
                    </div>

                    <div className="flex gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-right min-w-[120px]">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Items Únicos</p>
                            <p className="text-2xl font-black text-slate-700">{kpiData.totalSKUs}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-right min-w-[140px]">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Unidades Totales</p>
                            <p className="text-2xl font-black text-blue-600">{kpiData.totalStock}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-right min-w-[180px]">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Valorización</p>
                            <p className="text-2xl font-black text-emerald-700">{formatMoney(kpiData.totalValue)}</p>
                        </div>
                    </div>
                </div>

                {/* BARRA DE FILTROS SUPERIOR (ERP STYLE) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    {/* Filtro Bodega */}
                    <div className="md:col-span-3">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bodega</label>
                        <Combobox
                            options={[{ id: 'ALL', name: 'Todas las Bodegas' }, ...warehouses]}
                            value={selectedWarehouse}
                            onChange={setSelectedWarehouse}
                            placeholder="-- Todas --"
                        />
                    </div>

                    {/* Filtro Proyecto */}
                    <div className="md:col-span-4">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proyecto / Cliente</label>
                        <Combobox
                            options={[{ id: 'ALL', name: 'Todos los Proyectos' }, ...projectsList.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))]}
                            value={selectedProject}
                            onChange={setSelectedProject}
                            placeholder="-- Todos --"
                        />
                    </div>

                    {/* Filtro Producto (COMBOBOX BUSCABLE) */}
                    <div className="md:col-span-5 relative">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Buscar Producto (SKU/Nombre)</label>
                        <Combobox
                            options={products.map(p => ({ id: p.id, name: `${p.name} (${p.code})` }))}
                            value={selectedProduct}
                            onChange={(val) => {
                                setSelectedProduct(val);
                            }}
                            placeholder="-- Filtrar por Producto --"
                        />
                        {selectedProduct && (
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute right-10 top-7 text-slate-400 hover:text-red-500 text-xs font-bold"
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 2. CONTENIDO PRINCIPAL (TABS) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
                {/* TABS NAVIGATION */}
                <div className="flex border-b border-slate-100 bg-slate-50/50">
                    <button onClick={() => setActiveTab('STOCK')} className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'STOCK' ? 'border-blue-500 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <Grid size={16} /> Resumen de Existencias
                    </button>
                    <button onClick={() => setActiveTab('LOCATIONS')} className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'LOCATIONS' ? 'border-purple-500 text-purple-700 bg-purple-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <MapPin size={16} /> Ubicación Física
                    </button>
                    <button onClick={() => setActiveTab('KARDEX')} className={`px-6 py-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'KARDEX' ? 'border-orange-500 text-orange-700 bg-orange-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                        <History size={16} /> Movimientos (Kárdex)
                    </button>
                </div>

                {/* TABLE CONTENT */}
                <div className="p-0">

                    {/* VISTA 1: STOCK GLOBAL */}
                    {!loading && activeTab === 'STOCK' && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] tracking-wider border-b">
                                    <tr>
                                        <th className="px-6 py-4">Código / Producto</th>
                                        <th className="px-6 py-4">Bodega</th>
                                        <th className="px-6 py-4 text-center">Stock Disp.</th>
                                        <th className="px-6 py-4 text-right">Precio Unit.</th>
                                        <th className="px-6 py-4 text-right bg-emerald-50/50 text-emerald-800">Valor Total</th>
                                        <th className="px-6 py-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {stockByWarehouse.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-6 py-3">
                                                <div className="font-bold text-slate-700 text-sm group-hover:text-blue-700">{item.name}</div>
                                                <div className="text-[10px] font-mono text-slate-400 bg-slate-100 w-fit px-2 py-0.5 rounded mt-1">{item.code}</div>
                                            </td>
                                            <td className="px-6 py-3 text-xs font-semibold text-slate-500">{item.warehouseName}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.currentStock < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {item.currentStock}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-right text-slate-500 text-xs">{formatMoney(item.unitPrice)}</td>
                                            <td className="px-6 py-3 text-right font-bold text-emerald-700">{formatMoney(item.totalValue)}</td>
                                            <td className="px-6 py-3 text-center">
                                                <button onClick={() => { setSelectedProduct(item.productId); setActiveTab('KARDEX'); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Ver Historial">
                                                    <History size={18} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {stockByWarehouse.length === 0 && (
                                        <tr><td colSpan="6" className="py-20 text-center text-slate-400 italic">No se encontraron productos con los filtros seleccionados.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* VISTA 2: UBICACIONES */}
                    {!loading && activeTab === 'LOCATIONS' && (
                        <div>
                            {stockByLocation.length > 0 ? (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[11px] tracking-wider border-b">
                                        <tr>
                                            <th className="px-6 py-4">Ubicación (Rack)</th>
                                            <th className="px-6 py-4">Producto</th>
                                            <th className="px-6 py-4 text-center">Cantidad Física</th>
                                            <th className="px-6 py-4 text-right">Valorización</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {stockByLocation.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                                                <td className="px-6 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs"><MapPin size={14} /></div>
                                                        <div>
                                                            <p className="font-bold text-slate-700">{item.locationCode}</p>
                                                            <p className="text-[10px] uppercase text-slate-400 font-bold">{item.warehouseName}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <p className="font-semibold text-slate-700">{item.productName}</p>
                                                    <p className="text-[10px] font-mono text-slate-400">{item.productCode}</p>
                                                </td>
                                                <td className="px-6 py-3 text-center"><span className="text-lg font-bold text-slate-700">{item.quantity}</span></td>
                                                <td className="px-6 py-3 text-right font-medium text-slate-500">{formatMoney(item.totalValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="py-20 text-center text-slate-400 italic">
                                    <MapPin size={48} className="mx-auto mb-4 opacity-10" /> No hay stock físico registrado en racks para esta selección.
                                </div>
                            )}
                        </div>
                    )}

                    {/* VISTA 3: KÁRDEX */}
                    {!loading && activeTab === 'KARDEX' && (
                        <div className="p-6">
                            {!selectedProduct ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Search size={64} className="opacity-10 mb-4" />
                                    <p className="text-lg font-medium">Selecciona un producto arriba para ver su historial.</p>
                                    <p className="text-sm">Usa el buscador "Buscar Producto" para filtrar.</p>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto">
                                    <div className="mb-6 flex items-center justify-between border-b pb-4">
                                        <div>
                                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                                <History size={20} className="text-orange-500" /> Historial de Movimientos
                                            </h3>
                                            <p className="text-xs text-slate-400 mt-1">
                                                Producto: <strong className="text-slate-700">{products.find(p => p.id === selectedProduct)?.name}</strong>
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Saldo Actual</p>
                                            <p className="text-2xl font-black text-indigo-600">
                                                {kardexWithBalance.length > 0 ? kardexWithBalance[0].balance : 0}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {kardexWithBalance.length === 0 && <p className="text-center italic text-slate-400 py-10">Sin movimientos registrados con los filtros actuales.</p>}
                                        {kardexWithBalance.map(mov => (
                                            <div key={mov.id} className="bg-white border rounded-xl p-4 flex items-center gap-4 hover:shadow-md transition-shadow relative overflow-hidden">
                                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${mov.type.includes('IN') || mov.type === 'INBOUND' ? 'bg-emerald-500' : 'bg-orange-500'}`} />

                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${mov.type.includes('IN') || mov.type === 'INBOUND' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                                    {mov.type.includes('IN') || mov.type === 'INBOUND' ? <ArrowDownCircle size={20} /> : <ArrowUpCircle size={20} />}
                                                </div>

                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-slate-500 uppercase">{new Date(mov.created_at).toLocaleDateString()} {new Date(mov.created_at).toLocaleTimeString().slice(0, 5)}</span>
                                                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{translateMovementType(mov.type)}</span>
                                                    </div>
                                                    <p className="font-bold text-slate-800 text-sm">{mov.comments || 'Sin comentarios'}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">Doc: {mov.document_number || 'N/A'}</p>
                                                </div>

                                                <div className="text-right min-w-[100px]">
                                                    <p className={`text-lg font-black ${mov.type.includes('IN') || mov.type === 'INBOUND' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                                        {mov.type.includes('IN') || mov.type === 'INBOUND' ? '+' : '-'}{Math.abs(mov.quantity)}
                                                    </p>
                                                    <p className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 rounded inline-block">Saldo: {mov.balance}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}