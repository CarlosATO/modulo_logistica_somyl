import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import {
  Package, ArrowDownCircle, ArrowUpCircle, ClipboardList,
  Warehouse, Layers, ArrowRightLeft, Calendar,
  FileBarChart, ArrowRight, LayoutDashboard,
  AlertTriangle, UserCheck, TrendingUp, AlertCircle,
  Clock, CheckCircle2, Loader2, Bell
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Dynamic Stats
  const [stats, setStats] = useState({
    pendingPutAway: 0,
    todayMovements: 0,
    pendingRRHH: 0,
    totalValuation: 0
  });

  // Activity Feed
  const [recentActivity, setRecentActivity] = useState([]);

  // Alerts
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const today = new Date().toISOString().split('T')[0];

        // 1. Pending Put Away (using same view as PutAway page)
        const { count: putAwayCount } = await supabase
          .from('view_pending_putaway')
          .select('*', { count: 'exact', head: true })
          .gt('pending_stock', 0);

        // 2. Today's Movements
        const { count: movementsCount } = await supabase
          .from('movements')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`);

        // 3. Pending RRHH Requests
        const { count: rrhhCount } = await supabase
          .from('material_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'PENDING');

        // 4. Total Valuation (sum of current_stock * price from products)
        const { data: valuationData } = await supabase
          .from('products')
          .select('current_stock, price');

        const totalVal = valuationData?.reduce((sum, p) => {
          return sum + (Number(p.current_stock || 0) * Number(p.price || 0));
        }, 0) || 0;

        setStats({
          pendingPutAway: putAwayCount || 0,
          todayMovements: movementsCount || 0,
          pendingRRHH: rrhhCount || 0,
          totalValuation: totalVal
        });

        // 5. Recent Activity (Last 5 movements)
        const { data: activityData } = await supabase
          .from('movements')
          .select('*, product:product_id(name, code)')
          .order('created_at', { ascending: false })
          .limit(5);
        setRecentActivity(activityData || []);

        // 6. Alerts (Low stock products)
        const { data: lowStockData } = await supabase
          .from('products')
          .select('id, name, code, current_stock, minimum_stock')
          .not('minimum_stock', 'is', null)
          .limit(3);

        const lowStockAlerts = (lowStockData || [])
          .filter(p => Number(p.current_stock) < Number(p.minimum_stock))
          .map(p => ({
            id: p.id,
            type: 'low_stock',
            message: `${p.name} bajo mínimo`,
            detail: `Stock: ${p.current_stock} / Mín: ${p.minimum_stock}`
          }));

        // Add Put Away alert if there are pending items
        if (putAwayCount > 0) {
          lowStockAlerts.unshift({
            id: 'putaway',
            type: 'putaway',
            message: 'Items sin ubicar',
            detail: `${putAwayCount} productos pendientes de Put Away`
          });
        }

        setAlerts(lowStockAlerts.slice(0, 3));

      } catch (error) {
        console.error("Error cargando dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  // Stats Cards Data
  const statsCards = [
    {
      title: 'Valorización',
      value: `$${stats.totalValuation.toLocaleString('es-CL')}`,
      icon: TrendingUp,
      color: 'bg-emerald-500',
      path: '/gestion/visor'
    },
    {
      title: 'Movimientos Hoy',
      value: stats.todayMovements,
      icon: ArrowRightLeft,
      color: 'bg-blue-500',
      path: '/gestion/historial-ingresos'
    },
    {
      title: 'Put Away Pendientes',
      value: stats.pendingPutAway,
      icon: ClipboardList,
      color: 'bg-orange-500',
      path: '/gestion/orden',
      alert: stats.pendingPutAway > 0
    },
    {
      title: 'Solicitudes RRHH',
      value: stats.pendingRRHH,
      icon: UserCheck,
      color: 'bg-indigo-500',
      path: '/gestion/solicitudes',
      alert: stats.pendingRRHH > 0
    }
  ];

  // Quick Actions
  const quickActions = [
    { title: 'Recepción', path: '/gestion/ingreso', icon: ArrowDownCircle, color: 'text-emerald-600 bg-emerald-50' },
    { title: 'Despacho', path: '/gestion/salida', icon: ArrowUpCircle, color: 'text-orange-600 bg-orange-50' },
    { title: 'Put Away', path: '/gestion/orden', icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
    { title: 'Traspasos', path: '/gestion/traspasos', icon: ArrowRightLeft, color: 'text-purple-600 bg-purple-50' },
    { title: 'Ajustes', path: '/gestion/ajustes', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    { title: 'Visor', path: '/gestion/visor', icon: Layers, color: 'text-cyan-600 bg-cyan-50' },
  ];

  const getMovementBadge = (type) => {
    switch (type) {
      case 'INBOUND': return { label: 'Ingreso', class: 'bg-emerald-100 text-emerald-700' };
      case 'OUTBOUND': return { label: 'Salida', class: 'bg-orange-100 text-orange-700' };
      case 'ADJUSTMENT': return { label: 'Ajuste', class: 'bg-amber-100 text-amber-700' };
      case 'TRANSFER': return { label: 'Traspaso', class: 'bg-purple-100 text-purple-700' };
      default: return { label: type, class: 'bg-slate-100 text-slate-600' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={40} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-7xl mx-auto px-2">

      {/* Header Compacto */}
      <div className="flex flex-row justify-between items-center gap-4 py-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <LayoutDashboard size={20} className="text-indigo-600" />
            Panel de Control
          </h1>
          <p className="text-xs text-slate-500">
            Hola, <span className="font-semibold text-slate-700">{user?.user_metadata?.full_name?.split(' ')[0] || 'Usuario'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          <Calendar size={14} />
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {/* Stats Cards - Más Compactas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsCards.map((stat, i) => (
          <div
            key={i}
            onClick={() => navigate(stat.path)}
            className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute -right-2 -top-2 opacity-5 group-hover:opacity-10 transition-opacity rotate-12">
              <stat.icon size={60} className="text-slate-900" />
            </div>

            <div className="relative z-10 flex flex-col h-full justify-between">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-8 h-8 ${stat.color} rounded-lg flex items-center justify-center text-white shadow-sm`}>
                  <stat.icon size={16} />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{stat.title}</p>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-lg md:text-xl font-bold text-slate-900 truncate">{stat.value}</span>
                {stat.alert && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full animate-pulse">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    Atención
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Quick Actions */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
            <ArrowRight size={16} className="text-indigo-500" />
            Acceso Rápido
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center justify-center p-3 rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-slate-50 hover:shadow-sm transition-all group h-24"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-1.5 ${action.color} bg-opacity-20 group-hover:scale-110 transition-transform`}>
                  <action.icon size={20} />
                </div>
                <span className="text-[10px] font-bold text-slate-600 text-center leading-tight">{action.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-slate-100">
              <AlertCircle size={16} className="text-orange-400" />
              Alertas del Sistema
            </h3>

            <div className="space-y-2">
              {alerts.length === 0 ? (
                <div className="text-slate-400 text-xs text-center py-6 bg-white/5 rounded-lg border border-white/5">
                  <CheckCircle2 size={24} className="mx-auto mb-1 opacity-50 text-emerald-400" />
                  <p>Todo operativo</p>
                </div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.id} className="p-2.5 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                    <p className="text-xs font-bold text-orange-200 mb-0.5">{alert.message}</p>
                    <p className="text-[10px] text-slate-400">{alert.detail}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {alerts.length > 0 && <div className="mt-3 text-[10px] text-slate-500 text-center">Revise los módulos afectados</div>}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Clock size={16} className="text-blue-500" />
            Actividad Reciente
          </h3>
          <button
            onClick={() => navigate('/gestion/historial-ingresos')}
            className="text-xs text-indigo-600 font-bold hover:underline"
          >
            Ver historial completo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recentActivity.length === 0 ? (
            <p className="text-slate-400 text-xs text-center py-4 col-span-full">No hay actividad reciente</p>
          ) : (
            recentActivity.map((mov) => {
              const badge = getMovementBadge(mov.type);
              return (
                <div key={mov.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 hover:border-indigo-200 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 shrink-0 bg-white border border-slate-200`}>
                    <Package size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-slate-800 truncate">{mov.product?.name || 'Producto'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md ${badge.class}`}>
                        {badge.label}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        {new Date(mov.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-slate-700">{mov.quantity}</span>
                    <p className="text-[9px] text-slate-400 uppercase">UNDS</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}