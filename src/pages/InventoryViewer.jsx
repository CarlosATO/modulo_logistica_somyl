import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient'; // <--- Importante
import Combobox from '../components/Combobox';
import {
    Search, ArrowUpCircle, ArrowDownCircle, Layers, History,
    Loader, MapPin, Download, Grid, Wallet, X, ArrowRight, Briefcase, AlertTriangle, Info
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
    const [selectedClient, setSelectedClient] = useState('ALL'); // <--- Nuevo Filtro Cliente
    const [selectedProject, setSelectedProject] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [kardexProduct, setKardexProduct] = useState(null); // Estado separado para el Drawer
    const [selectedMovement, setSelectedMovement] = useState(null); // Nuevo estado para Modal de Detalle
    const [showPutawayMovements, setShowPutawayMovements] = useState(false);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

    // --- LÓGICA DE FILTROS EN CASCADA ---

    // 1. Lista de Clientes Únicos (extraída de proyectos)
    const clientsList = useMemo(() => {
        const clients = projectsList.map(p => p.cliente).filter(Boolean);
        return [...new Set(clients)].sort();
    }, [projectsList]);

    // 2. Proyectos filtrados por Cliente seleccionado
    const filteredProjectsOptions = useMemo(() => {
        if (selectedClient === 'ALL') return projectsList;
        return projectsList.filter(p => p.cliente === selectedClient);
    }, [projectsList, selectedClient]);

    // 3. Productos Disponibles (Filtrados por Cliente/Proyecto seleccionado)
    // Solo mostramos productos que tengan movimientos asociados al cliente/proyecto seleccionado
    const availableProducts = useMemo(() => {
        // Si no hay filtro de cliente ni proyecto, mostrar todos
        if (selectedClient === 'ALL' && selectedProject === 'ALL') return products;

        // Identificar los proyectos relevantes
        let targetProjectIds = [];

        if (selectedProject !== 'ALL') {
            targetProjectIds = [String(selectedProject)];
        } else if (selectedClient !== 'ALL') {
            // Todos los proyectos del cliente seleccionado
            targetProjectIds = projectsList
                .filter(p => p.cliente === selectedClient)
                .map(p => String(p.id));
        }

        // Buscar IDs de productos que tengan movimientos en esos proyectos O que tengan el owner directo
        const relevantProductIds = new Set();
        movements.forEach(m => {
            const mProjId = String(m.project_id || '');
            // Chequeo 1: Es de un proyecto del cliente
            if (targetProjectIds.includes(mProjId)) {
                relevantProductIds.add(String(m.product_id));
            }
            // Chequeo 2: Es propiedad directa del cliente (Inbound asignado)
            else if (selectedClient !== 'ALL' && m.client_owner === selectedClient) {
                relevantProductIds.add(String(m.product_id));
            }
        });

        return products.filter(p => relevantProductIds.has(String(p.id)));

    }, [products, movements, selectedClient, selectedProject, projectsList]);


    const searchResults = useMemo(() => {
        if (!searchTerm || selectedProduct) return [];
        const term = searchTerm.toLowerCase();
        return products
            .filter(p => (p.name || '').toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term))
            .slice(0, 6);
    }, [searchTerm, products, selectedProduct]);

    // Estado Derivado: ¿Hay filtros activos?
    const activeFilters = useMemo(() => {
        return selectedWarehouse !== 'ALL' || selectedClient !== 'ALL' || selectedProject !== 'ALL' || selectedProduct !== null;
    }, [selectedWarehouse, selectedClient, selectedProject, selectedProduct]);

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

            // 2. Filtro de Proyecto / Cliente
            if (selectedClient !== 'ALL' || selectedProject !== 'ALL') {
                const movProjId = String(m.project_id || '').trim();

                // Caso A: Proyecto Específico Seleccionado
                if (selectedProject !== 'ALL') {
                    if (movProjId !== String(selectedProject)) return;
                }
                // Caso B: Solo Cliente Seleccionado (Cualquier proyecto de ese cliente O propiedad directa)
                else if (selectedClient !== 'ALL') {
                    // Criterio 1: Proyecto asociado al cliente
                    const proj = projectsList.find(p => String(p.id) === movProjId);
                    const isClientProject = proj && proj.cliente === selectedClient;

                    // Criterio 2: Propiedad directa en el movimiento (ej. Inbound Asignado)
                    const isDirectClientOwner = m.client_owner === selectedClient;

                    if (!isClientProject && !isDirectClientOwner) return;
                }
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
    }, [movements, products, warehouses, selectedWarehouse, selectedProject, projectsList, selectedProduct, selectedClient]);

    // --- LÓGICA 2: POR UBICACIÓN (Físico) ---
    const stockByLocation = useMemo(() => {
        return stockInRacks.filter(item => {
            // Filtro Bodega (Hardened)
            const matchWh = selectedWarehouse === 'ALL' || String(item.warehouse_id) === String(selectedWarehouse);
            if (!matchWh) return false;

            // Filtro estricto por producto seleccionado
            if (selectedProduct && String(item.product_id) !== String(selectedProduct)) return false;

            // Filtro de Consistencia: Solo mostrar productos disponibles para el Cliente/Proyecto seleccionado
            const validProductIds = new Set(availableProducts.map(p => String(p.id)));
            if (!validProductIds.has(String(item.product_id))) return false;

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
    }, [stockInRacks, products, warehouses, locations, selectedWarehouse, selectedProduct, availableProducts]);

    // --- KPI CARDS DATA (NUEVO) ---
    const kpiData = useMemo(() => {
        const totalStock = stockByWarehouse.reduce((sum, i) => sum + i.currentStock, 0);
        const totalValue = stockByWarehouse.reduce((sum, i) => sum + i.totalValue, 0);
        const totalSKUs = new Set(stockByWarehouse.map(i => i.productId)).size;
        return { totalStock, totalValue, totalSKUs };
    }, [stockByWarehouse]);

    // --- LÓGICA 3: KÁRDEX (FILTRADO POR PROYECTO) ---
    // --- LÓGICA 3: KÁRDEX (Ahora basado en kardexProduct para el Drawer) ---
    const kardexWithBalance = useMemo(() => {
        // Usamos kardexProduct si el drawer está abierto, de lo contrario podría ser selectedProduct si quisiéramos (pero el usuario pidió separar)
        const targetProd = kardexProduct;
        if (!targetProd) return [];

        let productMovements = movements.filter(m => String(m.product_id) === String(targetProd));

        // Filtro Bodega
        if (selectedWarehouse !== 'ALL') {
            productMovements = productMovements.filter(m => m.warehouse_id === selectedWarehouse);
        }

        // Filtro Proyecto / Cliente (Igual lógica híbrida)
        if (selectedClient !== 'ALL' || selectedProject !== 'ALL') {
            productMovements = productMovements.filter(m => {
                const movProjId = String(m.project_id || '').trim();

                // Caso A: Proyecto Específico
                if (selectedProject !== 'ALL') {
                    return movProjId === String(selectedProject);
                }
                // Caso B: Solo Cliente
                if (selectedClient !== 'ALL') {
                    const proj = projectsList.find(p => String(p.id) === movProjId);
                    const isClientProject = proj && proj.cliente === selectedClient;
                    const isDirectClientOwner = m.client_owner === selectedClient;
                    return isClientProject || isDirectClientOwner;
                }
                return true;
            });
        }

        const sorted = [...productMovements].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let runningBalance = 0;

        return sorted.map(mov => {
            const qty = Number(mov.quantity);
            if (['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type)) runningBalance += qty;
            else if (['OUTBOUND', 'TRANSFER_OUT', 'DECREASE'].includes(mov.type)) runningBalance -= qty;
            return { ...mov, balance: runningBalance };
        }).filter(m => showPutawayMovements || m.type !== 'PUTAWAY')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Orden inverso para visualización
    }, [movements, kardexProduct, selectedWarehouse, showPutawayMovements, selectedProject, selectedClient, projectsList]);

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

            {/* 1. HEADER & KPI DASHBOARD (Compacto) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                            <Layers size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 leading-none">Visor de Inventario</h1>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide mt-0.5">Control de Existencias</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-right min-w-[100px]">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Items</p>
                            <p className="text-lg font-bold text-slate-700 leading-none">{kpiData.totalSKUs}</p>
                        </div>
                        <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 text-right min-w-[120px]">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Unidades</p>
                            <p className="text-lg font-bold text-blue-600 leading-none">{kpiData.totalStock}</p>
                        </div>
                        <div className="px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100 text-right min-w-[140px]">
                            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-0.5">Valorización</p>
                            <p className="text-lg font-bold text-emerald-700 leading-none">{formatMoney(kpiData.totalValue)}</p>
                        </div>
                    </div>
                </div>

                {/* BARRA DE FILTROS SUPERIOR (Compacta) */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {/* 1. Filtro Bodega */}
                    <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bodega</label>
                        <Combobox
                            options={[{ id: 'ALL', name: 'Todas' }, ...warehouses]}
                            value={selectedWarehouse}
                            onChange={setSelectedWarehouse}
                            placeholder="Bodega..."
                        />
                    </div>

                    {/* 2. Filtro Cliente */}
                    <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cliente</label>
                        <Combobox
                            options={[{ id: 'ALL', name: 'Todos' }, ...clientsList.map(c => ({ id: c, name: c }))]}
                            value={selectedClient}
                            onChange={(val) => {
                                setSelectedClient(val);
                                setSelectedProject('ALL');
                            }}
                            placeholder="Cliente..."
                        />
                    </div>

                    {/* 3. Filtro Proyecto */}
                    <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Proyecto</label>
                        <Combobox
                            options={[{ id: 'ALL', name: 'Todos' }, ...filteredProjectsOptions.map(p => ({ id: p.id, name: p.proyecto }))]}
                            value={selectedProject}
                            onChange={setSelectedProject}
                            placeholder="Proyecto..."
                        />
                    </div>

                    {/* 4. Filtro Producto */}
                    <div className="md:col-span-12 relative">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Producto</label>
                        <Combobox
                            options={availableProducts.map(p => ({ id: p.id, name: `${p.name} (${p.code})` }))}
                            value={selectedProduct}
                            onChange={setSelectedProduct}
                            placeholder="Buscar producto por nombre o SKU..."
                        />
                        {selectedProduct && (
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute right-8 top-7 text-slate-400 hover:text-red-500"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* TABS NAVIGATION (Compacto) */}
            {/* ⚠️ WARNING BANNER: Project Filter Active (Compacto) */}
            {selectedProject !== 'ALL' && (
                <div className="bg-amber-50 border-l-2 border-amber-400 p-2 rounded-r-lg flex items-center gap-2 shadow-sm">
                    <AlertTriangle className="text-amber-500 flex-shrink-0" size={16} />
                    <p className="text-amber-800 text-[10px] leading-tight">
                        <strong>Vista filtrada por Proyecto:</strong> Los valores corresponden únicamente al proyecto seleccionado.
                    </p>
                </div>
            )}

            {!activeFilters ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="text-slate-300" size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">Comienza tu búsqueda</h3>
                    <p className="text-sm text-slate-500 max-w-md">
                        Selecciona una <strong>Bodega</strong>, <strong>Cliente</strong> o <strong>Proyecto</strong> en los filtros superiores para visualizar el inventario disponible.
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px]">
                    <div className="flex border-b border-slate-100 bg-slate-50/50">
                        <button onClick={() => setActiveTab('STOCK')} className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'STOCK' ? 'border-blue-500 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <Grid size={14} />
                            {selectedProject !== 'ALL' ? 'Stock Proyecto' : 'Stock Global'}
                        </button>
                        <button onClick={() => setActiveTab('LOCATIONS')} className={`px-4 py-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${activeTab === 'LOCATIONS' ? 'border-purple-500 text-purple-700 bg-purple-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <MapPin size={14} /> Ubicación Física
                        </button>
                    </div>

                    {/* TABLE CONTENT */}
                    <div className="p-0">

                        {/* VISTA 1: STOCK GLOBAL */}
                        {!loading && activeTab === 'STOCK' && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b">
                                        <tr>
                                            <th className="px-4 py-2">Código / Producto</th>
                                            <th className="px-4 py-2">Bodega</th>
                                            <th className="px-4 py-2 text-center">Stock</th>
                                            <th className="px-4 py-2 text-right">Precio Unit.</th>
                                            <th className="px-4 py-2 text-right bg-emerald-50/30 text-emerald-700">Total</th>
                                            <th className="px-4 py-2 text-center">Kárdex</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {stockByWarehouse.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="px-4 py-2">
                                                    <div className="font-bold text-slate-700 truncate max-w-[200px] group-hover:text-blue-700">{item.name}</div>
                                                    <div className="text-[9px] font-mono text-slate-400 bg-slate-100 w-fit px-1.5 py-0.5 rounded mt-0.5">{item.code}</div>
                                                </td>
                                                <td className="px-4 py-2 font-medium text-slate-500">{item.warehouseName}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.currentStock < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {item.currentStock}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right text-slate-400">{formatMoney(item.unitPrice)}</td>
                                                <td className="px-4 py-2 text-right font-bold text-emerald-700">{formatMoney(item.totalValue)}</td>
                                                <td className="px-4 py-2 text-center">
                                                    <button
                                                        onClick={() => {
                                                            setKardexProduct(item.productId);
                                                            setIsDrawerOpen(true);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-all"
                                                        title="Ver Kárdex"
                                                    >
                                                        <History size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {stockByWarehouse.length === 0 && (
                                            <tr><td colSpan="6" className="py-10 text-center text-slate-400 italic text-xs">Sin resultados.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* VISTA 2: UBICACIONES */}
                        {!loading && activeTab === 'LOCATIONS' && (
                            <div>
                                {stockByLocation.length > 0 ? (
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b">
                                            <tr>
                                                <th className="px-4 py-2">Ubicación</th>
                                                <th className="px-4 py-2">Producto</th>
                                                <th className="px-4 py-2 text-center">Cant.</th>
                                                <th className="px-4 py-2 text-right">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {stockByLocation.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                                                    <td className="px-4 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-[10px]"><MapPin size={12} /></div>
                                                            <div>
                                                                <p className="font-bold text-slate-700">{item.locationCode}</p>
                                                                <p className="text-[9px] uppercase text-slate-400">{item.warehouseName}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <p className="font-bold text-slate-700 truncate max-w-[200px]">{item.productName}</p>
                                                        <p className="text-[9px] font-mono text-slate-400">{item.productCode}</p>
                                                    </td>
                                                    <td className="px-4 py-2 text-center"><span className="font-bold text-slate-700">{item.quantity}</span></td>
                                                    <td className="px-4 py-2 text-right font-medium text-slate-500">{formatMoney(item.totalValue)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="py-10 text-center text-slate-400 italic text-xs">
                                        <MapPin size={32} className="mx-auto mb-2 opacity-10" /> No hay stock físico en racks.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* KARDEX SIDE DRAWER (SLIDE-OVER) */}
                        {kardexProduct && isDrawerOpen && (
                            <div className="fixed inset-0 z-50 flex justify-end">
                                {/* Backdrop */}
                                <div
                                    className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity"
                                    onClick={() => setIsDrawerOpen(false)}
                                />

                                {/* Drawer Panel */}
                                <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">

                                    {/* Drawer Header */}
                                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                                <History size={20} className="text-orange-500" /> Kárdex de Producto
                                            </h2>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {products.find(p => p.id === kardexProduct)?.code} -
                                                <strong className="text-slate-700 ml-1">{products.find(p => p.id === kardexProduct)?.name}</strong>
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setIsDrawerOpen(false)}
                                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    {/* Drawer Body (Scrollable) */}
                                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">

                                        {/* Balance Card */}
                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex justify-between items-center">
                                            <div>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Actual</p>
                                                <p className="text-sm text-slate-500">Calculado según filtros</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-3xl font-black text-indigo-600">
                                                    {kardexWithBalance.length > 0 ? kardexWithBalance[0].balance : 0}
                                                </p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase">Unidades</p>
                                            </div>
                                        </div>

                                        {/* Timeline */}
                                        <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200 hidden" /> {/* Visual Guide if needed */}

                                        <div className="space-y-4 relative">
                                            {kardexWithBalance.length === 0 && (
                                                <div className="text-center py-10">
                                                    <History size={48} className="mx-auto text-slate-200 mb-3" />
                                                    <p className="text-slate-400 italic">No hay movimientos registrados.</p>
                                                </div>
                                            )}

                                            {kardexWithBalance.map((mov, idx) => (
                                                <div key={mov.id} className="relative pl-0">
                                                    {/* Date Label Grouping could go here */}
                                                    <div
                                                        onClick={() => setSelectedMovement(mov)}
                                                        className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer hover:border-blue-300"
                                                    >
                                                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? 'bg-emerald-500' : 'bg-orange-500'}`} />

                                                        <div className="flex justify-between items-start gap-3">
                                                            <div className="flex items-start gap-3">
                                                                <div className={`mt-1 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                                    {['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-orange-50 border-orange-100 text-orange-700'}`}>
                                                                            {translateMovementType(mov.type)}
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-400 font-medium">
                                                                            {new Date(mov.created_at).toLocaleDateString()} • {new Date(mov.created_at).toLocaleTimeString().slice(0, 5)}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs font-bold text-slate-700 leading-snug">{mov.comments || 'Sin comentarios'}</p>
                                                                    {mov.document_number && <p className="text-[10px] text-slate-500 mt-0.5">Doc: {mov.document_number}</p>}
                                                                </div>
                                                            </div>

                                                            <div className="text-right">
                                                                <p className={`text-sm font-black ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? 'text-emerald-600' : 'text-orange-600'}`}>
                                                                    {['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(mov.type) ? '+' : '-'}{Math.abs(mov.quantity)}
                                                                </p>
                                                                <div className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded inline-block mt-1">
                                                                    Saldo: <strong>{mov.balance}</strong>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Drawer Footer */}
                                    <div className="bg-slate-50 p-4 border-t border-slate-200">
                                        <button
                                            onClick={() => setIsDrawerOpen(false)}
                                            className="w-full py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors text-xs"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* MOVEMENT DETAIL MODAL */}
            {selectedMovement && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedMovement(null)}
                    />

                    <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-50 duration-200">
                        {/* Modal Header */}
                        <div className={`px-6 py-4 border-b flex items-center justify-between ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(selectedMovement.type) ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(selectedMovement.type) ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                                    {['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(selectedMovement.type) ? <ArrowDownCircle size={24} /> : <ArrowUpCircle size={24} />}
                                </div>
                                <div>
                                    <p className="text-xs font-bold opacity-60 uppercase tracking-wider">Detalle de Movimiento</p>
                                    <h3 className="text-lg font-bold text-slate-800">{translateMovementType(selectedMovement.type)}</h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedMovement(null)}
                                className="p-2 bg-white/50 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6">

                            {/* Main Info Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Fecha</p>
                                    <p className="font-bold text-slate-700">{new Date(selectedMovement.created_at).toLocaleDateString()}</p>
                                    <p className="text-xs text-slate-500">{new Date(selectedMovement.created_at).toLocaleTimeString()}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Cantidad</p>
                                    <p className={`text-xl font-black ${['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(selectedMovement.type) ? 'text-emerald-600' : 'text-orange-600'}`}>
                                        {['INBOUND', 'TRANSFER_IN', 'INCREASE'].includes(selectedMovement.type) ? '+' : '-'}{Math.abs(selectedMovement.quantity)}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Unidades</p>
                                </div>
                            </div>

                            {/* Details Section */}
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase">Referencia / Comentario</label>
                                    <p className="text-sm font-medium text-slate-700 mt-0.5 bg-slate-50 p-2 rounded border border-slate-100">
                                        {selectedMovement.comments || 'Sin comentarios registrados.'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">N° Documento</label>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <Briefcase size={14} className="text-slate-400" />
                                            <p className="text-sm font-bold text-slate-700">{selectedMovement.document_number || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase">Bodega</label>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <MapPin size={14} className="text-slate-400" />
                                            <p className="text-sm font-bold text-slate-700">
                                                {warehouses.find(w => w.id === selectedMovement.warehouse_id)?.name || 'Desconocida'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Document Preview */}
                            {(selectedMovement.reception_document_url || selectedMovement.document_url) && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                            <Download size={14} /> Documento Adjunto
                                        </h4>
                                        <a
                                            href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/${selectedMovement.reception_document_url || selectedMovement.document_url}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                        >
                                            <Download size={12} /> Descargar PDF
                                        </a>
                                    </div>
                                    <div className="h-48 bg-slate-100 rounded-lg border-2 border-slate-200 overflow-hidden relative group">
                                        <iframe
                                            src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/${selectedMovement.reception_document_url || selectedMovement.document_url}`}
                                            className="w-full h-full border-none"
                                            title="Vista Previa"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <p className="text-white font-bold text-sm">Clic en Descargar para ver completo</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Fallback if no document URL but document_number exists (legacy or missing file) */}
                            {selectedMovement.document_number && !selectedMovement.reception_document_url && !selectedMovement.document_url && (
                                <div className="mt-4 pt-4 border-t border-slate-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                                            <AlertTriangle size={14} /> Documento Adjunto
                                        </h4>
                                    </div>
                                    <div className="h-24 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                                        <Briefcase size={24} className="opacity-30" />
                                        <p className="text-[10px] font-medium opacity-70">Sin archivo adjunto</p>
                                        <p className="text-[9px] opacity-50">Doc: {selectedMovement.document_number}</p>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Footer */}
                        <div className="bg-slate-50 px-6 py-4 border-t flex justify-end">
                            <button
                                onClick={() => setSelectedMovement(null)}
                                className="px-6 py-2 bg-white border border-slate-300 shadow-sm text-slate-700 font-bold rounded-lg hover:bg-slate-50 text-sm transition-all"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}