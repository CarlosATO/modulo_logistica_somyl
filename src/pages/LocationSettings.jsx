import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Warehouse, MapPin, Plus, Trash2, ArrowLeft, Grid, QrCode, Printer, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const LocationSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ zone: '', section: '', level: '' });
  const [labelData, setLabelData] = useState(null);

  // 1. Cargar Bodegas
  useEffect(() => {
      const load = async () => {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          const { data } = await supabase.from('logis_warehouses').select('*').eq('organization_id', profile.organization_id).eq('is_active', true).order('name');
          setWarehouses(data || []);
          if(data?.[0]) setSelectedWarehouse(data[0].id);
      };
      if(user) load();
  }, [user]);

  // 2. Cargar Ubicaciones
  const fetchLocations = useCallback(async () => {
      if (!selectedWarehouse) return;
      setLoading(true);
      const { data } = await supabase.from('logis_locations').select('*').eq('warehouse_id', selectedWarehouse).order('is_staging', { ascending: false }).order('zone').order('section').order('level');
      setLocations(data || []);
      setLoading(false);
  }, [selectedWarehouse]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // 3. Generar Código
  const generateCode = () => {
      const whCode = warehouses.find(w => w.id === selectedWarehouse)?.code || 'WH';
      const z = formData.zone.toUpperCase().replace(/\s+/g, '').slice(0, 4);
      const s = formData.section.toUpperCase().replace(/\s+/g, '').slice(0, 3);
      const l = formData.level.toUpperCase().replace(/\s+/g, '').slice(0, 3);
      return `${whCode}-${z}-${s}-${l}`;
  };

  // 4. Crear
  const handleCreate = async (e) => {
      e.preventDefault();
      if(!formData.zone) return;
      const fullCode = generateCode();
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          const { error } = await supabase.from('logis_locations').insert({
              organization_id: profile.organization_id, warehouse_id: selectedWarehouse,
              zone: formData.zone.toUpperCase(), section: formData.section.toUpperCase() || 'GEN',
              level: formData.level.toUpperCase() || '0', full_code: fullCode, is_staging: false
          });
          if(error) throw error;
          setFormData({ zone: '', section: '', level: '' }); fetchLocations();
      } catch(err) { alert(err.message); }
  };

  const handleDelete = async (id, isStaging) => {
      if(isStaging) return alert("No puedes borrar la zona de Recepción.");
      if(!confirm("¿Borrar ubicación?")) return;
      try {
          const { error } = await supabase.from('logis_locations').delete().eq('id', id);
          if(error) throw error;
          fetchLocations();
      } catch(err) { alert("No se puede borrar si tiene stock."); }
  };

  const printLabel = () => {
      const printContent = document.getElementById('printable-label');
      const windowUrl = 'about:blank';
      const windowName = 'Print' + new Date().getTime();
      const printWindow = window.open(windowUrl, windowName, 'left=50000,top=50000,width=0,height=0');
      printWindow.document.write(`<html><head><style>body{font-family:sans-serif;text-align:center;margin:0;padding:10px;}.label{border:2px solid black;padding:10px;display:inline-block;width:300px;}h1{font-size:24px;margin:5px 0;}p{font-size:14px;margin:0;color:#555;}</style></head><body>${printContent.innerHTML}<script>window.onload=function(){window.print();window.close();}</script></body></html>`);
      printWindow.document.close();
      printWindow.focus();
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">
      
      {/* TOPBAR ESTÁNDAR */}
      <div className="bg-white border-b border-stone-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-700 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
                    <Grid size={20} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-stone-900">Mapa de Bodega</h1>
                    <p className="text-xs text-stone-500 font-medium">Configuración de Ubicaciones</p>
                </div>
            </div>
            
            {/* BOTÓN VOLVER CORREGIDO: Va a Put-Away */}
            <button 
                onClick={() => navigate('/inventory/putaway')} 
                className="px-4 py-2 bg-white border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-100 font-medium text-sm transition-all flex items-center gap-2"
            >
                <ArrowLeft size={16}/> Volver a Ordenamiento
            </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUMNA IZQUIERDA */}
            <div className="lg:col-span-4 space-y-6">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200">
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Bodega Activa</label>
                    <div className="flex items-center gap-3 p-2 bg-stone-50 rounded-lg border border-stone-100">
                        <Warehouse className="text-stone-500" size={20} />
                        <select className="w-full bg-transparent font-bold text-stone-800 outline-none cursor-pointer" value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)}>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg border border-orange-100">
                    <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Plus size={18} className="text-orange-500"/> Nueva Ubicación</h3>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div><label className="block text-xs font-bold text-stone-500 mb-1">Zona / Pasillo</label><input placeholder="Ej: PASILLO A" className="w-full border p-2 rounded bg-stone-50 focus:bg-white transition-colors uppercase" value={formData.zone} onChange={e => setFormData({...formData, zone: e.target.value})} required /></div>
                        <div className="grid grid-cols-2 gap-2">
                            <div><label className="block text-xs font-bold text-stone-500 mb-1">Sección</label><input placeholder="Ej: SEC-1" className="w-full border p-2 rounded bg-stone-50 focus:bg-white transition-colors uppercase" value={formData.section} onChange={e => setFormData({...formData, section: e.target.value})} required /></div>
                            <div><label className="block text-xs font-bold text-stone-500 mb-1">Nivel</label><input placeholder="Ej: N2" className="w-full border p-2 rounded bg-stone-50 focus:bg-white transition-colors uppercase" value={formData.level} onChange={e => setFormData({...formData, level: e.target.value})} required /></div>
                        </div>
                        <div className="bg-stone-900 p-3 rounded-lg text-center mt-2"><p className="text-[10px] text-stone-400 uppercase tracking-widest mb-1">Código Generado</p><p className="text-white font-mono text-lg tracking-wider font-bold">{formData.zone ? generateCode() : '---'}</p></div>
                        <button className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 shadow-md transition-transform active:scale-95">Crear Ubicación</button>
                    </form>
                </div>
            </div>

            {/* COLUMNA DERECHA */}
            <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden flex flex-col">
                <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
                    <h3 className="font-bold text-stone-600 text-sm uppercase tracking-wider">Ubicaciones Existentes ({locations.length})</h3>
                </div>
                <div className="flex-grow overflow-y-auto max-h-[600px]">
                    <ul className="divide-y divide-stone-100">
                        {locations.map(loc => (
                            <li key={loc.id} className="p-4 hover:bg-stone-50 transition-colors group">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-lg ${loc.is_staging ? 'bg-blue-100 text-blue-600' : 'bg-stone-100 text-stone-500'}`}>{loc.is_staging ? <Warehouse size={20}/> : <MapPin size={20}/>}</div>
                                        <div>
                                            <div className="flex items-center gap-2"><span className="font-bold text-stone-800 text-lg">{loc.zone}</span>{loc.is_staging && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold border border-blue-200">RECEPCIÓN</span>}</div>
                                            <div className="text-xs text-stone-500 font-mono flex gap-3 mt-0.5"><span>SEC: {loc.section || '-'}</span><span>NIV: {loc.level || '-'}</span><span className="text-orange-600 font-bold">ID: {loc.full_code || '-'}</span></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setLabelData(loc)} className="p-2 bg-white border border-stone-200 rounded hover:bg-blue-50 text-stone-500 hover:text-blue-600 shadow-sm" title="Ver Etiqueta"><QrCode size={16} /></button>
                                        {!loc.is_staging && <button onClick={() => handleDelete(loc.id, loc.is_staging)} className="p-2 bg-white border border-red-100 rounded hover:bg-red-50 text-red-400 hover:text-red-600 shadow-sm"><Trash2 size={16}/></button>}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>

        {/* MODAL QR */}
        {labelData && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in relative">
                    <button onClick={() => setLabelData(null)} className="absolute top-3 right-3 text-stone-400 hover:text-stone-600"><X size={24}/></button>
                    <div id="printable-label" className="p-8 flex flex-col items-center text-center bg-white">
                        <h2 className="text-2xl font-black text-stone-900 mb-1 uppercase tracking-wide">{labelData.full_code}</h2>
                        <p className="text-sm text-stone-500 mb-6">{labelData.zone} - {labelData.section} - {labelData.level}</p>
                        <div className="border-4 border-stone-900 p-2 rounded-xl mb-4 bg-white"><QRCodeSVG value={labelData.full_code} size={180} /></div>
                        <p className="text-[10px] text-stone-400 font-mono">SISTEMA LOGÍSTICO</p>
                    </div>
                    <div className="p-4 bg-stone-50 border-t flex gap-2">
                        <button onClick={() => setLabelData(null)} className="flex-1 py-3 bg-white border border-stone-300 text-stone-600 font-bold rounded-xl hover:bg-stone-100">Cerrar</button>
                        <button onClick={printLabel} className="flex-1 py-3 bg-stone-900 text-white font-bold rounded-xl hover:bg-black shadow-lg flex justify-center items-center gap-2"><Printer size={18}/> Imprimir</button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default LocationSettings;