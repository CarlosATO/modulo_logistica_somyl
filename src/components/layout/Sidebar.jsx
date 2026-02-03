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
    Bell
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({ isOpen, toggleSidebar }) => {
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

    // Fetch pending Put Away items count - real-time only
    useEffect(() => {
        const fetchPutAwayCount = async () => {
            const { count } = await supabase
                .from('view_pending_putaway')
                .select('*', { count: 'exact', head: true })
                .gt('pending_stock', 0);
            setPendingPutAway(count || 0);
        };
        fetchPutAwayCount();

        // Subscribe to all relevant table changes
        const channel = supabase
            .channel('pending_putaway_updates')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'movements' },
                () => fetchPutAwayCount()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'product_locations' },
                () => fetchPutAwayCount()
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
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
        { path: '/gestion/historial-ingresos', icon: History, label: 'Historial Ingresos' },
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
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative
                ${isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-900/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }
                ${compact ? 'py-2' : ''}
            `}
        >
            <item.icon size={compact ? 16 : 18} className={item.color || ''} />
            <span className="flex-1">{item.label}</span>
            {item.badge > 0 && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 animate-pulse">
                    {item.badge}
                </span>
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
                className={`fixed top-0 left-0 z-50 h-screen w-64 bg-gradient-to-b from-slate-900 to-slate-950 text-white transition-transform duration-300 ease-out shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="h-16 flex items-center px-5 border-b border-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center font-bold text-sm shadow-lg">
                                📦
                            </div>
                            <div>
                                <span className="text-lg font-bold tracking-tight">Logística</span>
                                <p className="text-[10px] text-slate-500 -mt-0.5">SOMYL S.A.</p>
                            </div>
                        </div>
                        <button onClick={toggleSidebar} className="ml-auto lg:hidden p-1 hover:bg-slate-800 rounded-lg">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">

                        {/* Dashboard */}
                        <NavLink
                            to="/gestion"
                            end
                            onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all
                                ${isActive
                                    ? 'bg-white/10 text-white border border-white/10'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                }
                            `}
                        >
                            <LayoutDashboard size={20} />
                            Panel de Control
                        </NavLink>

                        {/* Operations Section */}
                        <div>
                            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                                Operaciones
                            </div>
                            <div className="space-y-1">
                                {operationsNav.map((item) => (
                                    <NavItem key={item.path} item={item} />
                                ))}
                            </div>
                        </div>

                        {/* Analytics Section */}
                        <div>
                            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                Consultas
                            </div>
                            <div className="space-y-1">
                                {analyticsNav.map((item) => (
                                    <NavItem key={item.path} item={item} />
                                ))}
                            </div>
                        </div>

                        {/* Config Section (Collapsible) */}
                        <div>
                            <button
                                onClick={() => setConfigOpen(!configOpen)}
                                className="w-full px-3 mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2 hover:text-slate-300 transition-colors"
                            >
                                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full"></span>
                                Configuración
                                <ChevronDown
                                    size={14}
                                    className={`ml-auto transition-transform ${configOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {configOpen && (
                                <div className="space-y-1 animate-in slide-in-from-top-2 duration-200">
                                    {configNav.map((item) => (
                                        <NavItem key={item.path} item={item} compact />
                                    ))}
                                </div>
                            )}
                        </div>
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-800/50">
                        <button
                            onClick={handleSignOut}
                            className="flex items-center gap-3 px-3 py-2.5 w-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium"
                        >
                            <LogOut size={18} />
                            Salir al Portal
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
