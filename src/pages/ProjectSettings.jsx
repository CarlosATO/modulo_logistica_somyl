import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { HardHat, Plus, Trash2, ArrowLeft, MapPin, Search, LayoutGrid, List as ListIcon, Briefcase, User } from 'lucide-react';

const ProjectSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- VISTAS Y FILTROS ---
  const [viewMode, setViewMode] = useState('list'); // 'grid' | 'list'
  const [searchTerm, setSearchTerm] = useState('');

  // Estado Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ 
      name: '', code: '', status: 'ACTIVE',
      address: '', client_name: '', manager_name: '' 
  });

  // 1. Cargar Proyectos
  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) {
          const { data, error } = await supabase
            .from('global_projects')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .order('created_at', { ascending: false });
          
          if (error) throw error;
          setProjects(data || []);
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) fetchProjects(); }, [user, fetchProjects]);

  // 2. Filtrado en Tiempo Real (Esto faltaba o fallaba antes)
  const filteredProjects = useMemo(() => {
      return projects.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [projects, searchTerm]);

  // 3. Handlers
  const handleSave = async (e) => {
      e.preventDefault();
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          const { error } = await supabase.from('global_projects').insert({ organization_id: profile.organization_id, ...formData });
          if (error) throw error;
          
          alert("Proyecto creado."); 
          setShowModal(false); 
          setFormData({ name: '', code: '', status: 'ACTIVE', address: '', client_name: '', manager_name: '' }); 
          fetchProjects();
      } catch (error) { alert(error.message); }
  };

  const handleDelete = async (id) => {
      if(!window.confirm("¿Borrar proyecto?")) return;
      try { await supabase.from('global_projects').delete().eq('id', id); fetchProjects(); } catch { alert("No se puede borrar si tiene movimientos."); }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-6xl mx-auto"> {/* Ancho corregido a 6xl para que sea más amplio */}

        {/* Toolbar de Filtros */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 text-stone-400" size={18} />
                <input 
                    type="text" placeholder="Buscar Proyecto, Código o Cliente..." 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-stone-300 rounded-lg w-full focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                />
            </div>
            
            {/* Selector de Vistas */}
            <div className="flex bg-stone-100 p-1 rounded-lg">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}>
                    <LayoutGrid size={18} />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}>
                    <ListIcon size={18} />
                </button>
            </div>
        </div>

        {/* --- VISTA LISTA (Tabla) --- */}
        {viewMode === 'list' && (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-stone-100 text-xs uppercase font-bold text-stone-500 border-b">
                        <tr>
                            <th className="p-4">Código</th>
                            <th className="p-4">Nombre Proyecto</th>
                            <th className="p-4">Cliente</th>
                            <th className="p-4">Encargado</th>
                            <th className="p-4">Estado</th>
                            <th className="p-4 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-sm">
                        {filteredProjects.map(p => (
                            <tr key={p.id} className="hover:bg-stone-50">
                                <td className="p-4 font-mono text-stone-500 font-bold">{p.code}</td>
                                <td className="p-4 font-bold text-stone-800">
                                    {p.name}
                                    <div className="text-xs text-stone-400 font-normal mt-1 flex items-center gap-1"><MapPin size={10}/> {p.address || 'Sin dirección'}</div>
                                </td>
                                <td className="p-4 text-stone-600">{p.client_name || '-'}</td>
                                <td className="p-4 text-stone-600">{p.manager_name || '-'}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'}`}>
                                        {p.status === 'ACTIVE' ? 'En Ejecución' : 'Finalizado'}
                                    </span>
                                </td>
                                <td className="p-4 text-right"><button onClick={() => handleDelete(p.id)} className="text-stone-400 hover:text-red-600 transition-colors"><Trash2 size={16}/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {/* --- VISTA GRILLA (Tarjetas) --- */}
        {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(p => (
                    <div key={p.id} className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-all group relative">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-bold text-stone-900">{p.name}</h3>
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                {p.status === 'ACTIVE' ? 'Activo' : 'Fin'}
                            </span>
                        </div>
                        
                        <p className="text-xs font-mono text-stone-400 bg-stone-50 inline-block px-2 py-0.5 rounded border border-stone-100 mb-4">
                            CC: {p.code || 'S/N'}
                        </p>
                        
                        <div className="space-y-2 text-sm text-stone-600 pt-2 border-t border-stone-100">
                            <div className="flex items-center gap-2">
                                <Briefcase size={14} className="text-orange-500"/> 
                                <span className="font-medium">Cliente: {p.client_name || 'Interno'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <User size={14} className="text-orange-500"/> 
                                <span>Jefe: {p.manager_name || '-'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-stone-400 text-xs">
                                <MapPin size={12}/> 
                                <span className="truncate">{p.address || 'Sin dirección'}</span>
                            </div>
                        </div>

                        <button onClick={() => handleDelete(p.id)} className="absolute bottom-4 right-4 text-stone-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 size={18}/>
                        </button>
                    </div>
                ))}
            </div>
        )}

        {/* Empty State */}
        {filteredProjects.length === 0 && !loading && (
            <div className="mt-12 text-center border-2 border-dashed border-stone-200 rounded-xl p-12">
                <p className="text-stone-400 italic mb-2">No se encontraron proyectos.</p>
                <button onClick={() => setShowModal(true)} className="text-orange-600 font-bold hover:underline text-sm">Crear el primero</button>
            </div>
        )}

        {/* MODAL CREACIÓN */}
        {showModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-fade-in">
                    <div className="p-6 border-b bg-stone-50 flex justify-between items-center">
                        <h3 className="font-bold text-xl text-stone-800">Crear Nuevo Proyecto</h3>
                        <button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-red-500 font-bold text-2xl">&times;</button>
                    </div>
                    
                    <form onSubmit={handleSave} className="p-8 grid grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Nombre Proyecto / Obra</label>
                            <input required className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ej: Edificio Centro" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Código Interno (CC)</label>
                            <input className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none font-mono" placeholder="PRY-001" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} />
                        </div>
                        
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Dirección de la Obra</label>
                            <input className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Av. Principal 123, Comuna..." value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                        </div>

                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Cliente Mandante</label>
                            <input className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Ej: Inmobiliaria S.A." value={formData.client_name} onChange={e => setFormData({...formData, client_name: e.target.value})} />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs font-bold text-stone-500 mb-1 uppercase">Encargado de Obra</label>
                            <input className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" placeholder="Nombre del Jefe" value={formData.manager_name} onChange={e => setFormData({...formData, manager_name: e.target.value})} />
                        </div>

                        <div className="col-span-2 pt-4 flex justify-end gap-3 border-t border-stone-100 mt-2">
                             <button type="button" onClick={() => setShowModal(false)} className="px-6 py-3 rounded-lg text-stone-600 font-bold hover:bg-stone-100 transition-colors">Cancelar</button>
                            <button className="bg-stone-900 text-white px-8 py-3 rounded-lg font-bold hover:bg-black shadow-lg transition-transform active:scale-95">Crear Proyecto</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSettings;