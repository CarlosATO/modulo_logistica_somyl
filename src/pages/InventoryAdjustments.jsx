import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import Combobox from '../components/Combobox';
import GoogleSearchBar from '../components/GoogleSearchBar';
import { toast } from 'sonner';
import { 
  AlertTriangle, CheckCircle, UploadCloud, Camera, MapPin, 
  Box, FileText, X, ArrowUpCircle, ArrowDownCircle, Loader 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryAdjustments() {
  const { user } = useAuth();
  
  // --- Estados Maestros ---
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]); // Todas las ubicaciones de la bodega seleccionada
  
  // --- Estados de Formulario ---
  const [adjustmentType, setAdjustmentType] = useState('DECREASE'); // 'INCREASE' (Sobrante) o 'DECREASE' (Merma)
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedProject, setSelectedProject] = useState(''); // <--- CRÍTICO: Asociar ajuste a proyecto
  const [selectedProduct, setSelectedProduct] = useState(null); // Objeto completo del producto
  const [targetLocation, setTargetLocation] = useState('');
  
  // --- Estados Específicos de Ajuste ---
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('');
  const [comments, setComments] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);
  
  // --- UI ---
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [rackStockOptions, setRackStockOptions] = useState([]); // Solo para DECREASE (donde hay stock)

  // 1. Cargar Maestros
  useEffect(() => {
    const fetchMasters = async () => {
        const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(wh || []);
        
        const { data: prj } = await supabaseProcurement.from('proyectos').select('id, proyecto, cliente').eq('activo', true);
        setProjects(prj || []);
    };
    fetchMasters();
  }, []);

  // 2. Cargar Ubicaciones al cambiar Bodega
  useEffect(() => {
      if(!selectedWarehouse) {
          setLocations([]);
          return;
      }
      const fetchLocs = async () => {
          // Traemos todas las ubicaciones para INCREASE (donde poner el hallazgo)
          const { data } = await supabase.from('locations').select('*').eq('warehouse_id', selectedWarehouse).order('full_code');
          setLocations(data || []);
      };
      fetchLocs();
  }, [selectedWarehouse]);

  // 3. Buscar Producto (Lógica dual: Increase busca en todo, Decrease busca en stock físico)
  const handleSearchProduct = async (term) => {
      if(!selectedWarehouse) return toast.error("Selecciona una bodega primero");
      if(!selectedProject) return toast.error("Selecciona el proyecto afectado");

      setLoading(true);
      setSelectedProduct(null);
      setRackStockOptions([]);
      
      try {
          if (adjustmentType === 'INCREASE') {
              // Búsqueda global (Catálogo)
              const { data } = await supabase.from('products').select('*').ilike('name', `%${term}%`).limit(10);
              if(data?.length === 1) setSelectedProduct(data[0]);
              else if(data?.length > 1) toast.info("Sé más específico, hay varios resultados.");
              else toast.warning("Producto no encontrado en catálogo.");
              
          } else {
              // Búsqueda en Stock Físico (Solo lo que existe en racks)
              // 1. Buscar IDs de productos con nombre similar
              const { data: prods } = await supabase.from('products').select('id, name, code').ilike('name', `%${term}%`);
              if(!prods?.length) { setLoading(false); return toast.warning("No encontrado."); }
              
              const prodIds = prods.map(p => p.id);

              // 2. Buscar si tienen stock en esta bodega
              const { data: stock } = await supabase.from('product_locations')
                .select('*, locations(full_code), products(name, code, unit)')
                .eq('warehouse_id', selectedWarehouse)
                .in('product_id', prodIds)
                .gt('quantity', 0);
                
              if(stock?.length > 0) {
                  // Mapeamos las opciones disponibles para restar
                  const options = stock.map(item => ({
                      stockId: item.id,
                      productId: item.product_id,
                      productName: item.products.name,
                      productCode: item.products.code,
                      locationId: item.location_id,
                      locationName: item.locations.full_code,
                      quantity: item.quantity,
                      unit: item.products.unit
                  }));
                  setRackStockOptions(options);
                  // Si solo hay uno, pre-seleccionar? No, mejor que elija usuario.
              } else {
                  toast.warning("El producto existe pero NO tiene stock físico en esta bodega para ajustar.");
              }
          }
      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  // Función para seleccionar una opción de stock (Solo Decrease)
  const selectRackOption = (opt) => {
      setSelectedProduct({ id: opt.productId, name: opt.productName, code: opt.productCode });
      setTargetLocation(opt.locationId);
      // Validar que no reste más de lo que hay
      setQuantity(''); 
  };

  const handleSubmit = async () => {
      // Validaciones
      if (!selectedWarehouse || !selectedProject || !selectedProduct || !quantity || !reason || !targetLocation) {
          return toast.error("⚠️ Faltan campos obligatorios.");
      }
      
      // Validar archivo si es pérdida (Recomendado)
      if (adjustmentType === 'DECREASE' && !evidenceFile) {
          if(!confirm("⚠️ ¿Registrar pérdida sin foto de evidencia?")) return;
      }

      setProcessing(true);
      try {
          // 1. Subir Evidencia
          let evidenceUrl = null;
          if (evidenceFile) {
              const fileName = `ADJ-${Date.now()}.${evidenceFile.name.split('.').pop()}`;
              await supabase.storage.from('documents').upload(fileName, evidenceFile);
              evidenceUrl = fileName;
          }

          // 2. Ejecutar RPC
          const { error } = await supabase.rpc('process_inventory_adjustment', {
              p_warehouse_id: selectedWarehouse,
              p_product_id: selectedProduct.id,
              p_qty: Number(quantity),
              p_type: adjustmentType,
              p_reason: reason,
              p_location_id: targetLocation,
              p_comments: comments || '',
              p_user_email: user?.email,
              p_project_id: String(selectedProject), // <--- IMPORTANTE: ID DEL PROYECTO
              p_evidence_url: evidenceUrl
          });

          if (error) throw error;

          toast.success("✅ Ajuste procesado correctamente.");
          
          // Reset Form
          setQuantity('');
          setReason('');
          setComments('');
          setEvidenceFile(null);
          setSelectedProduct(null);
          setRackStockOptions([]);
          setTargetLocation('');

      } catch (err) {
          console.error(err);
          toast.error(`Error: ${err.message}`);
      } finally {
          setProcessing(false);
      }
  };

  return (
    <div className="pb-20 max-w-4xl mx-auto space-y-6">
      
      {/* HEADER TIPO PESTAÑAS */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="grid grid-cols-2">
              <button 
                onClick={() => { setAdjustmentType('DECREASE'); setSelectedProduct(null); setRackStockOptions([]); }}
                className={`p-6 flex flex-col items-center gap-2 transition-all ${adjustmentType === 'DECREASE' ? 'bg-red-50 text-red-600 border-b-4 border-red-500' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                  <ArrowDownCircle size={32}/>
                  <span className="font-bold uppercase tracking-wider">Pérdida / Merma</span>
              </button>
              <button 
                onClick={() => { setAdjustmentType('INCREASE'); setSelectedProduct(null); setRackStockOptions([]); }}
                className={`p-6 flex flex-col items-center gap-2 transition-all ${adjustmentType === 'INCREASE' ? 'bg-emerald-50 text-emerald-600 border-b-4 border-emerald-500' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                  <ArrowUpCircle size={32}/>
                  <span className="font-bold uppercase tracking-wider">Hallazgo / Sobrante</span>
              </button>
          </div>
      </div>

      {/* FORMULARIO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6 animate-in fade-in">
          
          {/* 1. Contexto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Combobox 
                  options={warehouses} 
                  value={selectedWarehouse} 
                  onChange={setSelectedWarehouse} 
                  label="Bodega Afectada"
                  placeholder="-- Seleccionar Bodega --"
              />
              <Combobox 
                  options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))} 
                  value={selectedProject} 
                  onChange={setSelectedProject} 
                  label="Proyecto (Dueño del Stock)"
                  placeholder="-- Seleccionar Proyecto --"
              />
          </div>

          <div className="border-t border-slate-100 pt-6">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Producto a Ajustar</label>
             <GoogleSearchBar 
                placeholder={adjustmentType === 'INCREASE' ? "Buscar en catálogo general..." : "Buscar material en esta bodega..."}
                onSearch={handleSearchProduct}
                loading={loading}
             />
             
             {/* RESULTADOS DE BÚSQUEDA (SOLO PARA DECREASE) */}
             {adjustmentType === 'DECREASE' && rackStockOptions.length > 0 && (
                 <div className="mt-4 grid gap-2">
                     <p className="text-xs font-bold text-slate-400">Selecciona la ubicación exacta de donde descontar:</p>
                     {rackStockOptions.map(opt => (
                         <div 
                            key={opt.stockId} 
                            onClick={() => selectRackOption(opt)}
                            className={`p-3 border rounded-lg cursor-pointer flex justify-between items-center hover:bg-red-50 transition-all ${targetLocation === opt.locationId && selectedProduct?.id === opt.productId ? 'border-red-500 bg-red-50 ring-1 ring-red-200' : 'border-slate-200'}`}
                         >
                             <div>
                                 <div className="font-bold text-slate-700">{opt.productName}</div>
                                 <div className="text-xs text-slate-500 flex gap-2">
                                     <span>Ubic: <strong className="text-slate-800">{opt.locationName}</strong></span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <span className="block font-black text-lg text-slate-800">{opt.quantity} {opt.unit}</span>
                                 <span className="text-[10px] uppercase text-slate-400">Disponible</span>
                             </div>
                         </div>
                     ))}
                 </div>
             )}

             {/* RESULTADO (SOLO PARA INCREASE O YA SELECCIONADO) */}
             {selectedProduct && (
                 <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center animate-in zoom-in">
                     <div>
                         <p className="font-bold text-slate-800">{selectedProduct.name}</p>
                         <p className="text-xs text-slate-500 font-mono">{selectedProduct.code}</p>
                     </div>
                     <button onClick={() => { setSelectedProduct(null); setTargetLocation(''); }} className="text-slate-400 hover:text-red-500"><X/></button>
                 </div>
             )}
          </div>

          {/* 3. DETALLES DEL AJUSTE (Solo visible si hay producto y proyecto) */}
          {selectedProduct && selectedProject && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  
                  {/* SI ES INCREASE, NECESITAMOS PEDIR UBICACIÓN DESTINO */}
                  {adjustmentType === 'INCREASE' && (
                      <div className="md:col-span-2">
                          <Combobox
                              options={locations.map(l => ({ id: l.id, name: l.full_code }))}
                              value={targetLocation}
                              onChange={setTargetLocation}
                              label="¿Dónde se guardará el hallazgo?"
                              placeholder="-- Seleccionar Rack / Ubicación --"
                          />
                      </div>
                  )}

                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Motivo</label>
                      <select 
                        className="w-full border p-2.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 bg-white"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                      >
                          <option value="">-- Seleccionar --</option>
                          {adjustmentType === 'DECREASE' ? (
                              <>
                                <option value="Merma / Daño">Merma / Daño</option>
                                <option value="Robo / Pérdida">Robo / Pérdida</option>
                                <option value="Vencimiento">Vencimiento</option>
                                <option value="Error Inventario">Error de Conteo (Falta)</option>
                                <option value="Consumo Interno">Consumo Interno</option>
                              </>
                          ) : (
                              <>
                                <option value="Hallazgo">Hallazgo Físico</option>
                                <option value="Devolución Sin Papel">Devolución Obra (Sin Doc)</option>
                                <option value="Error Inventario">Error de Conteo (Sobra)</option>
                              </>
                          )}
                      </select>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cantidad a {adjustmentType === 'INCREASE' ? 'Sumar' : 'Descontar'}</label>
                      <input 
                        type="number" 
                        className="w-full border p-2 rounded-lg font-black text-xl text-center outline-none focus:border-blue-500"
                        placeholder="0"
                        value={quantity}
                        onChange={e => setQuantity(e.target.value)}
                      />
                  </div>

                  <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Comentarios / Observación</label>
                      <textarea 
                        className="w-full border p-2 rounded-lg outline-none focus:border-blue-500"
                        rows="2"
                        placeholder="Detalle de la incidencia..."
                        value={comments}
                        onChange={e => setComments(e.target.value)}
                      />
                  </div>

                  <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Evidencia Fotográfica / Acta</label>
                      <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${evidenceFile ? 'bg-emerald-50 border-emerald-400' : 'hover:bg-slate-50 border-slate-300'}`}>
                          {evidenceFile ? <CheckCircle className="text-emerald-500 mb-2" size={32}/> : <Camera className="text-slate-300 mb-2" size={32}/>}
                          <span className="text-sm font-bold text-slate-600">{evidenceFile ? evidenceFile.name : "Click para subir foto o documento"}</span>
                          <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => setEvidenceFile(e.target.files[0])} />
                      </label>
                  </div>

                  <div className="md:col-span-2 pt-4">
                      <button 
                        onClick={handleSubmit}
                        disabled={processing}
                        className={`w-full py-4 rounded-xl font-black text-white shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${adjustmentType === 'DECREASE' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                      >
                          {processing ? <Loader className="animate-spin"/> : (
                              <>
                                {adjustmentType === 'DECREASE' ? <AlertTriangle size={20}/> : <CheckCircle size={20}/>}
                                CONFIRMAR AJUSTE DE INVENTARIO
                              </>
                          )}
                      </button>
                  </div>

              </div>
          )}
      </div>
    </div>
  );
}