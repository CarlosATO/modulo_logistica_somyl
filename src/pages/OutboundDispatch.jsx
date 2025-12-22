import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import { 
  Search, ArrowRight, Truck, User, FileText, 
  MapPin, Package, X, CheckCircle, Loader, Briefcase, Plus, AlertCircle 
} from 'lucide-react';
import GoogleSearchBar from '../components/GoogleSearchBar';
import Combobox from '../components/Combobox';
import { toast } from 'sonner'; // replace alert with toast notifications
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// --- ESTILOS PDF ---
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: 1, borderColor: '#eee', paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 10, color: '#666', marginTop: 4 },
  section: { marginVertical: 10, padding: 10, backgroundColor: '#f9fafb', borderRadius: 4 },
  label: { fontSize: 8, color: '#888', marginBottom: 2, textTransform: 'uppercase' },
  value: { fontSize: 11, fontWeight: 'bold', color: '#333' },
  table: { marginTop: 20, borderTop: 1, borderColor: '#eee' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', padding: 6, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', borderBottom: 1, borderColor: '#eee', padding: 6 },
  col1: { width: '15%' }, col2: { width: '45%' }, col3: { width: '25%' }, col4: { width: '15%', textAlign: 'center' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#aaa', fontSize: 8, borderTop: 1, borderColor: '#eee', paddingTop: 10 }
});

const DispatchDocument = ({ data }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View><Text style={styles.title}>GUÍA DE DESPACHO</Text><Text style={styles.subtitle}>Folio: {data.folio}</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={styles.subtitle}>{new Date().toLocaleDateString()}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={[styles.section, { flex: 1 }]}><Text style={styles.label}>Origen</Text><Text style={styles.value}>{data.warehouseName}</Text></View>
          <View style={[styles.section, { flex: 1 }]}><Text style={styles.label}>Destino / Proyecto</Text><Text style={styles.value}>{data.projectName}</Text><Text style={{fontSize:9, marginTop:2}}>{data.stage}</Text></View>
      </View>
      <View style={styles.section}><Text style={styles.label}>Receptor</Text><Text style={styles.value}>{data.receiverName} | RUT: {data.receiverRut}</Text></View>
      <View style={styles.table}>
        <View style={styles.tableHeader}><Text style={styles.col1}>COD</Text><Text style={styles.col2}>DESC</Text><Text style={styles.col3}>UBICACIÓN</Text><Text style={styles.col4}>CANT</Text></View>
        {data.items.map((item, i) => (
            <View key={i} style={styles.tableRow}><Text style={styles.col1}>{item.code}</Text><Text style={styles.col2}>{item.name}</Text><Text style={styles.col3}>{item.locationName}</Text><Text style={styles.col4}>{item.quantity}</Text></View>
        ))}
      </View>
      <Text style={styles.footer}>Sistema Somyl - {data.id}</Text>
    </Page>
  </Document>
);

