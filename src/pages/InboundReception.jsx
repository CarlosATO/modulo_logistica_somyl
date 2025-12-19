import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, Truck, UploadCloud, Plus, Trash2, CheckCircle, 
    Loader, Building, Calendar, Paperclip, FileText, Package, AlertCircle, Hash, Save, ShoppingCart, AlertTriangle
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar'; // <--- Nuevo import
import Combobox from '../components/Combobox';
import { toast } from 'sonner'; // <--- NUEVO IMPORT
import { supabase } from '../services/supabaseClient';           
import { supabaseProcurement } from '../services/procurementClient'; 
import { useAuth } from '../context/AuthContext';

export default function InboundReception() {
  const { user } = useAuth();
  
  // --- ESTADOS GLOBALES ---
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [activeTab, setActiveTab] = useState('OC');
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // --- DATOS MAESTROS ---
  const [projectsDB, setProjectsDB] = useState([]); 
  const [suppliersDB, setSuppliersDB] = useState([]); 
  const [clientsList, setClientsList] = useState([]); 
  const [clientCatalog, setClientCatalog] = useState([]); 

  // --- ESTADOS OC ---
  const [ocNumber, setOcNumber] = useState('');
  const [ocData, setOcData] = useState(null);
  const [ocHeader, setOcHeader] = useState(null);
  const [ocHistory, setOcHistory] = useState({});
  const [ocInputs, setOcInputs] = useState({});

  // --- ESTADOS ASIGNADOS (MANUAL) ---
  const [assignedForm, setAssignedForm] = useState({
    client_name: '',       
    project_name: '',      
    document_number: '',
    supplier_name: ''      
  });
  const [manualCart, setManualCart] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState(''); 
  const [newItem, setNewItem] = useState({ 
    code: '', name: '', quantity: '', unit: 'UN', price: '' 
  });
  const [receiptFile, setReceiptFile] = useState(null);

    // --- ESTADOS INGRESO DIRECTO ---
    const [products, setProducts] = useState([]);
    const [selectedProject, setSelectedProject] = useState('');
    const [directReceiptCart, setDirectReceiptCart] = useState([]);
    const [directInputs, setDirectInputs] = useState({ documentNumber: '', comments: '' });
    const [selectedProductForDirect, setSelectedProductForDirect] = useState('');
    const [directLineQuantity, setDirectLineQuantity] = useState('');

  // ==========================================
  // 1. CARGA INICIAL DE MAESTROS
  // ==========================================
  useEffect(() => {
    const fetchMasters = async () => {
      try {
        const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(wh || []);

        const { data: proj } = await supabaseProcurement
            .from('proyectos')
            .select('id, proyecto, cliente, activo')
            .eq('activo', true)
            .order('proyecto', { ascending: true });
        
        if (proj) {
            setProjectsDB(proj);
            const uniqueClients = [...new Set(proj.map(p => p.cliente))].filter(Boolean).sort();
            setClientsList(uniqueClients);
        }

        const { data: supp } = await supabaseProcurement
            .from('proveedores')
            .select('id, nombre, rut') 
            .order('nombre', { ascending: true });
        
        setSuppliersDB(supp || []);

                // Cargar productos para Combobox Directo
                const { data: prods } = await supabase.from('products').select('*');
                setProducts(prods || []);

      } catch (error) {
        console.error("Error cargando maestros:", error);
      }
    };
    fetchMasters();
  }, []);

  // ==========================================
  // 2. LÓGICA DE CATÁLOGO (ASIGNADOS)
  // ==========================================
  useEffect(() => {
    const loadCatalog = async () => {
        if (!assignedForm.client_name) {
            setClientCatalog([]);
            return;
        }
        
        const { data, error } = await supabase
            .from('assigned_materials')
            .select('*')
            .ilike('client_name', `%${assignedForm.client_name}%`)
            .order('description', { ascending: true });
            
        if (!error) setClientCatalog(data || []);
    };
    loadCatalog();
  }, [assignedForm.client_name]);

  const handleMaterialSelect = (matId) => {
      setSelectedMaterialId(matId);

      const material = clientCatalog.find(m => m.id === matId);
      if (material) {
          setNewItem({
              code: material.code,
              name: material.description, 
              unit: material.unit || 'UN',
              quantity: '', 
              price: ''
          });
      } else {
          setNewItem({ code: '', name: '', quantity: '', unit: 'UN', price: '' });
      }
  };

  const filteredProjects = useMemo(() => {
    if (!assignedForm.client_name) return [];
    return projectsDB.filter(p => p.cliente === assignedForm.client_name);
  }, [projectsDB, assignedForm.client_name]);


  // ==========================================
  // 3. LÓGICA OC (CORREGIDA: PRECIO UNITARIO)
  // ==========================================
  const handleSearchOC = async (term) => {
    // Evitamos búsquedas con números muy cortos para no generar falsos positivos
    if (!term || String(term).trim().length < 3) return;

    setOcNumber(term);
    setLoading(true);
    setOcData(null);
    setOcHeader(null);
    setReceiptFile(null);
    setOcInputs({});

    try {
      const { data: ocLines, error } = await supabaseProcurement
        .from('orden_de_compra')
        .select('*')
        .eq('orden_compra', parseInt(term)); 

      if (error || !ocLines?.length) {
        toast.error("Orden de Compra no encontrada.");
        return;
      }

      const firstLine = ocLines[0];
      const providerInfo = suppliersDB.find(s => s.id === firstLine.proveedor);
      
      setOcHeader({
        fecha: firstLine.fecha,
        proveedor: providerInfo ? providerInfo.nombre : 'Proveedor Desconocido',
        rut: providerInfo ? providerInfo.rut : '-'
      });

      // Historial de recepciones
      const { data: history } = await supabase
        .from('movements')
        .select('oc_line_id, quantity')
        .eq('oc_number', String(term))
        .eq('type', 'INBOUND');

      const receivedMap = {};
      history?.forEach(mov => {
        receivedMap[mov.oc_line_id] = (receivedMap[mov.oc_line_id] || 0) + Number(mov.quantity);
      });
      setOcHistory(receivedMap);

      // CORRECCIÓN PRECIOS: Prioridad al precio de la OC (precio_unitario)
      const initialInputs = {};

      ocLines.forEach(line => {
        const officialPrice = line.precio_unitario || line.precio || 0; 

        initialInputs[line.art_corr] = {
            quantity: '', 
            price: officialPrice
        };
      });
      
      setOcInputs(initialInputs);
      setOcData(ocLines);

    } catch (err) {
      console.error(err);
      toast.error("Error buscando OC.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOC = async () => {
    if (!selectedWarehouse) {
        toast.error("⚠️ Debes seleccionar una Bodega de Destino");
        return;
    }
    const mainDoc = ocInputs['global_doc'];
    if (!mainDoc) {
        toast.error("⚠️ Falta el N° de Guía o Factura");
        return;
    }

    // Preparamos los items para el RPC
    const itemsToProcess = ocData
        .filter(line => Number(ocInputs[line.art_corr]?.quantity || 0) > 0)
        .map(line => ({
            codigo: line.codigo,
            descripcion: line.descripcion,
            unidad: line.unidad || 'UN',
            cantidad: Number(ocInputs[line.art_corr].quantity),
            precio: Number(ocInputs[line.art_corr].price || 0),
            art_corr: String(line.art_corr)
        }));

    if (itemsToProcess.length === 0) {
        toast.warning("No hay cantidades ingresadas");
        return;
    }

    setProcessing(true);

    const promise = new Promise(async (resolve, reject) => {
        try {
            let docUrl = null;
            if (receiptFile) {
                const fileName = `OC-${ocNumber}-${Date.now()}.${receiptFile.name.split('.').pop()}`;
                const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, receiptFile);
                if (uploadError) throw uploadError;
                docUrl = fileName;
            }

            // LLAMADA ATÓMICA AL RPC
            const { error: rpcError } = await supabase.rpc('receive_oc_items', {
                p_warehouse_id: selectedWarehouse,
                p_oc_number: String(ocNumber),
                p_document_number: mainDoc,
                p_doc_url: docUrl,
                p_global_obs: ocInputs['global_obs'] || null,
                p_user_email: user?.email,
                p_items: itemsToProcess
            });

            if (rpcError) throw rpcError;

            handleSearchOC(ocNumber); // Refrescar vista
            setOcInputs(p => ({ ...p, global_doc: '', global_obs: '' }));
            setReceiptFile(null);
            resolve("Recepción procesada correctamente en servidor");

        } catch (err) {
            console.error(err);
            reject("Error: " + (err.message || "Fallo en la transacción"));
        }
    });

    toast.promise(promise, {
        loading: 'Ejecutando transacción segura...',
        success: (data) => `✅ ${data}`,
        error: (err) => `❌ ${err}`,
    }).finally(() => setProcessing(false));
  };

  // ==========================================
  // 4. LÓGICA ASIGNADOS
  // ==========================================
  const addManualItem = () => {
    if (!selectedMaterialId || !newItem.quantity || !newItem.price) {
        toast.error('Faltan datos (Selección, Cantidad o Precio).');
        return;
    }
    setManualCart([...manualCart, { ...newItem }]);
    setNewItem({ code: '', name: '', quantity: '', unit: 'UN', price: '' });
    setSelectedMaterialId('');
  };

  const removeManualItem = (idx) => {
    setManualCart(manualCart.filter((_, i) => i !== idx));
  };

  const handleSubmitAssigned = async () => {
    if (!selectedWarehouse) {
        toast.error("Selecciona bodega.");
        return;
    }
    if (!assignedForm.client_name) {
        toast.error("Selecciona Cliente.");
        return;
    }
    if (!assignedForm.project_name) {
        toast.error("Selecciona Proyecto.");
        return;
    }
    if (!assignedForm.document_number) {
        toast.error("Falta N° Guía.");
        return;
    }
    if (manualCart.length === 0) {
        toast.error("Carrito vacío.");
        return;
    }

    setProcessing(true);
    try {
        let docUrl = null;
        if (receiptFile) {
            const fileName = `MAN-${Date.now()}.${receiptFile.name.split('.').pop()}`;
            await supabase.storage.from('documents').upload(fileName, receiptFile);
            docUrl = fileName;
        }

        for (const item of manualCart) {
            let productId = null;
            const { data: existingProd } = await supabase.from('products')
                .select('id, current_stock').eq('code', item.code).maybeSingle();

            if (existingProd) {
                productId = existingProd.id;
                await supabase.from('products').update({
                    price: item.price,
                    current_stock: Number(existingProd.current_stock) + Number(item.quantity)
                }).eq('id', productId);
            } else {
                const { data: newProd } = await supabase.from('products').insert({
                    code: item.code, name: item.name, unit: item.unit, 
                    price: item.price, current_stock: item.quantity
                }).select().single();
                productId = newProd.id;
            }

            await supabase.from('movements').insert({
                type: 'INBOUND',
                warehouse_id: selectedWarehouse,
                product_id: productId,
                quantity: item.quantity,
                unit_price: item.price,
                document_number: assignedForm.document_number,
                client_owner: assignedForm.client_name, 
                project_id: assignedForm.project_name, 
                supplier_id: assignedForm.supplier_name, 
                reception_document_url: docUrl,
                other_data: `Guía: ${assignedForm.document_number} | Prov: ${assignedForm.supplier_name || '-'}`,
                comments: `Ingreso Asignado | ${assignedForm.project_name}`,
                user_email: user?.email
            });
        }

        toast.success("✅ Ingreso Asignado Guardado.");
        setManualCart([]);
        setAssignedForm({ client_name: '', project_name: '', document_number: '', supplier_name: '' });
        setReceiptFile(null);
        setSelectedMaterialId('');
    } catch (err) {
        console.error(err);
        toast.error("Error: " + err.message);
    } finally {
        setProcessing(false);
    }
  };

  // ===== Helpers para INGRESO DIRECTO =====
  const handleFileChange = (e) => {
      const f = e?.target?.files?.[0];
      if (f) setReceiptFile(f);
  };

  const handleAddToDirectCart = () => {
      if (!selectedProductForDirect || !directLineQuantity || Number(directLineQuantity) <= 0) {
          toast.error('Faltan datos para agregar la línea.');
          return;
      }
      const prod = products.find(p => p.id === selectedProductForDirect);
      if (!prod) {
          toast.error('Producto no válido');
          return;
      }
      setDirectReceiptCart(prev => [...prev, { product: prod, quantity: Number(directLineQuantity) }]);
      setSelectedProductForDirect('');
      setDirectLineQuantity('');
  };

  const handleRemoveFromDirectCart = (idx) => {
      setDirectReceiptCart(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitDirect = async () => {
      // 1. Validaciones finales de seguridad
      if (directReceiptCart.length === 0) return toast.warning("⚠️ El carrito está vacío.");
      if (!selectedWarehouse) return toast.error("⚠️ Error crítico: Bodega no seleccionada.");
      if (!selectedProject) return toast.error("⚠️ Error crítico: Origen no seleccionado.");

      // 2. REGLA: Advertencia de Archivo Faltante
      if (!receiptFile) {
          const confirmNoFile = window.confirm(
              "⚠️ ADVERTENCIA:\n\nEstás a punto de guardar un ingreso SIN un documento de respaldo adjunto (guía/factura).\n\n¿Estás seguro de que deseas continuar?"
          );
          if (!confirmNoFile) return;
      }

      // Si pasa las validaciones, procedemos...
      setProcessing(true);

      // Usamos toast.promise para feedback visual del proceso largo
      toast.promise(
          new Promise(async (resolve, reject) => {
              try {
                  // A. Subir archivo si existe
                  let docUrl = null;
                  if (receiptFile) {
                      const fileName = `DIRECT-${directInputs.documentNumber}-${Date.now()}.${receiptFile.name.split('.').pop()}`;
                      const { error: uploadError } = await supabase.storage
                          .from('documents')
                          .upload(fileName, receiptFile);
                      if (uploadError) throw uploadError;
                      docUrl = fileName;
                  }

                  // B. Preparar el payload para el RPC
                  const itemsToProcess = directReceiptCart.map(item => ({
                      codigo: item.product.code,
                      descripcion: item.product.name,
                      unidad: item.product.unit || 'UN',
                      cantidad: Number(item.quantity),
                      precio: 0,
                      art_corr: 'DIRECT'
                  }));

                  // C. Obtener nombre del proyecto/cliente para observaciones
                  const projectData = projectsDB.find(p => p.id === Number(selectedProject));
                  const originName = projectData ? `${projectData.proyecto} (${projectData.cliente})` : 'Origen Desconocido';

                  // D. LLAMADA ATÓMICA AL RPC
                  const { error: rpcError } = await supabase.rpc('receive_oc_items', {
                      p_warehouse_id: selectedWarehouse,
                      p_oc_number: 'DIRECTO',
                      p_document_number: directInputs.documentNumber,
                      p_doc_url: docUrl,
                      p_global_obs: `Ingreso Directo desde: ${originName}. ${directInputs.comments || ''}`,
                      p_user_email: user?.email,
                      p_items: itemsToProcess
                  });

                  if (rpcError) throw rpcError;

                  // E. Limpieza post-éxito
                  setDirectReceiptCart([]);
                  setDirectInputs({ documentNumber: '', comments: '' });
                  setReceiptFile(null);

                  resolve(`Ingreso ${directInputs.documentNumber} registrado correctamente.`);

              } catch (err) {
                  console.error(err);
                  reject(err.message || "Error al procesar el ingreso.");
              }
          }),
          {
              loading: 'Guardando ingreso directo...',
              success: (msg) => `✅ ${msg}`,
              error: (msg) => `❌ ${msg}`
          }
      ).finally(() => setProcessing(false));
  };


  return (
    <div className="pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm px-6 py-4">
        <h1 className="text-xl font-bold flex items-center gap-2 text-blue-700">
            <Truck/> Recepción de Materiales
        </h1>
        <p className="text-xs text-slate-500">Ingreso valorizado (Compras o Asignación)</p>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        
        {/* SELECCIÓN BODEGA Y MODO */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Combobox
                    options={warehouses}
                    value={selectedWarehouse}
                    onChange={setSelectedWarehouse}
                    placeholder="-- Seleccionar Bodega --"
                    label="Bodega de Destino"
                />
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Tipo de Ingreso</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button onClick={() => setActiveTab('OC')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'OC' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}>Orden de Compra</button>
                        <button onClick={() => setActiveTab('ASSIGNED')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${activeTab === 'ASSIGNED' ? 'bg-white shadow text-purple-600' : 'text-slate-400'}`}>Material Asignado</button>
                    </div>
                </div>
            </div>
        </div>

        {/* --- PESTAÑA OC --- */}
        {activeTab === 'OC' && (
            <div className="space-y-6 animate-in fade-in">
                        <div className="bg-blue-50 border border-blue-100 p-8 rounded-xl">
                    <div className="text-center mb-4">
                        <h3 className="text-blue-900 font-bold text-lg">Recepción por Orden de Compra</h3>
                        <p className="text-blue-600/70 text-sm">Ingresa el número y el sistema buscará automáticamente</p>
                    </div>
                    
                    <GoogleSearchBar 
                        type="number"
                        placeholder="Ej: 4500123" 
                        loading={loading}
                        onSearch={(val) => handleSearchOC(val)} 
                    />
                </div>

                {ocData && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div><span className="block text-xs text-slate-400 font-bold uppercase">Proveedor</span><div className="font-bold text-slate-700 flex items-center gap-2"><Building size={16}/> {ocHeader?.proveedor}</div></div>
                            <div><span className="block text-xs text-slate-400 font-bold uppercase">Fecha</span><div className="font-bold text-slate-700 flex items-center gap-2"><Calendar size={16}/> {ocHeader?.fecha}</div></div>
                            <div><span className="block text-xs text-slate-400 font-bold uppercase">Total Líneas</span><div className="font-bold text-slate-700">{ocData.length} Ítems</div></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-4 rounded-lg border border-slate-200">
                             <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">N° Guía / Factura *</label><input type="text" className="w-full px-3 py-2 border rounded-lg outline-none focus:border-blue-500 font-bold" onChange={(e) => setOcInputs(p => ({...p, global_doc: e.target.value}))}/></div>
                             <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Adjuntar Respaldo</label><label className={`flex items-center justify-center gap-2 w-full px-3 py-2 border border-dashed rounded-lg cursor-pointer ${receiptFile ? 'bg-emerald-50 border-emerald-300' : 'hover:bg-slate-50'}`}>{receiptFile ? <CheckCircle size={18}/> : <Paperclip size={18}/>}<span className="text-sm font-medium truncate">{receiptFile ? receiptFile.name : 'Subir PDF...'}</span><input type="file" className="hidden" onChange={e => setReceiptFile(e.target.files[0])}/></label></div>
                        </div>

                        <div className="overflow-x-auto border border-slate-200 rounded-lg shadow-sm bg-white">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-3">Item</th><th className="px-4 py-3 text-center">Total OC</th><th className="px-4 py-3 text-center">Pendiente</th><th className="px-4 py-3 text-center bg-blue-50 w-24">Recibir</th><th className="px-4 py-3 text-center bg-green-50 w-28">Precio ($)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {ocData.map((line) => {
                                        const received = ocHistory[line.art_corr] || 0;
                                        const pending = line.cantidad - received;
                                        const isComplete = pending <= 0;
                                        const currentInput = ocInputs[line.art_corr] || {};
                                        return (
                                            <tr key={line.id} className={isComplete ? 'bg-slate-50 opacity-60' : ''}>
                                                <td className="px-4 py-3 font-bold">{line.descripcion}</td>
                                                <td className="px-4 py-3 text-center">{line.cantidad}</td>
                                                <td className="px-4 py-3 text-center text-orange-600">{pending > 0 ? pending : 0}</td>
                                                <td className="px-4 py-2 bg-blue-50/30"><input type="number" min="0" max={pending} disabled={isComplete} className="w-full text-center border rounded font-bold" value={currentInput.quantity || ''} onChange={(e) => setOcInputs(p => ({ ...p, [line.art_corr]: { ...p[line.art_corr], quantity: e.target.value } }))}/></td>
                                                <td className="px-4 py-2 bg-green-50/30"><input type="number" disabled={isComplete} className="w-full text-right border rounded text-green-700" value={currentInput.price || ''} onChange={(e) => setOcInputs(p => ({ ...p, [line.art_corr]: { ...p[line.art_corr], price: e.target.value } }))}/></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-slate-200">
                            <button 
                                onClick={handleSubmitOC} 
                                disabled={processing || !selectedWarehouse || !ocInputs['global_doc']} 
                                className={`px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2
                                    ${(processing || !selectedWarehouse || !ocInputs['global_doc']) 
                                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-105'
                                    }`}>
                                {processing ? <Loader className="animate-spin"/> : <><CheckCircle size={20}/> Confirmar Recepción</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- PESTAÑA ASIGNADO --- */}
        {activeTab === 'ASSIGNED' && (
            <div className="space-y-6 animate-in fade-in">
                <div className="bg-white p-5 rounded-xl shadow-sm border border-purple-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Combobox
                        options={clientsList.map(c => ({ id: c, name: c }))}
                        value={assignedForm.client_name}
                        onChange={(val) => {setAssignedForm({...assignedForm, client_name: val, project_name: ''}); setClientCatalog([]);}}
                        placeholder="-- Seleccionar Cliente --"
                        label="Cliente"
                    />
                    <Combobox
                        options={filteredProjects.map(p => ({ id: p.proyecto, name: p.proyecto }))}
                        value={assignedForm.project_name}
                        onChange={(val) => setAssignedForm({...assignedForm, project_name: val})}
                        placeholder={assignedForm.client_name ? '-- Seleccionar Proyecto --' : '-- Primero Cliente --'}
                        label="Proyecto"
                        disabled={!assignedForm.client_name}
                    />
                    <Combobox
                        options={suppliersDB.map(s => ({ id: s.nombre, name: s.nombre }))}
                        value={assignedForm.supplier_name}
                        onChange={(val) => setAssignedForm({...assignedForm, supplier_name: val})}
                        placeholder="-- Seleccionar Proveedor --"
                        label="Proveedor"
                    />
                    <div><label className="text-xs font-bold text-slate-400 block mb-1">N° Guía</label><input type="text" className="w-full border p-2 rounded-lg font-bold" value={assignedForm.document_number} onChange={e => setAssignedForm({...assignedForm, document_number: e.target.value})} /></div>
                </div>

                <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 grid grid-cols-12 gap-3 mb-4">
                    <div className="col-span-4">
                        <Combobox
                            options={clientCatalog.map(m => ({ id: m.id, name: `${m.description} (${m.code})` }))}
                            value={selectedMaterialId}
                            onChange={handleMaterialSelect}
                            placeholder="-- Seleccionar Material --"
                            label={`Material ${assignedForm.client_name ? '(' + assignedForm.client_name + ')' : ''}`}
                        />
                    </div>
                    <div className="col-span-2"><label className="text-[10px] font-bold text-purple-700 uppercase">Código</label><input type="text" className="w-full p-2 rounded border border-purple-200 bg-white opacity-80" value={newItem.code} readOnly /></div>
                    <div className="col-span-2"><label className="text-[10px] font-bold text-purple-700 uppercase">Cant.</label><input type="number" className="w-full p-2 rounded border border-purple-200 font-bold text-center" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: e.target.value})} /></div>
                    <div className="col-span-2"><label className="text-[10px] font-bold text-green-700 uppercase">Precio ($)</label><input type="number" className="w-full p-2 rounded border border-green-200 font-bold text-green-800" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} /></div>
                    <div className="col-span-2 flex items-end"><button onClick={addManualItem} className="w-full bg-purple-600 text-white p-2 rounded-lg font-bold hover:bg-purple-700 flex justify-center gap-1"><Plus size={18}/> Agregar</button></div>
                </div>

                <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr><th className="px-4 py-3 text-left">Material</th><th className="px-4 py-3 text-center">Cant</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3"></th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {manualCart.map((item, idx) => (
                                <tr key={idx}><td className="px-4 py-3 font-bold">{item.name} <span className="font-normal text-xs">({item.code})</span></td><td className="px-4 py-3 text-center">{item.quantity} {item.unit}</td><td className="px-4 py-3 text-right text-green-700">${item.price}</td><td className="px-4 py-3 text-right font-black">${(item.quantity*item.price).toLocaleString()}</td><td className="px-4 py-3 text-center"><button onClick={() => removeManualItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>
                            ))}
                            {manualCart.length === 0 && <tr><td colSpan="5" className="p-8 text-center text-slate-400">Carrito vacío</td></tr>}
                        </tbody>
                        {manualCart.length > 0 && <tfoot className="bg-slate-50"><tr><td colSpan="3" className="px-4 py-3 text-right font-bold uppercase text-slate-500">Total:</td><td className="px-4 py-3 text-right font-black text-lg text-green-700">${manualCart.reduce((sum, i) => sum + (i.quantity * i.price), 0).toLocaleString()}</td><td></td></tr></tfoot>}
                    </table>
                    <div className="p-4 bg-slate-50 border-t flex justify-between items-center">
                        <label className="flex items-center gap-2 cursor-pointer bg-white border px-3 py-2 rounded-lg hover:bg-slate-50"><UploadCloud size={18} className="text-purple-500"/><span className="text-xs font-bold">{receiptFile ? 'Adjunto OK' : 'Adjuntar Doc'}</span><input type="file" className="hidden" onChange={e => setReceiptFile(e.target.files[0])}/></label>
                        <button onClick={handleSubmitAssigned} disabled={processing || manualCart.length === 0} className="bg-purple-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black shadow-lg disabled:opacity-50">{processing ? <Loader className="animate-spin"/> : 'Confirmar Ingreso'}</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}