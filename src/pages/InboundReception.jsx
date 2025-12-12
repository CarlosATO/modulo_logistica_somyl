import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, CheckCircle, Plus, Trash2, FileText, Truck, HardHat, Warehouse, Calculator, Search, XCircle } from 'lucide-react';

// --- COMPONENTE: BUSCADOR INTELIGENTE DE PRODUCTOS ---
const ProductCombobox = ({ products, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // Filtrado en tiempo real
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        p.sku?.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (product) => {
        onSelect(product);
        setSearch(''); // Limpiar buscador
        setIsOpen(false); // Cerrar lista
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div className="relative">
                <Search className="absolute left-3 top-2.5 text-stone-400" size={16} />
                <input 
                    className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                    placeholder="Buscar por Nombre o SKU..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                />
            </div>

            {isOpen && search.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-stone-200 shadow-xl max-h-60 overflow-y-auto rounded-b-lg mt-1 animate-fade-in">
                    {filtered.length === 0 ? (
                        <div className="p-3 text-xs text-stone-400 italic text-center">No se encontraron productos.</div>
                    ) : (
                        filtered.map(p => (
                            <div 
                                key={p.id} 
                                className="p-3 hover:bg-orange-50 cursor-pointer border-b border-stone-50 last:border-0 transition-colors group"
                                onClick={() => handleSelect(p)}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-stone-800 text-sm group-hover:text-orange-700">{p.name}</span>
                                    <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 rounded text-stone-500 group-hover:bg-white">{p.unit}</span>
                                </div>
                                <div className="text-xs text-stone-400 font-mono mt-0.5 flex gap-2">
                                    <span>SKU: {p.sku || 'S/N'}</span>
                                    <span>•</span>
                                    <span>{p.category}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};


// --- COMPONENTE PRINCIPAL ---
const InboundReception = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Maestros
  const [suppliers, setSuppliers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);

  // Formulario Cabecera
  const [header, setHeader] = useState({
      document_type: 'FACTURA',
      document_number: '',
      supplier_id: '',
      project_id: '',
      warehouse_id: '',
      issue_date: new Date().toISOString().split('T')[0],
      notes: ''
  });

  // Ítems del Documento
  const [items, setItems] = useState([]);
  
  // Estado temporal para agregar ítem
  const [currentItem, setCurrentItem] = useState({ product: null, quantity: '', unit_price: '' });

  // Carga Inicial
  useEffect(() => {
      const loadMasters = async () => {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
          if (!profile) return;
          const orgId = profile.organization_id;

          const [sup, proj, ware, prod] = await Promise.all([
              supabase.from('global_suppliers').select('id, business_name, rut').eq('organization_id', orgId),
              supabase.from('global_projects').select('id, name, code').eq('organization_id', orgId).eq('status', 'ACTIVE'),
              supabase.from('logis_warehouses').select('id, name, type').eq('organization_id', orgId).eq('is_active', true),
              supabase.from('logis_products').select('id, name, sku, unit, category').eq('organization_id', orgId)
          ]);

          setSuppliers(sup.data || []);
          setProjects(proj.data || []);
          setWarehouses(ware.data || []);
          setProducts(prod.data || []);
      };
      if (user) loadMasters();
  }, [user]);

  // --- LÓGICA DE ÍTEMS ---
  const handleAddItem = (e) => {
      e.preventDefault();
      if (!currentItem.product || !currentItem.quantity || !currentItem.unit_price) return;
      
      const newItem = {
          ...currentItem,
          total: Number(currentItem.quantity) * Number(currentItem.unit_price)
      };

      setItems([...items, newItem]);
      // Limpiamos solo cantidad y precio, el producto se limpia al seleccionarse de nuevo
      setCurrentItem({ product: null, quantity: '', unit_price: '' }); 
  };

  const handleRemoveItem = (index) => {
      const newItems = [...items];
      newItems.splice(index, 1);
      setItems(newItems);
  };

  // Cálculos Totales
  const netTotal = items.reduce((sum, item) => sum + item.total, 0);
  const taxTotal = Math.round(netTotal * 0.19); 
  const grandTotal = netTotal + taxTotal;

  // --- GUARDAR Y PROCESAR ---
  const handleSave = async (status) => {
      if (!header.supplier_id) return alert("Falta el Proveedor");
      if (!header.warehouse_id) return alert("Falta la Bodega de Destino");
      if (!header.document_number) return alert("Falta el N° de Documento");
      if (items.length === 0) return alert("No hay productos en la lista");

      const isConfirmed = status === 'CONFIRMED';
      const msg = isConfirmed 
        ? "¿Confirmar Ingreso? Esto sumará el stock a la bodega seleccionada." 
        : "Se guardará como borrador.";
      
      if (!window.confirm(msg)) return;

      setLoading(true);
      try {
          const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();

          // 1. Guardar Cabecera
          const { data: doc, error: docError } = await supabase.from('logis_inbound_documents').insert({
              organization_id: profile.organization_id,
              supplier_id: header.supplier_id,
              project_id: header.project_id || null,
              warehouse_id: header.warehouse_id,
              received_by_user: user.id,
              document_type: header.document_type,
              document_number: header.document_number,
              issue_date: header.issue_date,
              net_total: netTotal,
              tax_total: taxTotal,
              grand_total: grandTotal,
              reception_status: status,
              notes: header.notes
          }).select().single();

          if (docError) throw docError;

          // 2. Guardar Ítems
          const itemsData = items.map(i => ({
              inbound_id: doc.id,
              product_id: i.product.id,
              quantity: i.quantity,
              unit_price: i.unit_price
          }));
          
          const { error: itemsError } = await supabase.from('logis_inbound_items').insert(itemsData);
          if (itemsError) throw itemsError;

          // 3. SI ES CONFIRMADO -> GENERAR MOVIMIENTOS (KARDEX)
          if (isConfirmed) {
              const movementsData = items.map(i => ({
                  organization_id: profile.organization_id,
                  warehouse_id: header.warehouse_id,
                  product_id: i.product.id,
                  movement_type: 'IN',
                  quantity: i.quantity,
                  user_id: user.id,
                  comments: `Ingreso ${header.document_type} #${header.document_number}`
              }));
              
              const { error: moveError } = await supabase.from('logis_movements').insert(movementsData);
              if (moveError) throw moveError;
          }

          alert("Operación exitosa.");
          navigate('/inventory'); // <--- CAMBIO: VOLVER A INVENTARIO

      } catch (error) {
          alert("Error: " + error.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">

      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* COLUMNA IZQUIERDA: FORMULARIO DE DATOS */}
          <div className="lg:col-span-2 space-y-6">
              
              {/* 1. Datos del Documento */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                  <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2 border-b pb-2">
                      <FileText size={18} className="text-orange-500"/> Datos del Documento
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                          <label className="label-logis">Tipo Documento</label>
                          <select className="input-logis" value={header.document_type} onChange={e => setHeader({...header, document_type: e.target.value})}>
                              <option value="FACTURA">Factura Electrónica</option>
                              <option value="GUIA">Guía de Despacho</option>
                              <option value="BOLETA">Boleta</option>
                          </select>
                      </div>
                      <div>
                          <label className="label-logis">N° Folio / Documento</label>
                          <input type="text" className="input-logis font-mono" placeholder="Ej: 12345" value={header.document_number} onChange={e => setHeader({...header, document_number: e.target.value})} />
                      </div>
                      <div>
                          <label className="label-logis">Fecha Emisión</label>
                          <input type="date" className="input-logis" value={header.issue_date} onChange={e => setHeader({...header, issue_date: e.target.value})} />
                      </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                          <label className="label-logis flex items-center gap-1"><Truck size={12}/> Proveedor</label>
                          <select className="input-logis" value={header.supplier_id} onChange={e => setHeader({...header, supplier_id: e.target.value})}>
                              <option value="">-- Seleccionar Proveedor --</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.business_name} ({s.rut})</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="label-logis flex items-center gap-1"><HardHat size={12}/> Proyecto / Obra (Opcional)</label>
                          <select className="input-logis" value={header.project_id} onChange={e => setHeader({...header, project_id: e.target.value})}>
                              <option value="">-- Stock General --</option>
                              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                      </div>
                      <div className="md:col-span-2">
                          <label className="label-logis flex items-center gap-1 text-orange-700"><Warehouse size={12}/> Bodega de Destino (Recepción Física)</label>
                          <select className="input-logis border-orange-300 bg-orange-50" value={header.warehouse_id} onChange={e => setHeader({...header, warehouse_id: e.target.value})}>
                              <option value="">-- Seleccionar Bodega --</option>
                              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
                          </select>
                      </div>
                  </div>
              </div>

              {/* 2. Ingreso de Productos (ALINEACIÓN CORREGIDA) */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-stone-200">
                  <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2 border-b pb-2">
                      <Plus size={18} className="text-emerald-500"/> Agregar Ítems
                  </h3>
                  
                  {/* Contenedor Flex con alineación al fondo (items-end) */}
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                      
                      <div className="flex-grow">
                          <label className="label-logis">Producto</label>
                          <ProductCombobox 
                              products={products} 
                              onSelect={(p) => setCurrentItem({...currentItem, product: p})} 
                          />
                          {/* Feedback de selección (ocupa espacio fijo para no saltar) */}
                          <div className="h-5 mt-1">
                              {currentItem.product && (
                                  <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded inline-block truncate max-w-[200px]">
                                      {currentItem.product.name} ({currentItem.product.sku})
                                  </span>
                              )}
                          </div>
                      </div>
                      
                      <div className="w-24 pb-6"> {/* Padding bottom para compensar la etiqueta de feedback del producto */}
                          <label className="label-logis">Cantidad</label>
                          <input 
                            type="number" 
                            className="input-logis text-center h-[40px]" // Altura fija
                            value={currentItem.quantity} 
                            onChange={e => setCurrentItem({...currentItem, quantity: e.target.value})} 
                          />
                      </div>
                      
                      <div className="w-32 pb-6">
                          <label className="label-logis">Precio Unit.</label>
                          <input 
                            type="number" 
                            className="input-logis text-right h-[40px]" // Altura fija
                            placeholder="$" 
                            value={currentItem.unit_price} 
                            onChange={e => setCurrentItem({...currentItem, unit_price: e.target.value})} 
                          />
                      </div>

                      <div className="pb-6">
                          <button 
                            onClick={handleAddItem} 
                            className="bg-stone-800 hover:bg-stone-900 text-white p-2.5 rounded-lg shadow transition-colors h-[40px] w-[40px] flex items-center justify-center"
                            title="Agregar a la lista"
                          >
                              <Plus size={20} />
                          </button>
                      </div>
                  </div>
              </div>

              {/* 3. Tabla de Detalle */}
              <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-stone-100 text-stone-500 font-bold uppercase text-xs">
                          <tr>
                              <th className="p-3">Producto</th>
                              <th className="p-3 text-center">Cant.</th>
                              <th className="p-3 text-right">Precio</th>
                              <th className="p-3 text-right">Total</th>
                              <th className="p-3 w-10"></th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                          {items.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-stone-400 italic">No hay productos agregados.</td></tr>}
                          {items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-stone-50">
                                  <td className="p-3">
                                      <div className="font-bold text-stone-800">{item.product.name}</div>
                                      <div className="text-xs text-stone-400 font-mono">{item.product.sku}</div>
                                  </td>
                                  <td className="p-3 text-center font-bold">{item.quantity} <span className="text-[10px] text-stone-400 font-normal">{item.product.unit}</span></td>
                                  <td className="p-3 text-right font-mono">${Number(item.unit_price).toLocaleString()}</td>
                                  <td className="p-3 text-right font-mono font-bold">${item.total.toLocaleString()}</td>
                                  <td className="p-3 text-right">
                                      <button onClick={() => handleRemoveItem(idx)} className="text-stone-300 hover:text-red-500"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* COLUMNA DERECHA: TOTALES Y ACCIONES */}
          <div className="lg:col-span-1 space-y-6">
              
              {/* Totales */}
              <div className="bg-white p-6 rounded-xl shadow-lg border border-stone-200 sticky top-24">
                  <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                      <Calculator size={18} /> Resumen
                  </h3>
                  
                  <div className="space-y-3 text-sm border-b border-stone-100 pb-4 mb-4">
                      <div className="flex justify-between text-stone-600">
                          <span>Neto</span>
                          <span className="font-mono">${netTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-stone-600">
                          <span>IVA (19%)</span>
                          <span className="font-mono">${taxTotal.toLocaleString()}</span>
                      </div>
                  </div>
                  
                  <div className="flex justify-between items-center mb-6">
                      <span className="text-lg font-bold text-stone-800">Total</span>
                      <span className="text-2xl font-bold text-emerald-600 font-mono">${grandTotal.toLocaleString()}</span>
                  </div>

                  <div className="space-y-3">
                      <button 
                          onClick={() => handleSave('CONFIRMED')}
                          disabled={loading}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold shadow-md flex justify-center items-center gap-2 transition-transform active:scale-95"
                      >
                          {loading ? 'Procesando...' : <><CheckCircle size={18}/> Confirmar Ingreso</>}
                      </button>
                      
                      <button 
                          onClick={() => handleSave('DRAFT')}
                          disabled={loading}
                          className="w-full bg-white border-2 border-stone-200 text-stone-600 py-2 rounded-lg font-bold hover:bg-stone-50 flex justify-center items-center gap-2"
                      >
                          <Save size={18}/> Guardar Borrador
                      </button>

                      {/* BOTÓN CANCELAR NUEVO */}
                      <button 
                          onClick={() => navigate('/inventory')} 
                          className="w-full bg-red-50 text-red-600 py-2 rounded-lg font-medium hover:bg-red-100 flex justify-center items-center gap-2 text-sm mt-2 border border-red-100"
                      >
                          <XCircle size={16}/> Cancelar / Salir
                      </button>
                  </div>

                  <p className="text-xs text-stone-400 mt-4 text-center leading-tight">
                      * Confirmar actualizará el stock en la bodega seleccionada inmediatamente.
                  </p>
              </div>

          </div>
      </div>

      {/* Estilos rápidos */}
      <style>{`
        .label-logis { display: block; font-size: 0.75rem; font-weight: 700; color: #78716c; margin-bottom: 0.25rem; text-transform: uppercase; }
        .input-logis { width: 100%; border: 1px solid #d6d3d1; padding: 0.5rem; border-radius: 0.5rem; font-size: 0.875rem; outline: none; transition: all 0.2s; }
        .input-logis:focus { border-color: #f97316; ring: 2px; ring-color: #fdba74; }
      `}</style>
    </div>
  );
};

export default InboundReception;