import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Trash2, ArrowLeft, Phone, User, Search, LayoutGrid, List as ListIcon } from 'lucide-react';

const SupplierSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS DE VISTA Y FILTRO ---
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [searchTerm, setSearchTerm] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ 
      business_name: '', rut: '', contact_name: '', phone: ''
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) {
          const { data, error } = await supabase
            .from('global_suppliers')
            .select('*')
            .eq('organization_id', profile.organization_id)
            .order('business_name');
          
          if (error) throw error;
          setSuppliers(data || []);
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) fetchSuppliers(); }, [user, fetchSuppliers]);

  // --- FILTRADO ---
  const filteredSuppliers = useMemo(() => {
      return suppliers.filter(s => 
        s.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.rut.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [suppliers, searchTerm]);

  const handleSave = async (e) => {
      e.preventDefault();
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          const { error } = await supabase.from('global_suppliers').insert({
              organization_id: profile.organization_id,
              ...formData,
              delivery_terms: 'Por definir', payment_terms: 'Por definir'
          });

          if (error) throw error;
          alert("Proveedor registrado exitosamente.");
          setFormData({ business_name: '', rut: '', contact_name: '', phone: '' });
          setShowModal(false);
          fetchSuppliers();
      } catch (error) { alert("Error: " + error.message); }
  };

  const handleDelete = async (id) => {
      if(!window.confirm("¿Eliminar proveedor?")) return;
      try {
          const { error } = await supabase.from('global_suppliers').delete().eq('id', id);
          if (error) throw error;
          fetchSuppliers();
      } catch (error) { alert("No se puede eliminar: Tiene registros asociados."); }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-6xl mx-auto">

        {/* TOOLBAR DE FILTROS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-2.5 text-stone-400" size={18} />
                <input 
                    type="text" placeholder="Buscar por Razón Social, RUT o Contacto..." 
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-stone-300 rounded-lg w-full focus:ring-2 focus:ring-orange-500 outline-none text-sm"
                />
            </div>
            
            <div className="flex bg-stone-100 p-1 rounded-lg">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}><LayoutGrid size={18} /></button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-orange-600' : 'text-stone-400'}`}><ListIcon size={18} /></button>
            </div>
        </div>

        {/* --- VISTA GRILLA --- */}
        {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSuppliers.map(s => (
                    <div key={s.id} className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-all group relative">
                        <h3 className="text-lg font-bold text-stone-800 mb-1">{s.business_name}</h3>
                        <p className="text-xs font-mono text-stone-400 bg-stone-50 inline-block px-1 rounded mb-4">RUT: {s.rut}</p>
                        <div className="space-y-2 text-sm text-stone-600 border-t border-stone-100 pt-3">
                            <div className="flex items-center gap-2"><User size={14} className="text-orange-500"/> <span className="font-medium">{s.contact_name || 'Sin contacto'}</span></div>
                            <div className="flex items-center gap-2"><Phone size={14} className="text-orange-500"/> {s.phone || '-'}</div>
                        </div>
                        <button onClick={() => handleDelete(s.id)} className="absolute top-4 right-4 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18} /></button>
                    </div>
                ))}
            </div>
        )}

        {/* --- VISTA LISTA --- */}
        {viewMode === 'list' && (
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-stone-50 text-xs uppercase font-bold text-stone-500 border-b">
                        <tr>
                            <th className="p-4">RUT</th>
                            <th className="p-4">Razón Social</th>
                            <th className="p-4">Contacto</th>
                            <th className="p-4">Teléfono</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-sm">
                        {filteredSuppliers.map(s => (
                            <tr key={s.id} className="hover:bg-stone-50">
                                <td className="p-4 font-mono text-stone-500">{s.rut}</td>
                                <td className="p-4 font-bold text-stone-800">{s.business_name}</td>
                                <td className="p-4 text-stone-600">{s.contact_name || '-'}</td>
                                <td className="p-4 text-stone-600">{s.phone || '-'}</td>
                                <td className="p-4 text-right"><button onClick={() => handleDelete(s.id)} className="text-stone-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}

        {filteredSuppliers.length === 0 && !loading && <div className="mt-8 text-center text-stone-400 italic">No se encontraron proveedores.</div>}

        {/* Modal Creación */}
        {showModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in">
                    <div className="p-5 border-b bg-stone-50 flex justify-between items-center"><h3 className="font-bold text-lg text-stone-800">Nuevo Proveedor</h3><button onClick={() => setShowModal(false)} className="text-stone-400 hover:text-red-500 font-bold text-xl">×</button></div>
                    <form onSubmit={handleSave} className="p-6 grid grid-cols-2 gap-4">
                        <div className="col-span-2 md:col-span-1"><label className="block text-xs font-bold text-stone-500 mb-1">Razón Social</label><input required className="w-full border p-2 rounded-lg" placeholder="Ej: Sodimac S.A." value={formData.business_name} onChange={e => setFormData({...formData, business_name: e.target.value})} /></div>
                        <div className="col-span-2 md:col-span-1"><label className="block text-xs font-bold text-stone-500 mb-1">RUT</label><input required className="w-full border p-2 rounded-lg" placeholder="77.123.456-7" value={formData.rut} onChange={e => setFormData({...formData, rut: e.target.value})} /></div>
                        <div className="col-span-2 border-t my-2"></div>
                        <div className="col-span-2 md:col-span-1"><label className="block text-xs font-bold text-stone-500 mb-1">Nombre Contacto</label><input className="w-full border p-2 rounded-lg" placeholder="Ej: Juan Vendedor" value={formData.contact_name} onChange={e => setFormData({...formData, contact_name: e.target.value})} /></div>
                        <div className="col-span-2 md:col-span-1"><label className="block text-xs font-bold text-stone-500 mb-1">Teléfono</label><input className="w-full border p-2 rounded-lg" placeholder="+569..." value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
                        <div className="col-span-2 pt-4"><button className="w-full bg-stone-900 text-white py-3 rounded-lg font-bold hover:bg-black shadow-lg">Guardar Proveedor</button></div>
                    </form>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default SupplierSettings;