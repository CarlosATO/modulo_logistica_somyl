import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Package, FileText, Download, Truck, HardHat, User, Plus, Trash2, XCircle, MapPin, X, CheckCircle } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import DispatchPDF from '../components/DispatchPDF';
import DispatchHistory from '../components/DispatchHistory'; // Componente Historial Externo

// --- COMPONENTE: BUSCADOR INTELIGENTE ---
const ProductSearchCombobox = ({ onSelect, warehouseId }) => {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    useEffect(() => {
        if (!search || search.length < 2) { setResults([]); return; }
        const doSearch = async () => {
            const { data } = await supabase.from('logis_inventory')
                .select('product:product_id!inner(id, name, sku, unit, category, standard_cost), current_stock')
                .eq('warehouse_id', warehouseId)
                .gt('current_stock', 0)
                .ilike('product.name', `%${search}%`)
                .limit(15);
            
            const uniqueMap = new Map();
            const uniqueList = [];
            if (data) {
                data.forEach(item => {
                    if (item.product && !uniqueMap.has(item.product.id)) {
                        uniqueMap.set(item.product.id, true);
                        const totalStock = data.filter(d => d.product.id === item.product.id).reduce((sum, r) => sum + r.current_stock, 0);
                        uniqueList.push({ ...item.product, total_stock: totalStock });
                    }
                });
            }
            setResults(uniqueList);
        };
        const timeout = setTimeout(doSearch, 300);
        return () => clearTimeout(timeout);
    }, [search, warehouseId]);

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-stone-400" size={16} />
                <input 
                    className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Escribe para buscar material..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    disabled={!warehouseId}
                />
            </div>
            {isOpen && results.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-stone-200 shadow-xl max-h-60 overflow-y-auto rounded-b-lg mt-1">
                    {results.map(p => (
                        <div key={p.id} onClick={() => { onSelect(p); setSearch(''); setIsOpen(false); }} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-stone-50 last:border-0 text-sm group">
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-stone-800 group-hover:text-orange-700">{p.name}</span>
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold">Total: {p.total_stock} {p.unit}</span>
                            </div>
                            <div className="text-xs text-stone-500 font-mono mt-0.5">SKU: {p.sku}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- MODAL DE PICKING ---
const PickingModal = ({ product, locations, onClose, onConfirm, suggestedPrice }) => {
    const [picks, setPicks] = useState({});
    const totalSelected = Object.values(picks).reduce((sum, val) => sum + (Number(val) || 0), 0);

    const handleInputChange = (locId, value, maxStock) => {
        let numValue = parseFloat(value);
        if (isNaN(numValue)) numValue = 0;
        if (numValue < 0) numValue = 0;
        if (numValue > maxStock) numValue = maxStock;
        setPicks(prev => ({ ...prev, [locId]: numValue }));
    };

    const handleConfirm = () => {
        if (totalSelected <= 0) return alert("Debe seleccionar al menos una cantidad.");
        const selectedItems = locations.filter(l => picks[l.location.id] > 0).map(l => ({
                location: l.location,
                quantity: picks[l.location.id]
        }));
        onConfirm(selectedItems);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-stone-200 flex flex-col max-h-[90vh]">
                <div className="p-5 border-b bg-stone-50 flex justify-between items-center flex-none">
                    <div>
                        <h3 className="font-bold text-lg text-stone-800 flex items-center gap-2">
                            <Package size={20} className="text-orange-600"/> 
                            Distribución de Retiro
                        </h3>
                        <div className="flex items-center gap-4 mt-1">
                            <span className="text-sm font-bold text-stone-600">{product.name}</span>
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold border border-emerald-200">
                                Costo Sugerido: ${suggestedPrice?.toLocaleString() || 0}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-stone-400 hover:text-red-500 transition-colors"><X size={28}/></button>
                </div>
                <div className="p-0 overflow-y-auto flex-grow bg-white">
                    {locations.length === 0 ? <div className="p-10 text-center text-stone-400 italic">No se encontraron ubicaciones con stock.</div> : (
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-stone-100 text-xs font-bold text-stone-500 uppercase sticky top-0 z-10 shadow-sm">
                                <tr><th className="p-4 border-b w-1/2">Ubicación / Zona</th><th className="p-4 border-b text-center text-blue-600 w-1/4">Stock Actual</th><th className="p-4 border-b text-center bg-orange-50 text-orange-700 w-1/4">A Retirar</th></tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {locations.map(l => {
                                    const withdraw = picks[l.location.id] || '';
                                    const isSelected = Number(withdraw) > 0;
                                    return (
                                        <tr key={l.location.id} className={`transition-colors ${isSelected ? 'bg-orange-50/30' : 'hover:bg-stone-50'}`}>
                                            <td className="p-4 align-middle">
                                                <div className="font-bold text-stone-700 text-sm">
                                                    {l.location.name || l.location.zone} 
                                                    {l.location.section && ` - ${l.location.section}`} 
                                                    {l.location.level && ` - ${l.location.level}`}
                                                </div>
                                                <div className="text-xs text-stone-400 font-mono mt-0.5 flex items-center gap-2">
                                                    {l.location.full_code || 'S/C'}
                                                    {l.location.is_staging && <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">Recepción</span>}
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-middle"><span className="font-mono font-bold text-blue-600 text-lg block">{l.current_stock}</span><span className="text-[10px] text-stone-400 uppercase">{product.unit}</span></td>
                                            <td className="p-4 text-center align-middle bg-orange-50/50 border-l border-stone-100">
                                                <div className="flex flex-col items-center gap-1"><input type="number" min="0" max={l.current_stock} value={withdraw} onChange={(e) => handleInputChange(l.location.id, e.target.value, l.current_stock)} placeholder="0" className={`w-20 text-center p-2 rounded-lg border-2 outline-none font-bold text-lg transition-all ${isSelected ? 'border-orange-500 text-orange-700 bg-white shadow-sm' : 'border-stone-200 text-stone-400 bg-white focus:border-orange-400'}`} /></div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="p-5 border-t bg-stone-50 flex justify-between items-center flex-none shadow-inner">
                    <div className="text-stone-400 text-xs hidden sm:block"><p>El stock se reservará temporalmente al agregar.</p></div>
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-end">
                        <div className="text-right"><p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Total a Retirar</p><p className="text-2xl font-black text-stone-800 leading-none">{totalSelected} <span className="text-sm font-normal text-stone-500">{product.unit}</span></p></div>
                        <button onClick={handleConfirm} disabled={totalSelected <= 0} className="bg-stone-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95 flex items-center gap-2"><Plus size={18}/> Agregar</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const OutboundDispatch = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('NEW');
  
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [header, setHeader] = useState({ warehouse_id: '', project_id: '', receiver_id: '', destination_zone: '' });
  const [items, setItems] = useState([]); 
  
  const [showPickingModal, setShowPickingModal] = useState(false);
  const [pickingProduct, setPickingProduct] = useState(null);
  const [pickingLocations, setPickingLocations] = useState([]);
  const [suggestedPrice, setSuggestedPrice] = useState(0);

  // ESTADO DE ÉXITO: Aquí guardamos los datos para el PDF sin salir de la pantalla
  const [lastDispatchData, setLastDispatchData] = useState(null);

  // 1. Carga Maestros
  useEffect(() => {
      const load = async () => {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          const orgId = profile.organization_id;
          const [w, p, e] = await Promise.all([
              supabase.from('logis_warehouses').select('*').eq('organization_id', orgId).eq('is_active', true).order('name'),
              supabase.from('global_projects').select('*').eq('organization_id', orgId).eq('status', 'ACTIVE').order('name'),
              supabase.from('rrhh_employees').select('id, first_name, last_name, rut').eq('organization_id', orgId).order('first_name')
          ]);
          setWarehouses(w.data || []); setProjects(p.data || []); setEmployees(e.data || []);
          if(w.data?.[0]) setHeader(prev => ({...prev, warehouse_id: w.data[0].id}));
      };
      if(user) load();
  }, [user]);

  // 2. BUSCAR UBICACIONES
  const handleSelectProduct = async (product) => {
      setPickingProduct(product);
      try {
          const { data: locations, error: locError } = await supabase.from('logis_inventory')
              .select(`current_stock, location:location_id (id, zone, section, level, full_code, is_staging)`)
              .eq('warehouse_id', header.warehouse_id).eq('product_id', product.id).gt('current_stock', 0).order('current_stock', { ascending: false });
          if (locError) throw locError;

          let detectedPrice = 0;
          const { data: lastEntry } = await supabase.from('logis_inbound_items').select('unit_price').eq('product_id', product.id).gt('unit_price', 0).order('created_at', { ascending: false }).limit(1);
          if (lastEntry && lastEntry.length > 0) detectedPrice = lastEntry[0].unit_price;

          setSuggestedPrice(detectedPrice);
          setPickingLocations(locations ? locations.filter(d => d.location) : []);
          setShowPickingModal(true);
      } catch (err) { console.error("Error:", err); alert("Error al cargar datos."); }
  };

  const confirmAddItem = (selectedItems) => {
      const newLines = selectedItems.map(selection => ({
          product: pickingProduct,
          location: selection.location,
          quantity: selection.quantity,
          unit_cost: suggestedPrice,
          total: selection.quantity * suggestedPrice
      }));
      setItems(prevItems => [...prevItems, ...newLines]);
      setShowPickingModal(false); setPickingProduct(null);
  };

  // 4. GUARDAR SALIDA
  const handleSave = async () => {
      if(!header.project_id || !header.receiver_id || items.length === 0) return alert("Faltan datos obligatorios.");
      if(!window.confirm("¿Confirmar Entrega de Materiales?")) return;

      try {
        const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
        const totalCost = items.reduce((sum, i) => sum + i.total, 0);

        const { data: doc, error: docError } = await supabase.from('logis_outbound_documents').insert({
            organization_id: profile.organization_id, warehouse_id: header.warehouse_id,
            project_id: header.project_id, receiver_id: header.receiver_id,
            destination_zone: header.destination_zone, total_cost: totalCost, created_by: user.id
        }).select().single();
        if(docError) throw docError;

        const itemsData = items.map(i => ({ outbound_id: doc.id, product_id: i.product.id, location_id: i.location.id, quantity: i.quantity, unit_cost: i.unit_cost }));
        await supabase.from('logis_outbound_items').insert(itemsData);

        const movementsData = items.map(i => ({
            organization_id: profile.organization_id, warehouse_id: header.warehouse_id, product_id: i.product.id, location_id: i.location.id,
            movement_type: 'OUT', quantity: i.quantity, assigned_to_employee_id: header.receiver_id, user_id: user.id,
            comments: `Vale #${doc.document_number} / ${header.destination_zone}`
        }));
        await supabase.from('logis_movements').insert(movementsData);

        // --- PREPARAR VISTA DE ÉXITO (PDF) ---
        // Esto reemplaza la redirección al historial
        const warehouseName = warehouses.find(w => w.id === header.warehouse_id)?.name;
        const projectName = projects.find(p => p.id === header.project_id)?.name;
        const receiverEmp = employees.find(e => e.id === header.receiver_id);
        const receiverName = receiverEmp ? `${receiverEmp.first_name} ${receiverEmp.last_name}` : 'Desconocido';

        setLastDispatchData({
            document_number: doc.document_number,
            dispatch_date: new Date().toLocaleDateString(),
            warehouse_name: warehouseName,
            project_name: projectName,
            receiver_name: receiverName,
            receiver_rut: receiverEmp?.rut,
            destination_zone: header.destination_zone,
            total_cost: totalCost,
            items: items.map(i => ({
                product_name: i.product.name,
                location_name: i.location.zone || i.location.name,
                quantity: i.quantity,
                unit_cost: i.unit_cost,
                total: i.total
            }))
        });

        // Limpiamos el carro pero NO cambiamos de modo
        setItems([]);

      } catch (error) { alert(error.message); }
  };

  const handleNewDispatch = () => {
      setLastDispatchData(null); setItems([]); setHeader({ ...header, destination_zone: '' });
  };

  return (
    <div className="min-h-screen bg-stone-50 p-8 font-sans text-stone-800">
      <div className="max-w-6xl mx-auto">

        {/* MODO: NUEVA SALIDA */}
        {mode === 'NEW' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                        <h3 className="font-bold text-stone-700 mb-4 flex gap-2 border-b pb-2"><FileText size={18}/> Datos de Entrega</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 md:col-span-1"><label className="label-logis">Bodega Origen</label><select className="input-logis font-bold" value={header.warehouse_id} onChange={e => setHeader({...header, warehouse_id: e.target.value})}>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
                            <div className="col-span-2 md:col-span-1"><label className="label-logis">Proyecto Destino</label><select className="input-logis" value={header.project_id} onChange={e => setHeader({...header, project_id: e.target.value})}><option value="">-- Seleccionar --</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                            <div className="col-span-2 md:col-span-1"><label className="label-logis">Solicitante (Trabajador)</label><select className="input-logis" value={header.receiver_id} onChange={e => setHeader({...header, receiver_id: e.target.value})}><option value="">-- Seleccionar --</option>{employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}</select></div>
                            <div className="col-span-2 md:col-span-1"><label className="label-logis">Lugar de Uso / Referencia</label><input className="input-logis" placeholder="Ej: Piso 3" maxLength={50} value={header.destination_zone} onChange={e => setHeader({...header, destination_zone: e.target.value})} /></div>
                        </div>
                    </div>

                    {/* PICKING (Se oculta si hay éxito) */}
                    <div className={`bg-white p-6 rounded-xl shadow-sm border border-stone-200 ${lastDispatchData ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <h3 className="font-bold text-stone-700 mb-4 flex gap-2 border-b pb-2"><Package size={18}/> Selección de Material</h3>
                        <div className="py-4">
                            <label className="label-logis mb-2">Buscar Producto (Stock Disponible)</label>
                            <ProductSearchCombobox warehouseId={header.warehouse_id} onSelect={handleSelectProduct} />
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: RESUMEN / ÉXITO */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl shadow-lg border overflow-hidden sticky top-24">
                        
                        {/* --- VISTA DE ÉXITO (PDF) --- */}
                        {lastDispatchData ? (
                            <div className="p-6 text-center animate-fade-in bg-stone-50">
                                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-emerald-200"><CheckCircle size={32} /></div>
                                <h3 className="text-xl font-bold text-stone-800">¡Salida Exitosa!</h3>
                                <p className="text-sm text-stone-500 mb-6 font-mono bg-white inline-block px-3 py-1 rounded border border-stone-200 mt-2">Vale #{lastDispatchData.document_number}</p>
                                
                                <div className="space-y-3">
                                    <PDFDownloadLink 
                                        document={<DispatchPDF data={lastDispatchData} />} 
                                        fileName={`Vale_Salida_${lastDispatchData.document_number}.pdf`}
                                        className="w-full bg-stone-900 text-white py-3 rounded-xl font-bold hover:bg-black shadow-lg flex justify-center items-center gap-2 transition-transform active:scale-95"
                                    >
                                        {({ loading }) => loading ? 'Generando...' : <><Download size={18}/> Descargar Vale PDF</>}
                                    </PDFDownloadLink>
                                    
                                    <button 
                                        onClick={handleNewDispatch} 
                                        className="w-full bg-white border-2 border-stone-200 text-stone-600 py-3 rounded-xl font-bold hover:bg-stone-50 flex justify-center items-center gap-2 transition-colors"
                                    >
                                        <Plus size={18}/> Ingresar Siguiente
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // --- VISTA NORMAL (CARRO) ---
                            <>
                                <div className="bg-stone-100 p-4 font-bold text-stone-700 border-b">Resumen de Salida</div>
                                <div className="p-4 min-h-[200px] max-h-[400px] overflow-y-auto">
                                    {items.length === 0 && <p className="text-center text-stone-400 text-sm italic mt-10">Carro vacío.</p>}
                                    <ul className="space-y-3">
                                        {items.map((item, idx) => (
                                            <li key={idx} className="flex justify-between text-sm border-b pb-2 items-center">
                                                <div>
                                                    <div className="font-bold text-stone-800">{item.product.name}</div>
                                                    <div className="text-xs text-stone-500 flex items-center gap-1"><MapPin size={10}/> {item.location.zone}</div>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="font-bold text-stone-900">{item.quantity} {item.product.unit}</div>
                                                    <div className="flex items-center gap-1 mt-1"><span className="text-[10px] text-stone-400">$</span><input type="number" className="w-16 text-right border rounded px-1 py-0.5 text-xs font-mono" value={item.unit_cost} onChange={(e) => { const val = Number(e.target.value); const newItems = [...items]; newItems[idx].unit_cost = val; newItems[idx].total = val * newItems[idx].quantity; setItems(newItems); }} /></div>
                                                    <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:underline mt-1">Quitar</button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="p-4 bg-stone-50 border-t space-y-3">
                                     <button onClick={handleSave} className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 shadow-lg active:scale-95 transition-transform">CONFIRMAR SALIDA</button>
                                     <button onClick={() => navigate('/inventory')} className="w-full bg-white border border-stone-300 text-stone-600 py-2 rounded-lg font-medium hover:bg-stone-100 flex justify-center items-center gap-2 text-sm"><XCircle size={14}/> Cancelar</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}

        {showPickingModal && pickingProduct && (
            <PickingModal product={pickingProduct} locations={pickingLocations} onClose={() => { setShowPickingModal(false); setPickingProduct(null); }} onConfirm={confirmAddItem} suggestedPrice={suggestedPrice} />
        )}

        {/* MODO: HISTORIAL CONECTADO (Usando el componente externo) */}
        {mode === 'HISTORY' && <DispatchHistory />}
      </div>
      <style>{` .label-logis { display: block; font-size: 0.75rem; font-weight: 700; color: #78716c; margin-bottom: 0.25rem; text-transform: uppercase; } .input-logis { width: 100%; border: 1px solid #d6d3d1; padding: 0.5rem; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: all 0.2s; } .input-logis:focus { border-color: #f97316; ring: 2px; ring-color: #fdba74; } `}</style>
    </div>
  );
};

export default OutboundDispatch;