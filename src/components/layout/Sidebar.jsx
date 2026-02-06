import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import {
    LayoutDashboard,
    ArrowDownCircle,
    ArrowUpCircle,
    ClipboardList,
    ArrowRightLeft,
    AlertTriangle,
    UserCheck,
    Layers,
    History,
    FileBarChart,
    Package,
    Warehouse,
    Grid,
    Truck,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    ChevronRight,
    Bell,
    PanelLeftClose,
    PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isOpen, toggleSidebar, collapsed, toggleCollapse }) => {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [configOpen, setConfigOpen] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [pendingPutAway, setPendingPutAway] = useState(0);

    // Fetch pending RRHH requests count
    useEffect(() => {
        const fetchPendingCount = async () => {
            const { count } = await supabase
                .from('material_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'PENDING');
            setPendingCount(count || 0);
        };
        fetchPendingCount();

        // Subscribe to changes
        const channel = supabase
            .channel('pending_requests')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'material_requests' },
                () => fetchPendingCount()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    // Fetch pending Put Away items count - real-time calculation (Synced with PutAway.jsx)
    useEffect(() => {
        const fetchPutAwayCount = async () => {
            try {
                // Fetch minimalistic data for calculation
                const [movesRes, racksRes] = await Promise.all([
                    supabase.from('movements').select('warehouse_id, product_id, type, quantity').range(0, 9999),
                    supabase.from('product_locations').select('warehouse_id, product_id, quantity').range(0, 9999)
                ]);

                const moves = movesRes.data || [];
                const racks = racksRes.data || [];

                // 1. Accounting Stock Map
                const accountingMap = {};
                moves.forEach(m => {
                    const key = `${m.warehouse_id}_${m.product_id}`;
                    const qty = Number(m.quantity);
                    if (!accountingMap[key]) accountingMap[key] = 0;

                    if (m.type === 'INBOUND' || m.type === 'TRANSFER_IN') {
                        accountingMap[key] += qty;
                    } else if (m.type === 'OUTBOUND' || m.type === 'TRANSFER_OUT') {
                        accountingMap[key] -= qty;
                    }
                });

                // 2. Physical Stock Map
                const physicalMap = {};
                racks.forEach(r => {
                    const key = `${r.warehouse_id}_${r.product_id}`;
                    const qty = Number(r.quantity);
                    if (!physicalMap[key]) physicalMap[key] = 0;
                    physicalMap[key] += qty;
                });

                // 3. Calculate Pending Items Count
                let totalPendingItems = 0;
                Object.keys(accountingMap).forEach(key => {
                    const contable = accountingMap[key] || 0;
                    const fisico = physicalMap[key] || 0;
                    if ((contable - fisico) > 0) {
                        totalPendingItems++; // We count DISTINCT items pending, not total quantity
                    }
                });

                setPendingPutAway(totalPendingItems);
            } catch (err) {
                console.error('Error fetching put away count:', err);
                setPendingPutAway(0);
            }
        };

        fetchPutAwayCount();

        // Subscribe to all relevant table changes
        const channel = supabase
            .channel('pending_putaway_updates_sidebar')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'movements' },
                () => fetchPutAwayCount()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'product_locations' },
                () => fetchPutAwayCount()
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    const handleSignOut = () => {
        const portalUrl = import.meta.env.VITE_PORTAL_URL || 'http://localhost:5173';
        window.location.href = portalUrl;
    };

    const operationsNav = [
        { path: '/gestion/ingreso', icon: ArrowDownCircle, label: 'Recepción', color: 'text-emerald-500' },
        { path: '/gestion/salida', icon: ArrowUpCircle, label: 'Despacho', color: 'text-orange-500' },
        {
            path: '/gestion/orden',
            icon: ClipboardList,
            label: 'Put Away',
            color: 'text-blue-500',
            badge: pendingPutAway
        },
        { path: '/gestion/traspasos', icon: ArrowRightLeft, label: 'Traspasos', color: 'text-purple-500' },
        { path: '/gestion/ajustes', icon: AlertTriangle, label: 'Ajustes / Mermas', color: 'text-red-500' },
        {
            path: '/gestion/solicitudes',
            icon: UserCheck,
            label: 'Solicitudes RRHH',
            color: 'text-indigo-500',
            badge: pendingCount
        },
    ];

    const analyticsNav = [
        { path: '/gestion/visor', icon: Layers, label: 'Visor de Inventario' },
        { path: '/gestion/reportes', icon: FileBarChart, label: 'Reportes' },
    ];

    const configNav = [
        { path: '/gestion/catalogo', icon: Package, label: 'Catálogo' },
        { path: '/gestion/bodegas', icon: Warehouse, label: 'Bodegas' },
        { path: '/gestion/ubicaciones', icon: Grid, label: 'Ubicaciones' },
        { path: '/gestion/proveedores', icon: Truck, label: 'Proveedores' },
        { path: '/gestion/proyectos', icon: Settings, label: 'Proyectos' },
    ];

    const NavItem = ({ item, compact = false }) => (
        <NavLink
            to={item.path}
            onClick={() => window.innerWidth < 1024 && toggleSidebar()}
            className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group
                ${isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
                ${(compact || collapsed) ? 'py-2 justify-center' : ''}
            `}
            title={collapsed ? item.label : ''} // Tooltip simple nativo
        >
            <item.icon size={(compact || collapsed) ? 20 : 18} className={`${item.color || ''} shrink-0`} />

            {!collapsed && <span className="flex-1 truncate animate-in fade-in duration-200">{item.label}</span>}

            {/* Badge */}
            {item.badge > 0 && (
                <span className={`
                    absolute bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse
                    ${collapsed
                        ? 'top-1 right-1 w-2.5 h-2.5 p-0 border-2 border-slate-900'
                        : 'right-2 top-1/2 -translate-y-1/2 min-w-[20px] h-5 px-1.5'
                    }
                `}>
                    {!collapsed && item.badge}
                </span>
            )}

            {/* Tooltip Personalizado al Colapsar */}
            {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700">
                    {item.label}
                    {item.badge > 0 && <span className="ml-1 opacity-75">({item.badge})</span>}
                </div>
            )}
        </NavLink>
    );

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={toggleSidebar}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 z-50 h-screen bg-gradient-to-b from-slate-900 to-slate-950 text-white transition-all duration-300 ease-out shadow-2xl
                    ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    ${collapsed ? 'w-20' : 'w-64'}
                `}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className={`h-16 flex items-center px-4 border-b border-slate-800/50 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                        {!collapsed && (
                            <div className="flex items-center gap-3 animate-in fade-in">
                                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center font-bold text-xs shadow-lg">
                                    📦
                                </div>
                                <div className="overflow-hidden">
                                    <span className="text-lg font-bold tracking-tight block leading-none">Logística</span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">SOMYL S.A.</p>
                                </div>
                            </div>
                        )}

                        {/* Desktop Toggle */}
                        <button
                            onClick={toggleCollapse}
                            className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ${collapsed ? 'mx-auto' : ''}`}
                            title={collapsed ? "Expandir menú" : "Contraer menú"}
                        >
                            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                        </button>

                        {/* Mobile Close */}
                        <button onClick={toggleSidebar} className="ml-auto lg:hidden p-1 hover:bg-slate-800 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-6 custom-scrollbar">

                        {/* Dashboard */}
                        <NavLink
                            to="/gestion"
                            end
                            onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all group relative
                                ${isActive
                                    ? 'bg-white/10 text-white border border-white/10'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }
                                ${collapsed ? 'justify-center' : ''}
                            `}
                        >
                            <LayoutDashboard size={20} />
                            {!collapsed && <span className="animate-in fade-in">Panel de Control</span>}
                            {collapsed && (
                                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700">
                                    Panel de Control
                                </div>
                            )}
                        </NavLink>

                        {/* Operations Section */}
                        <div>
                            {!collapsed && (
                                <div className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2 animate-in fade-in">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                    Operaciones
                                </div>
                            )}
                            {collapsed && <div className="w-8 mx-auto h-[1px] bg-slate-800 mb-3"></div>}

                            <div className="space-y-1">
                                {operationsNav.map((item) => (
                                    <NavItem key={item.path} item={item} />
                                ))}
                            </div>
                        </div>

                        {/* Analytics Section */}
                        <div>
                            {!collapsed && (
                                <div className="px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2 animate-in fade-in">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                    Consultas
                                </div>
                            )}
                            {collapsed && <div className="w-8 mx-auto h-[1px] bg-slate-800 mb-3"></div>}

                            <div className="space-y-1">
                                {analyticsNav.map((item) => (
                                    <NavItem key={item.path} item={item} />
                                ))}
                            </div>
                        </div>

                        {/* Config Section (Collapsible) */}
                        <div>
                            {!collapsed ? (
                                <button
                                    onClick={() => setConfigOpen(!configOpen)}
                                    className="w-full px-3 mb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2 hover:text-slate-300 transition-colors"
                                >
                                    <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
                                    Configuración
                                    <ChevronDown
                                        size={14}
                                        className={`ml-auto transition-transform ${configOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>
                            ) : (
                                <div className="w-8 mx-auto h-[1px] bg-slate-800 mb-3"></div>
                            )}

                            {(configOpen || collapsed) && (
                                <div className={`space-y-1 animate-in slide-in-from-top-2 duration-200 ${collapsed ? '' : 'pl-2'}`}>
                                    {configNav.map((item) => (
                                        <NavItem key={item.path} item={item} compact={!collapsed} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-800/50">
                        <button
                            onClick={handleSignOut}
                            className={`flex items-center gap-3 px-3 py-2.5 w-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium group relative ${collapsed ? 'justify-center' : ''}`}
                        >
                            <LogOut size={18} />
                            {!collapsed && <span>Salir al Portal</span>}

                            {collapsed && (
                                <div className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-xl border border-slate-700">
                                    Cerrar Sesión
                                </div>
                            )}
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
