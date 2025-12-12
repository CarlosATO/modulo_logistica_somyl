import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Building2, Trash2, Plus, ArrowLeft } from 'lucide-react';

const ThirdPartySettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newRut, setNewRut] = useState('');
  const [orgId, setOrgId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
      if (profile) {
          setOrgId(profile.organization_id);
          const { data } = await supabase.from('logis_third_parties').select('*').eq('organization_id', profile.organization_id).order('name');
          setOwners(data || []);
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [user]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const handleCreate = async (e) => {
      e.preventDefault();
      if (!newName) return;
      try {
          const { error } = await supabase.from('logis_third_parties').insert({
              organization_id: orgId,
              name: newName,
              rut: newRut
          });
          if (error) throw error;
          setNewName(''); setNewRut(''); fetchData();
      } catch (error) { alert(error.message); }
  };

  const handleDelete = async (id) => {
      if(!window.confirm("¿Eliminar este dueño externo?")) return;
      try {
          await supabase.from('logis_third_parties').delete().eq('id', id);
          fetchData();
      } catch (error) { alert("No se puede eliminar si tiene productos asignados."); }
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8">
      <div className="max-w-4xl mx-auto">
        
        <div className="flex justify-between items-center mb-8">
            <div>
                <h2 className="text-3xl font-bold text-stone-800 flex items-center gap-2">
                    <Building2 className="text-purple-600" /> Dueños Externos
                </h2>
                <p className="text-stone-500 mt-1">Empresas propietarias de activos en custodia.</p>
            </div>
            <button onClick={() => navigate('/')} className="px-4 py-2 bg-white border rounded-lg text-stone-600 hover:bg-stone-100 font-medium flex items-center gap-2">
                <ArrowLeft size={16}/> Volver
            </button>
        </div>

        {/* Formulario */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 mb-8">
            <h3 className="font-bold text-stone-700 mb-4">Registrar Nueva Empresa</h3>
            <form onSubmit={handleCreate} className="flex gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-stone-500 mb-1">Nombre Fantasía / Razón Social</label>
                    <input className="w-full border p-2 rounded" placeholder="Ej: Codelco División Norte" value={newName} onChange={e => setNewName(e.target.value)} required />
                </div>
                <div className="w-48">
                    <label className="block text-xs font-bold text-stone-500 mb-1">RUT (Opcional)</label>
                    <input className="w-full border p-2 rounded" placeholder="76.xxx.xxx-x" value={newRut} onChange={e => setNewRut(e.target.value)} />
                </div>
                <button className="bg-purple-600 text-white px-6 py-2 rounded font-bold hover:bg-purple-700 h-[42px] flex items-center gap-2">
                    <Plus size={18} /> Agregar
                </button>
            </form>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-stone-100 text-xs uppercase font-bold text-stone-500">
                    <tr><th className="p-4">Nombre Empresa</th><th className="p-4">RUT</th><th className="p-4 text-right">Acciones</th></tr>
                </thead>
                <tbody className="divide-y">
                    {owners.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-stone-400">No hay empresas registradas.</td></tr>}
                    {owners.map(o => (
                        <tr key={o.id} className="hover:bg-stone-50">
                            <td className="p-4 font-medium text-stone-800">{o.name}</td>
                            <td className="p-4 text-stone-600 font-mono text-sm">{o.rut || '-'}</td>
                            <td className="p-4 text-right">
                                <button onClick={() => handleDelete(o.id)} className="text-stone-400 hover:text-red-600 transition-colors"><Trash2 size={18} /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ThirdPartySettings;