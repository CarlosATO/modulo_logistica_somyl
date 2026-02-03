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
      title: 'Put Away Pendiente',
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
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <LayoutDashboard className="text-indigo-600" />
            Panel de Control
          </h1>
          <p className="text-slate-500 mt-1">
            Bienvenido, <span className="font-semibold text-slate-700">{user?.user_metadata?.full_name || 'Usuario'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <Calendar size={16} />
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {statsCards.map((stat, i) => (
          <div
            key={i}
            onClick={() => navigate(stat.path)}
            className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon size={64} className="text-slate-900" />
            </div>

            <div className="relative z-10">
              <div className={`w-11 h-11 ${stat.color} rounded-xl flex items-center justify-center text-white shadow-lg mb-3`}>
                <stat.icon size={22} />
              </div>

              <p className="text-sm text-slate-500 font-medium">{stat.title}</p>
              <div className="flex items-end justify-between mt-1">
                <span className="text-2xl font-bold text-slate-900">{stat.value}</span>
                {stat.alert && (
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Quick Actions */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
            <ArrowRight size={20} className="text-indigo-500" />
            Acceso Rápido
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-md transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${action.color} group-hover:scale-110 transition-transform`}>
                  <action.icon size={24} />
                </div>
                <span className="text-xs font-bold text-slate-600 text-center">{action.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-orange-400" />
            Alertas
          </h3>

          <div className="space-y-3 flex-1">
            {alerts.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-8">
                <CheckCircle2 size={32} className="mx-auto mb-2 opacity-50" />
                <p>Todo en orden</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-sm font-bold text-orange-200">{alert.message}</p>
                  <p className="text-xs text-slate-400">{alert.detail}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Clock size={20} className="text-blue-500" />
            Actividad Reciente
          </h3>
          <button
            onClick={() => navigate('/gestion/historial-ingresos')}
            className="text-sm text-indigo-600 font-medium hover:underline"
          >
            Ver todo
          </button>
        </div>

        <div className="space-y-3">
          {recentActivity.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-6">No hay actividad reciente</p>
          ) : (
            recentActivity.map((mov) => {
              const badge = getMovementBadge(mov.type);
              return (
                <div key={mov.id} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                    <Package size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{mov.product?.name || 'Producto'}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(mov.created_at).toLocaleString('es-CL', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })} • Cant: {mov.quantity}
                    </p>
                  </div>
                  <span className={`px-3 py-1 text-xs font-bold rounded-full ${badge.class}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}