export default function OutboundDispatch() {
  const { user } = useAuth();
  
  // Maestros
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignedMaterials, setAssignedMaterials] = useState([]); // Para saber el dueño del material

  // Cabecera
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedProject, setSelectedProject] = useState(''); // ID del proyecto
  const [projectClient, setProjectClient] = useState(''); // Nombre del Cliente del Proyecto (Para filtro)
  const [receiver, setReceiver] = useState({ name: '', rut: '', plate: '', stage: '' }); // stage = Etapa/Lugar

  // Picking
  // search handled via GoogleSearchBar debounce; results stored in searchResults
  const [searchResults, setSearchResults] = useState([]);
  const [cart, setCart] = useState([]);
  
  // MODAL DE PICKING
  const [showPickModal, setShowPickModal] = useState(false);
  const [pickingProduct, setPickingProduct] = useState(null); // Producto siendo procesado
  const [pickingLocations, setPickingLocations] = useState([]); // Dónde está ese producto
  const [pickQuantities, setPickQuantities] = useState({}); // { locationId: cantidad }

  // Estado PDF
  const [lastDispatchData, setLastDispatchData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);

  // 1. Cargar Datos Iniciales
  useEffect(() => {
    const init = async () => {
        const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(wh || []);
        
        const { data: pj } = await supabaseProcurement.from('proyectos').select('id, proyecto, cliente').eq('activo', true);
        setProjects(pj || []);

        // Cargamos catálogo de asignados para saber dueños
        const { data: asm } = await supabase.from('assigned_materials').select('code, client_name');
        setAssignedMaterials(asm || []);
    };
    init();
  }, []);

  // Detectar Cliente al cambiar Proyecto
  useEffect(() => {
      if(selectedProject) {
          const p = projects.find(x => x.id === Number(selectedProject));
          setProjectClient(p ? p.cliente : '');
      } else {
          setProjectClient('');
      }
  }, [selectedProject, projects]);

  // Resetear estado del PDF cuando cambie el carrito
  useEffect(() => {
    if (cart.length === 0) {
      setPdfDownloaded(false);
    }
  }, [cart]);

  // 2. Buscar Producto (Con Filtro de Cliente)
  // Ahora acepta un término 'term' (pasa desde GoogleSearchBar con debounce)
  const handleSearch = async (term) => {
    // Si está vacío, limpiamos resultados silenciosamente
    if (!term || term.trim().length === 0) {
        setSearchResults([]);
        return;
    }

    if (!selectedWarehouse) {
        toast.error("⚠️ Primero selecciona una bodega.");
        return;
    }

    // Buscar en tabla maestra usando 'term'
    const { data } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `%${term}%`)
        .gt('current_stock', 0)
        .limit(15);
    
    // FILTRADO INTELIGENTE:
    const filtered = (data || []).filter(prod => {
        const assignedInfo = assignedMaterials.find(a => a.code === prod.code);
        if (!assignedInfo) return true;
        return assignedInfo.client_name === projectClient;
    });
    
    setSearchResults(filtered);
  };

  // 3. Abrir Modal de Picking
  const openPickModal = async (product) => {
    setPickingProduct(product);
    setPickQuantities({});
    
    // Buscar desglose de ubicaciones
    const { data: rackStock } = await supabase
        .from('product_locations')
        .select('*, locations(full_code)')
        .eq('product_id', product.id)
        .eq('warehouse_id', selectedWarehouse);

    const totalAllocated = rackStock?.reduce((sum, item) => sum + Number(item.quantity), 0) || 0;
    const generalStock = product.current_stock - totalAllocated;

    const options = [];
    if (generalStock > 0) {
        options.push({ id: 'GENERAL', name: 'RECEPCIÓN / GENERAL - PISO', stock: generalStock, isRack: false });
    }
    rackStock?.forEach(r => {
        if (r.quantity > 0) {
            options.push({ id: r.id, name: r.locations?.full_code, stock: r.quantity, isRack: true, locationId: r.location_id });
        }
    });

    setPickingLocations(options);
    setShowPickModal(true);
  };

  // 4. Confirmar Agregado al Carrito
  const handleConfirmPick = () => {
      let totalPicked = 0;
      const newCartItems = [];

      pickingLocations.forEach(loc => {
          const qty = Number(pickQuantities[loc.id] || 0);
          if (qty > 0) {
              totalPicked += qty;
              newCartItems.push({
                  uid: Date.now() + Math.random(),
                  productId: pickingProduct.id,
                  code: pickingProduct.code,
                  name: pickingProduct.name,
                  locationName: loc.name,
                  quantity: qty,
                  sourceId: loc.id,
                  isRack: loc.isRack
              });
          }
      });

      if (totalPicked === 0) {
          toast.error("⚠️ Ingresa una cantidad válida.");
          return;
      }
      
      setCart([...cart, ...newCartItems]);
      setShowPickModal(false);
      // Filtrar el producto específico de los resultados de búsqueda
      setSearchResults(searchResults.filter(prod => prod.id !== pickingProduct.id));
  };

  // 5. Procesar Despacho (VERSIÓN MEJORADA - RPC)
  const handleDispatch = async () => {
    if (!selectedWarehouse) return toast.error("⚠️ Selecciona la Bodega de Origen.");
    if (!selectedProject) return toast.error("⚠️ Selecciona el Proyecto de Destino.");
    if (!receiver.name) return toast.error("⚠️ Falta el nombre del Receptor.");
    if (cart.length === 0) return toast.warning("⚠️ El carrito está vacío.");

    setIsProcessing(true);

    try {
        const folio = `SAL-${Date.now().toString().slice(-6)}`;

        // Preparamos los items para el RPC
        const itemsToProcess = cart.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            isRack: item.isRack,
            sourceId: String(item.sourceId),
            name: item.name,
            code: item.code,
            locationName: item.locationName
        }));

        // Llamada única al servidor (Atómica)
        const { error: rpcError } = await supabase.rpc('dispatch_materials', {
            p_warehouse_id: selectedWarehouse,
            p_project_id: Number(selectedProject),
            p_document_number: folio,
            p_receiver_name: receiver.name,
            p_user_email: user?.email,
            p_items: itemsToProcess,
            p_receiver_rut: receiver.rut || '',
            p_receiver_stage: receiver.stage || ''
        });

        if (rpcError) throw rpcError;

        // Preparar datos para el PDF (se mantiene igual)
        const whName = warehouses.find(w => w.id === selectedWarehouse)?.name;
        const prj = projects.find(p => p.id === Number(selectedProject));
        
        setLastDispatchData({
            id: folio, folio, warehouseName: whName,
            projectName: prj ? `${prj.proyecto} (${prj.cliente})` : 'Externo',
            stage: receiver.stage,
            receiverName: receiver.name, receiverRut: receiver.rut, receiverPlate: receiver.plate,
            items: cart
        });

        setCart([]);
        setReceiver({ name: '', rut: '', plate: '', stage: '' });
        setPdfDownloaded(false); // Resetear estado del PDF
        
        toast.success(`✅ Salida ${folio} registrada exitosamente`);

    } catch (err) {
        console.error(err);
        toast.error(`❌ ${err.message || "Error al procesar el despacho"}`);
    } finally {
        setIsProcessing(false);
    }
  };

  // 6. Marcar PDF como descargado
  const handlePdfDownloaded = () => {
    setPdfDownloaded(true);
  };

  // Preparar datos del PDF preview
  const selectedProj = projects.find(p => p.id === Number(selectedProject));
  const pdfPreviewData = {
    id: 'PREVIEW',
    folio: 'PREVIEW',
    warehouseName: warehouses.find(w => w.id === selectedWarehouse)?.name || '',
    projectName: selectedProj ? `${selectedProj.proyecto} (${selectedProj.cliente})` : 'Externo',
    stage: receiver.stage,
    receiverName: receiver.name,
    receiverRut: receiver.rut,
    receiverPlate: receiver.plate,
    items: cart
  };

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* Cabecera */}
      <div className="bg-white p-6 rounded-xl shadow-sm border grid grid-cols-1 md:grid-cols-2 gap-6">
          <Combobox
              options={warehouses}
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
              placeholder="-- Seleccionar Bodega --"
              label="Bodega Origen"
          />
          <div>
              <Combobox
                  options={projects.map(p => ({ id: p.id, name: `${p.proyecto} (${p.cliente})` }))}
                  value={selectedProject}
                  onChange={setSelectedProject}
                  placeholder="-- Seleccionar Proyecto --"
                  label="Proyecto Destino (Externo)"
              />
              {projectClient && <p className="text-xs text-blue-600 mt-1 font-bold">Cliente detectado: {projectClient}</p>}
          </div>
      </div>

      {/* Datos Receptor */}
      <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><User size={18}/> Receptor y Detalle</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input className="border p-2 rounded" placeholder="Nombre" value={receiver.name} onChange={e=>setReceiver({...receiver, name:e.target.value})}/>
              <input className="border p-2 rounded" placeholder="RUT" value={receiver.rut} onChange={e=>setReceiver({...receiver, rut:e.target.value})}/>
              <input className="border p-2 rounded" placeholder="Patente (Opc)" value={receiver.plate} onChange={e=>setReceiver({...receiver, plate:e.target.value})}/>
              <input className="border p-2 rounded bg-yellow-50 border-yellow-200" placeholder="Etapa / Lugar (Ej: Piso 3)" value={receiver.stage} onChange={e=>setReceiver({...receiver, stage:e.target.value})}/>
          </div>
      </div>

      {/* Buscador y Tabla */}
      {selectedWarehouse && selectedProject && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white p-6 rounded-xl shadow-sm border h-fit">
                <div className="mb-6">
                <GoogleSearchBar 
                    placeholder="Buscar producto para despachar..." 
                    onSearch={(val) => handleSearch(val)} 
                />
            </div>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {searchResults.length === 0 && <p className="text-center text-slate-400 py-4 text-sm">Escribe para buscar...</p>}
                    {searchResults.map(prod => (
                        <div key={prod.id} onClick={()=>openPickModal(prod)} className="p-3 border rounded cursor-pointer hover:bg-blue-50 transition-colors flex justify-between items-center group">
                            <div>
                                <div className="font-bold text-sm text-slate-700 group-hover:text-blue-700">{prod.name}</div>
                                <div className="text-xs text-slate-500">{prod.code}</div>
                            </div>
                            <span className="bg-slate-100 group-hover:bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded font-bold">{prod.current_stock}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="lg:col-span-7 bg-slate-50 p-6 rounded-xl border flex flex-col">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2"><Truck size={18}/> Carrito de Salida</h3>
                <div className="flex-1 bg-white rounded-lg border overflow-hidden mb-4 min-h-[200px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 font-bold text-xs uppercase"><tr><th className="p-3">Item</th><th className="p-3">Origen</th><th className="p-3 text-center">Cant</th><th className="p-3"></th></tr></thead>
                        <tbody>
                            {cart.map((item, i) => (
                                <tr key={i}>
                                    <td className="p-3"><div className="font-bold">{item.name}</div><div className="text-xs text-slate-400">{item.code}</div></td>
                                    <td className="p-3 text-xs text-blue-600">{item.locationName}</td>
                                    <td className="p-3 text-center font-bold">{item.quantity}</td>
                                    <td className="p-3 text-right"><button onClick={()=>setCart(cart.filter((_, idx)=>idx!==i))} className="text-red-400"><X size={16}/></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="flex justify-end gap-3">
                    {cart.length > 0 && (
                        <PDFDownloadLink
                            document={<DispatchDocument data={pdfPreviewData} />}
                            fileName="Despacho_Preview.pdf"
                        >
                            {({ loading }) => (
                                <button
                                    onClick={handlePdfDownloaded}
                                    disabled={loading}
                                    className={
                                        pdfDownloaded
                                            ? 'px-4 py-2 font-bold rounded border transition-all flex items-center gap-2 bg-green-100 text-green-700 border-green-300'
                                            : 'px-4 py-2 font-bold rounded border transition-all flex items-center gap-2 bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                    }>
                                    <FileText size={16}/>
                                    {pdfDownloaded ? 'PDF Descargado ✓' : 'Descargar PDF'}
                                </button>
                            )}
                        </PDFDownloadLink>
                    )}
                    <button
                        onClick={handleDispatch}
                        disabled={isProcessing || cart.length === 0 || !selectedWarehouse || !selectedProject || !receiver.name || !pdfDownloaded}
                        className={
                            (isProcessing || cart.length === 0 || !selectedWarehouse || !selectedProject || !receiver.name || !pdfDownloaded)
                                ? 'px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all bg-slate-300 text-slate-500 cursor-not-allowed'
                                : 'px-6 py-3 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-all bg-orange-600 text-white hover:bg-orange-700 hover:scale-105'
                        }>
                        {isProcessing ? <Loader className="animate-spin"/> : 'Confirmar Salida'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL PICKING */}
      {showPickModal && pickingProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
                <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Package className="text-orange-500"/> Distribución de Retiro</h3>
                        <p className="text-sm text-slate-500">{pickingProduct.name} ({pickingProduct.code})</p>
                    </div>
                    <button onClick={()=>setShowPickModal(false)}><X size={24} className="text-slate-400"/></button>
                </div>
                
                <div className="p-0 max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-bold sticky top-0">
                            <tr><th className="p-4">Ubicación / Zona</th><th className="p-4 text-center">Stock Actual</th><th className="p-4 text-center w-32">A Retirar</th></tr>
                        </thead>
                        <tbody className="divide-y">
                            {pickingLocations.map(loc => (
                                <tr key={loc.id} className="hover:bg-slate-50">
                                    <td className="p-4">
                                        <div className="font-bold text-slate-700">{loc.name}</div>
                                        <div className="text-xs text-slate-400">{loc.isRack ? 'Estantería' : 'Piso / Recepción'}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="text-lg font-bold text-blue-600">{loc.stock}</div>
                                        <div className="text-[10px] text-slate-400">UN</div>
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="number" 
                                            min="0" 
                                            max={loc.stock} 
                                            className="w-full border-2 border-slate-200 rounded-lg p-2 text-center font-bold text-lg focus:border-blue-500 outline-none"
                                            placeholder="0"
                                            onChange={(e) => {
                                                const val = Math.min(Number(e.target.value), loc.stock);
                                                setPickQuantities({...pickQuantities, [loc.id]: val});
                                            }}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-5 border-t bg-slate-50 flex justify-between items-center">
                    <div className="text-sm text-slate-500">
                        Total a retirar: <span className="font-bold text-slate-800 text-lg ml-2">
                            {Object.values(pickQuantities).reduce((a, b) => a + Number(b), 0)} UN
                        </span>
                    </div>
                    <button onClick={handleConfirmPick} className="bg-slate-800 text-white px-6 py-3 rounded-lg font-bold hover:bg-black shadow-lg flex items-center gap-2">
                        <Plus size={18}/> Agregar al Carrito
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
}