import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Combobox from '../components/Combobox';
import { PDFDownloadLink } from '@react-pdf/renderer'; 
import TransferPDF from '../components/TransferPDF'; 
import { 
  ArrowRightLeft, Building2, UserCheck, Search, Trash2, 
  Save, FileText, X, MapPin, Briefcase, Loader, Hash
} from 'lucide-react';

export default function TransferMaterial() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Datos Maestros
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]); 
  const [products, setProducts] = useState([]); 
  
  // Folio Anticipado para visibilidad del usuario
  const [nextTransferId, setNextTransferId] = useState('');

  // Estado del Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState(null);
  const [locationsForProduct, setLocationsForProduct] = useState([]); 

  // Formulario
  const [formData, setFormData] = useState({
    originWarehouse: '',
    destinationWarehouse: '',
    originProjectId: '',     
    destinationProjectId: '', 
    authorizedBy: '',
  });

  // Carrito y Buscador
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [transferSuccess, setTransferSuccess] = useState(null);
  const [lastTransferData, setLastTransferData] = useState(null); 

  // 1. Cargar Datos Iniciales (Mezcla Local y Externa)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Generar folio inicial
        setNextTransferId(`TRF-${Date.now().toString().slice(-6)}`);

        // A. Cargar Bodegas (Local)
        const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(wh || []);

        // B. Cargar Productos (Local)
        const { data: prod } = await supabase.from('products').select('*');
        setProducts(prod || []);

        // C. Cargar PROYECTOS (Formato consistente con InboundReception)
        const { data: proj, error } = await supabaseProcurement
            .from('proyectos')
            .select('id, proyecto, cliente, activo')
            .eq('activo', true)
            .order('proyecto', { ascending: true });

        if (error) throw error;

        // Mapeo ID y Nombre (Proyecto + Cliente) para trazabilidad correcta
        const mappedProjects = proj?.map(p => ({
            id: p.id,
            name: `${p.proyecto} (${p.cliente})`, // Formato estándar del sistema
            proyecto_solo: p.proyecto,
            cliente_solo: p.cliente
        })) || [];
        
        setProjects(mappedProjects);

      } catch (error) {
        console.error("Error cargando datos maestros:", error);
      }
    };
    loadData();
  }, []);

  // 2. Lógica Inteligente de Bodegas
  const availableOrigins = useMemo(() => {
    return warehouses.filter(w => w.id !== formData.destinationWarehouse);
  }, [warehouses, formData.destinationWarehouse]);

  const availableDestinations = useMemo(() => {
    return warehouses.filter(w => w.id !== formData.originWarehouse);
  }, [warehouses, formData.originWarehouse]);


  // 3. Abrir Modal de Selección
  const handleOpenModal = async (product) => {
    if (!formData.originWarehouse) return alert("Selecciona primero la bodega de origen.");
    
    const { data: locs } = await supabase
      .from('product_locations')
      .select('*, locations(full_code, zone, row, shelf)')
      .eq('warehouse_id', formData.originWarehouse)
      .eq('product_id', product.id)
      .gt('quantity', 0);

    if (!locs || locs.length === 0) {
      alert("Este producto no tiene ubicación física asignada en esta bodega (Stock 0 en Racks).");
      return;
    }

    setLocationsForProduct(locs);
    setSelectedProductForModal(product);
    setIsModalOpen(true);
  };

  // 4. Agregar al Carrito
  const handleConfirmFromModal = (distribution) => {
    const totalQty = distribution.reduce((sum, item) => sum + Number(item.quantityToTake), 0);
    if (totalQty <= 0) return alert("Cantidad inválida.");

    const newItem = {
        ...selectedProductForModal,
        transferQty: totalQty,
        distribution: distribution
    };

    setCart([...cart, newItem]);
    setIsModalOpen(false);
    setSelectedProductForModal(null);
    setSearchTerm('');
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // 5. GUARDAR TRASPASO (CON PROYECTOS CORRECTOS Y FOLIO VISIBLE)
  const handleSaveTransfer = async () => {
    if (!formData.originWarehouse || !formData.destinationWarehouse) return alert("Faltan bodegas.");
    if (!formData.authorizedBy) return alert("Falta autorización.");
    if (cart.length === 0) return alert("Carrito vacío.");

    const confirm = window.confirm(`¿Confirmar Traspaso ${nextTransferId}? Se generará una Orden de Entrada en destino.`);
    if (!confirm) return;

    setLoading(true);
    try {
        const transferId = nextTransferId;
        const originWhName = warehouses.find(w => w.id === formData.originWarehouse)?.name;
        const destWhName = warehouses.find(w => w.id === formData.destinationWarehouse)?.name;

        // Obtener nombres de proyectos con el formato Proyecto (Cliente) capturado en el loadData
        const originProjName = projects.find(p => p.id == formData.originProjectId)?.name || 'Sin Asignar';
        const destProjName = projects.find(p => p.id == formData.destinationProjectId)?.name || 'Sin Asignar';

        // A. REGISTRO EN TABLA MAESTRA (Para trazabilidad y PDF)
        const { error: masterError } = await supabase.from('transfers').insert({
            transfer_number: transferId,
            origin_warehouse_id: formData.originWarehouse,
            destination_warehouse_id: formData.destinationWarehouse,
            origin_project_name: originProjName,
            destination_project_name: destProjName,
            authorized_by: formData.authorizedBy,
            user_email: user?.email
        });

        if (masterError) throw masterError;

        for (const item of cart) {
            // B. ORIGEN: Restar de Racks
            for (const dist of item.distribution) {
                if (dist.quantityToTake > 0) {
                    const { data: currentLoc } = await supabase.from('product_locations')
                        .select('quantity').eq('id', dist.tableId).single();
                    
                    const newQty = (currentLoc?.quantity || 0) - Number(dist.quantityToTake);
                    
                    if (newQty <= 0) {
                        await supabase.from('product_locations').delete().eq('id', dist.tableId);
                    } else {
                        await supabase.from('product_locations').update({ quantity: newQty }).eq('id', dist.tableId);
                    }

                    // Registro Movimiento SALIDA (Con trazabilidad de proyectos)
                    await supabase.from('movements').insert({
                        type: 'TRANSFER_OUT',
                        warehouse_id: formData.originWarehouse,
                        product_id: item.id,
                        quantity: dist.quantityToTake,
                        transfer_number: transferId,
                        authorized_by: formData.authorizedBy,
                        origin_warehouse_id: formData.originWarehouse,
                        destination_warehouse_id: formData.destinationWarehouse,
                        project_origin: originProjName,      
                        project_destination: destProjName,   
                        other_data: `Desde Rack: ${dist.locationCode}`,
                        comments: `Traspaso ID: ${transferId}`,
                        user_email: user?.email
                    });
                }
            }

            // C. DESTINO: Registrar Entrada (Pendiente de Put-Away)
            await supabase.from('movements').insert({
                type: 'TRANSFER_IN',
                warehouse_id: formData.destinationWarehouse,
                product_id: item.id,
                quantity: item.transferQty,
                transfer_number: transferId,
                authorized_by: formData.authorizedBy,
                origin_warehouse_id: formData.originWarehouse,
                destination_warehouse_id: formData.destinationWarehouse,
                project_origin: originProjName,
                project_destination: destProjName,
                other_data: `Recepción de Traspaso. Pendiente de Ubicar.`,
                comments: `Origen: ${originWhName} | Doc: ${transferId}`,
                user_email: user?.email
            });
        }

        // PREPARAR DATOS PARA EL PDF (Solo tras éxito)
        setLastTransferData({
            transfer_number: transferId,
            origin_wh_name: originWhName,
            dest_wh_name: destWhName,
            origin_project: originProjName,
            dest_project: destProjName,
            authorized_by: formData.authorizedBy,
            items: cart
        });

        setTransferSuccess(transferId);
        setCart([]);
        // Generar nuevo folio para el siguiente traspaso
        setNextTransferId(`TRF-${Date.now().toString().slice(-6)}`);
        alert(`✅ Traspaso ${transferId} generado exitosamente.`);

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
    } finally {
        setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return [];
    return products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10);
  }, [searchTerm, products]);

  return (
    <div className="pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 text-indigo-700">
                <ArrowRightLeft/> Traspaso de Materiales
            </h1>
            <p className="text-xs text-slate-500">Mover stock entre bodegas o proyectos</p>
          </div>
          <button onClick={() => navigate('/gestion')} className="text-sm font-bold text-slate-500 hover:text-slate-800">Volver</button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Building2 size={18}/> Ruta del Traspaso</h3>
                <div className="space-y-4">
                    <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                        <Combobox
                            options={availableOrigins}
                            value={formData.originWarehouse}
                            onChange={(val) => {setFormData({...formData, originWarehouse: val}); setCart([]); setLastTransferData(null);}}
                            placeholder="-- Seleccionar Bodega Origen --"
                            label="Bodega de Origen (Sale)"
                        />
                    </div>
                    
                    <div className="flex justify-center -my-2 relative z-10">
                        <ArrowRightLeft size={16} className="rotate-90 bg-white rounded-full p-1 border text-slate-400"/>
                    </div>
                    
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                        <Combobox
                            options={availableDestinations}
                            value={formData.destinationWarehouse}
                            onChange={(val) => setFormData({...formData, destinationWarehouse: val})}
                            placeholder="-- Seleccionar Bodega Destino --"
                            label="Bodega de Destino (Entra)"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><UserCheck size={18}/> Datos del Proyecto</h3>
                
                {projects.length === 0 && (
                     <div className="text-xs text-orange-500 mb-2 flex gap-1 items-center bg-orange-50 p-2 rounded">
                        <Loader size={12} className="animate-spin"/> Cargando proyectos externos...
                     </div>
                )}

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-slate-400">Autorizado Por:</label>
                        <input type="text" className="w-full border p-2 rounded-lg outline-none" placeholder="Nombre Supervisor" value={formData.authorizedBy} onChange={e => setFormData({...formData, authorizedBy: e.target.value})} />
                    </div>
                    
                    <div>
                        <Combobox
                            options={[{ id: '', name: '-- Sin Proyecto Específico --' }, ...projects]}
                            value={formData.originProjectId}
                            onChange={(val) => setFormData({...formData, originProjectId: val})}
                            placeholder="-- Sin Proyecto --"
                            label="Proyecto Origen"
                        />
                    </div>

                    <div>
                        <Combobox
                            options={[{ id: '', name: '-- Sin Proyecto Específico --' }, ...projects]}
                            value={formData.destinationProjectId}
                            onChange={(val) => setFormData({...formData, destinationProjectId: val})}
                            placeholder="-- Sin Proyecto --"
                            label="Proyecto Destino"
                        />
                    </div>
                </div>
            </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
            <div className={`bg-white p-5 rounded-xl shadow-sm border transition-all ${!formData.originWarehouse ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3 border bg-slate-50 p-3 rounded-xl mb-4">
                    <Search className="text-slate-400"/>
                    <input type="text" placeholder="Buscar producto en bodega origen..." className="bg-transparent w-full outline-none font-medium" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                {searchTerm && (
                    <div className="max-h-60 overflow-y-auto border rounded-lg divide-y bg-white absolute shadow-xl w-full max-w-2xl z-20">
                        {filteredProducts.map(prod => (
                            <div key={prod.id} className="p-3 hover:bg-indigo-50 cursor-pointer flex justify-between items-center" onClick={() => handleOpenModal(prod)}>
                                <div><p className="font-bold text-sm text-slate-700">{prod.name}</p><p className="text-xs font-mono text-slate-400">{prod.code}</p></div>
                                <div className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold">Seleccionar</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden min-h-[400px] flex flex-col">
                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-sm">
                            <FileText size={20}/>
                        </div>
                        <div>
                            <h3 className="font-bold text-indigo-900">Detalle del Traspaso</h3>
                            <span className="text-[10px] font-mono text-indigo-500 uppercase tracking-wider">Folio: {nextTransferId}</span>
                        </div>
                    </div>
                    <span className="bg-indigo-200 text-indigo-800 text-xs font-bold px-2 py-1 rounded-full">{cart.length} Ítems</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {cart.map(item => (
                        <div key={item.id} className="bg-white border p-3 rounded-lg shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <div><p className="font-bold text-sm text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.code}</p></div>
                                <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={18}/></button>
                            </div>
                            <div className="bg-slate-50 p-2 rounded text-xs text-slate-600 space-y-1">
                                {item.distribution.map((dist, idx) => (
                                    dist.quantityToTake > 0 && (
                                        <div key={idx} className="flex justify-between border-b border-slate-200 last:border-0 pb-1">
                                            <span>Retiro desde: <b>{dist.locationCode}</b></span>
                                            <span className="font-bold text-indigo-600">{dist.quantityToTake} UN</span>
                                        </div>
                                    )
                                ))}
                            </div>
                            <div className="text-right mt-2 text-sm font-bold text-slate-800 border-t pt-2">Total Traspaso: {item.transferQty} UN</div>
                        </div>
                    ))}
                    {cart.length === 0 && <div className="text-center text-slate-400 mt-20">Carrito vacío</div>}
                </div>
                <div className="p-4 bg-slate-50 border-t flex flex-col gap-3">
                    
                    {/* BOTÓN PDF (Solo tras éxito) */}
                    {lastTransferData && (
                        <PDFDownloadLink 
                            document={<TransferPDF data={lastTransferData}/>} 
                            fileName={`Traspaso_${lastTransferData.transfer_number}.pdf`}
                        >
                            {({ loading }) => (
                                <button className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md flex justify-center items-center gap-2">
                                    {loading ? 'Generando...' : <><FileText size={20}/> Descargar Traspaso {lastTransferData.transfer_number}</>}
                                </button>
                            )}
                        </PDFDownloadLink>
                    )}

                    <button 
                        onClick={handleSaveTransfer} 
                        disabled={loading || cart.length === 0} 
                        className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                        {loading ? 'Procesando...' : <><Save size={20}/> Confirmar Traspaso {nextTransferId}</>}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {isModalOpen && selectedProductForModal && (
        <DistributionModal 
            product={selectedProductForModal} 
            locations={locationsForProduct} 
            onConfirm={handleConfirmFromModal} 
            onClose={() => setIsModalOpen(false)} 
        />
      )}
    </div>
  );
}

// COMPONENTE MODAL (Mantenido intacto)
function DistributionModal({ product, locations, onConfirm, onClose }) {
    const [inputs, setInputs] = useState({}); 

    const handleInputChange = (tableId, maxStock, value) => {
        let val = Number(value);
        if (val < 0) val = 0;
        if (val > maxStock) val = maxStock;
        setInputs(prev => ({ ...prev, [tableId]: val }));
    };

    const handleSave = () => {
        const distribution = locations.map(loc => ({
            tableId: loc.id,
            locationId: loc.location_id,
            locationCode: loc.locations ? loc.locations.full_code : '???',
            quantityToTake: inputs[loc.id] || 0
        })).filter(d => d.quantityToTake > 0);
        onConfirm(distribution);
    };

    const totalSelected = Object.values(inputs).reduce((a, b) => a + b, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="font-bold text-lg text-slate-800">Seleccionar Origen del Material</h3>
                        <p className="text-xs text-slate-500">{product.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                </div>
                
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                        <MapPin size={16}/> Indica cuánto retirar de cada ubicación:
                    </div>
                    {locations.map(loc => (
                        <div key={loc.id} className="flex items-center justify-between p-3 border rounded-xl hover:border-indigo-300 transition-colors">
                            <div>
                                <p className="font-black text-slate-700 text-lg">{loc.locations?.full_code}</p>
                                <p className="text-[10px] text-slate-400">Z:{loc.locations?.zone} | F:{loc.locations?.row} | N:{loc.locations?.shelf}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-slate-400 mb-1">Stock: {loc.quantity}</p>
                                <input type="number" min="0" max={loc.quantity} className="w-20 p-2 text-center font-black text-indigo-600 border-2 rounded-lg focus:border-indigo-500 outline-none" value={inputs[loc.id] || ''} placeholder="0" onChange={(e) => handleInputChange(loc.id, loc.quantity, e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-5 border-t bg-slate-50 flex justify-between items-center">
                    <div className="text-sm">
                        <span className="block text-slate-500">Total a Traspasar:</span>
                        <span className="font-black text-2xl text-indigo-700">{totalSelected} UN</span>
                    </div>
                    <button onClick={handleSave} disabled={totalSelected === 0} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black disabled:opacity-50">Confirmar</button>
                </div>
            </div>
        </div>
    );
}