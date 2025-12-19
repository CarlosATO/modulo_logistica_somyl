import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Warehouse, MapPin, Plus, Trash2, ArrowLeft, Grid, QrCode, Printer, X, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Combobox from '../components/Combobox';

export default function LocationSettings() {
  const navigate = useNavigate();
  
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Formulario para nueva ubicación
  const [formData, setFormData] = useState({ zone: '', row: '', shelf: '' });
  
  // Estado para el Modal de Etiqueta
  const [labelData, setLabelData] = useState(null);

  // 1. Cargar Bodegas al inicio
  useEffect(() => {
      const loadWarehouses = async () => {
          const { data } = await supabase
            .from('warehouses')
            .select('*')
            .eq('is_active', true)
            .order('name');
          
          setWarehouses(data || []);
          if(data?.[0]) setSelectedWarehouse(data[0].id);
      };
      loadWarehouses();
  }, []);

  // 2. Cargar Ubicaciones cuando cambia la bodega
  const fetchLocations = useCallback(async () => {
      if (!selectedWarehouse) return;
      setLoading(true);
      const { data } = await supabase
        .from('locations')
        .select('*')
        .eq('warehouse_id', selectedWarehouse)
        .order('full_code', { ascending: true });
      
      setLocations(data || []);
      setLoading(false);
  }, [selectedWarehouse]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // 3. Generar Código Visual (Previsualización)
  const generateCode = () => {
      const wh = warehouses.find(w => w.id === selectedWarehouse);
      const whPrefix = wh ? (wh.code || 'BOD') : 'XXX';
      
      const z = formData.zone.trim().toUpperCase().slice(0, 3) || '000';
      const r = formData.row.trim().toUpperCase().slice(0, 3) || '000';
      const s = formData.shelf.trim().toUpperCase().slice(0, 3) || '000';
      
      return `${whPrefix}-${z}-${r}-${s}`;
  };

  // 4. Guardar Ubicación
  const handleCreate = async (e) => {
      e.preventDefault();
      if(!selectedWarehouse) return alert("Selecciona una bodega primero.");

      const fullCode = generateCode();

      try {
          const { error } = await supabase.from('locations').insert({
              warehouse_id: selectedWarehouse,
              zone: formData.zone.toUpperCase(), 
              row: formData.row.toUpperCase(),
              shelf: formData.shelf.toUpperCase(), 
              full_code: fullCode
          });

          if(error) throw error;
          
          setFormData({ zone: '', row: '', shelf: '' }); 
          fetchLocations();
          alert("✅ Ubicación creada");

      } catch(err) { 
          console.error(err);
          alert("Error: Es posible que el código ya exista."); 
      }
  };

  // 5. Borrar Ubicación
  const handleDelete = async (id) => {
      if(!window.confirm("¿Borrar esta ubicación? Asegúrate de que esté vacía.")) return;
      
      try {
          const { error } = await supabase.from('locations').delete().eq('id', id);
          if(error) throw error;
          fetchLocations();
      } catch(err) { 
          alert("No se pudo borrar (probablemente tenga stock asociado)."); 
      }
  };

  // 6. Imprimir Etiqueta
  const printLabel = () => {
      const printContent = document.getElementById('printable-label');
      const windowUrl = 'about:blank';
      const windowName = 'Print' + new Date().getTime();
      const printWindow = window.open(windowUrl, windowName, 'left=50000,top=50000,width=0,height=0');
      
      printWindow.document.write(`
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; text-align: center; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .label { border: 2px solid black; padding: 20px; width: 300px; }
                    h1 { font-size: 32px; margin: 10px 0; font-weight: 900; }
                    p { font-size: 16px; margin: 0; color: #333; }
                </style>
            </head>
            <body>
                ${printContent.innerHTML}
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Grid className="text-orange-600"/> Mapa de Bodega
            </h1>
            <p className="text-xs text-slate-500">Configuración de Pasillos y Estanterías</p>
        </div>
        
        {/* Selector de Bodega */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Warehouse size={16} className="text-slate-400"/>
            <Combobox
                options={warehouses}
                selected={selectedWarehouse}
                onChange={setSelectedWarehouse}
                placeholder="Seleccionar Bodega"
            />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* IZQUIERDA: Formulario Creación */}
            <div className="lg:col-span-4 space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-lg border border-orange-100 sticky top-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Plus size={18} className="text-orange-500"/> Nueva Ubicación
                    </h3>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Zona / Pasillo</label>
                            <input 
                                placeholder="Ej: PASILLO-A" 
                                className="w-full border p-2 rounded-lg bg-slate-50 focus:bg-white uppercase focus:ring-2 focus:ring-orange-200 transition-all" 
                                value={formData.zone} 
                                onChange={e => setFormData({...formData, zone: e.target.value})} 
                                required 
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Fila / Sección</label>
                                <input 
                                    placeholder="Ej: 01" 
                                    className="w-full border p-2 rounded-lg bg-slate-50 uppercase" 
                                    value={formData.row} 
                                    onChange={e => setFormData({...formData, row: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Nivel / Altura</label>
                                <input 
                                    placeholder="Ej: N1" 
                                    className="w-full border p-2 rounded-lg bg-slate-50 uppercase" 
                                    value={formData.shelf} 
                                    onChange={e => setFormData({...formData, shelf: e.target.value})} 
                                    required 
                                />
                            </div>
                        </div>
                        
                        {/* Previsualización */}
                        <div className="bg-slate-800 p-3 rounded-lg text-center mt-2">
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Código Resultante</p>
                            <p className="text-white font-mono text-lg tracking-wider font-bold">
                                {selectedWarehouse ? generateCode() : 'Selecciona Bodega'}
                            </p>
                        </div>
                        
                        <button className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 shadow-md flex justify-center gap-2">
                            <Save size={18}/> Guardar Ubicación
                        </button>
                    </form>
                </div>
            </div>

            {/* DERECHA: Lista de Ubicaciones */}
            <div className="lg:col-span-8">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-600 text-sm uppercase tracking-wider">
                            Ubicaciones ({locations.length})
                        </h3>
                    </div>
                    
                    <div className="flex-grow overflow-y-auto p-2">
                        {loading ? (
                            <p className="text-center py-10 text-slate-400">Cargando mapa...</p>
                        ) : locations.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg m-4">
                                <MapPin size={32} className="mx-auto mb-2 opacity-50"/>
                                <p>Esta bodega aún no tiene mapa configurado.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {locations.map(loc => (
                                    <div key={loc.id} className="p-3 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all group bg-white flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-100 rounded text-slate-500">
                                                <MapPin size={18}/>
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-800 font-mono text-sm">{loc.full_code}</div>
                                                <div className="text-[10px] text-slate-500">
                                                    {loc.zone} • Fila {loc.row} • Nivel {loc.shelf}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button 
                                                onClick={() => setLabelData(loc)} 
                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                title="Código QR"
                                            >
                                                <QrCode size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(loc.id)} 
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
      </div>

      {/* MODAL QR (Para imprimir) */}
      {labelData && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-200 relative">
                    <button onClick={() => setLabelData(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X size={24}/></button>
                    
                    <div id="printable-label" className="p-8 flex flex-col items-center text-center bg-white">
                        <div className="border-4 border-black p-4 rounded-xl bg-white mb-4">
                            <QRCodeSVG value={labelData.full_code} size={150} />
                        </div>
                        <h2 className="text-3xl font-black text-black mb-1 uppercase tracking-widest font-mono">{labelData.full_code}</h2>
                        <p className="text-sm text-black font-bold mb-2">ZONA {labelData.zone}</p>
                        <p className="text-xs text-slate-500 uppercase">Propiedad de Somyl Logística</p>
                    </div>

                    <div className="p-4 bg-slate-50 border-t flex gap-2">
                        <button onClick={() => setLabelData(null)} className="flex-1 py-3 bg-white border border-slate-300 text-slate-600 font-bold rounded-xl hover:bg-slate-100">Cerrar</button>
                        <button onClick={printLabel} className="flex-1 py-3 bg-black text-white font-bold rounded-xl hover:bg-slate-800 shadow-lg flex justify-center items-center gap-2">
                            <Printer size={18}/> Imprimir
                        </button>
                    </div>
                </div>
            </div>
      )}

    </div>
  );
}