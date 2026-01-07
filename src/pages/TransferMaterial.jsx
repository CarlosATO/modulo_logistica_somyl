import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';
import { supabaseProcurement } from '../services/procurementClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Combobox from '../components/Combobox';
import { PDFDownloadLink, pdf } from '@react-pdf/renderer'; 
import TransferPDF from '../components/TransferPDF'; 
import { 
  ArrowRightLeft, Building2, UserCheck, Search, Trash2, 
  Save, FileText, X, MapPin, Loader, Hash
} from 'lucide-react';

export default function TransferMaterial() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // Datos Maestros
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]); 
  const [products, setProducts] = useState([]); 
  
  // --- MEJORA: Correlativo Secuencial ---
  const [nextTransferId, setNextTransferId] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState(null);
  const [locationsForProduct, setLocationsForProduct] = useState([]); 

  const [formData, setFormData] = useState({
    originWarehouse: '',
    destinationWarehouse: '',
    originProjectId: '',     
    destinationProjectId: '', 
    authorizedBy: '',
  });

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastTransferData, setLastTransferData] = useState(null); 

  // Función para obtener el siguiente folio correlativo
  const fetchNextFolio = async () => {
    try {
        // Contamos cuántos registros hay en la tabla transfers
        const { count, error } = await supabase
            .from('transfers')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;
        
        // Iniciamos desde 0 como solicitaste
        setNextTransferId(`TRF-${count || 0}`);
    } catch (error) {
        console.error("Error obteniendo correlativo:", error);
        setNextTransferId(`TRF-ERR`);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        // Cargar el folio inicial
        await fetchNextFolio();

        const { data: wh } = await supabase.from('warehouses').select('*').eq('is_active', true);
        setWarehouses(wh || []);

        const { data: prod } = await supabase.from('products').select('*');
        setProducts(prod || []);

        // Cargar proyectos con formato Proyecto (Cliente)
        const { data: proj, error } = await supabaseProcurement
            .from('proyectos')
            .select('id, proyecto, cliente, activo')
            .eq('activo', true)
            .order('proyecto', { ascending: true });

        if (error) throw error;

        const mappedProjects = proj?.map(p => ({
            id: p.id,
            name: `${p.proyecto} (${p.cliente})`, 
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

  // Lógica de filtrado de bodegas
  const availableOrigins = useMemo(() => {
    return warehouses.filter(w => w.id !== formData.destinationWarehouse);
  }, [warehouses, formData.destinationWarehouse]);

  const availableDestinations = useMemo(() => {
    return warehouses.filter(w => w.id !== formData.originWarehouse);
  }, [warehouses, formData.originWarehouse]);

  const handleOpenModal = async (product) => {
    if (!formData.originWarehouse) return alert("Selecciona primero la bodega de origen.");
    const { data: locs } = await supabase
      .from('product_locations')
      .select('*, locations(full_code, zone, row, shelf)')
      .eq('warehouse_id', formData.originWarehouse)
      .eq('product_id', product.id)
      .gt('quantity', 0);

    if (!locs || locs.length === 0) {
      alert("Este producto no tiene ubicación física asignada en esta bodega.");
      return;
    }
    setLocationsForProduct(locs);
    setSelectedProductForModal(product);
    setIsModalOpen(true);
  };

  const handleConfirmFromModal = (distribution) => {
    const totalQty = distribution.reduce((sum, item) => sum + Number(item.quantityToTake), 0);
    if (totalQty <= 0) return alert("Cantidad inválida.");
    setCart([...cart, { ...selectedProductForModal, transferQty: totalQty, distribution }]);
    setIsModalOpen(false);
    setSelectedProductForModal(null);
    setSearchTerm('');
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  const handleSaveTransfer = async () => {
    if (!formData.originWarehouse || !formData.destinationWarehouse) return alert("Faltan bodegas.");
    if (!formData.authorizedBy) return alert("Falta autorización.");
    if (cart.length === 0) return alert("Carrito vacío.");

    const confirm = window.confirm(`¿Confirmar Traspaso ${nextTransferId}?`);
    if (!confirm) return;

    setLoading(true);
    try {
        const transferId = nextTransferId;
        const originWhName = warehouses.find(w => w.id === formData.originWarehouse)?.name;
        const destWhName = warehouses.find(w => w.id === formData.destinationWarehouse)?.name;
        const originProjName = projects.find(p => p.id == formData.originProjectId)?.name || 'Sin Asignar';
        const destProjName = projects.find(p => p.id == formData.destinationProjectId)?.name || 'Sin Asignar';

        // Registro en tabla maestra transfers
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

        // Procesar movimientos (Stock)
        for (const item of cart) {
            for (const dist of item.distribution) {
                if (dist.quantityToTake > 0) {
                    const { data: cur } = await supabase.from('product_locations').select('quantity').eq('id', dist.tableId).single();
                    const newQty = (cur?.quantity || 0) - Number(dist.quantityToTake);
                    if (newQty <= 0) await supabase.from('product_locations').delete().eq('id', dist.tableId);
                    else await supabase.from('product_locations').update({ quantity: newQty }).eq('id', dist.tableId);

                    await supabase.from('movements').insert({
                        type: 'TRANSFER_OUT',
                        warehouse_id: formData.originWarehouse,
                        product_id: item.id,
                        quantity: dist.quantityToTake,
                        transfer_number: transferId,
                        authorized_by: formData.authorizedBy,
                        project_origin: originProjName,
                        project_destination: destProjName,
                        other_data: `Rack: ${dist.locationCode}`,
                        user_email: user?.email
                    });
                }
            }
            await supabase.from('movements').insert({
                type: 'TRANSFER_IN',
                warehouse_id: formData.destinationWarehouse,
                product_id: item.id,
                quantity: item.transferQty,
                transfer_number: transferId,
                authorized_by: formData.authorizedBy,
                project_origin: originProjName,
                project_destination: destProjName,
                other_data: `Pendiente Recepción`,
                user_email: user?.email
            });
        }

        setLastTransferData({
            transfer_number: transferId,
            origin_wh_name: originWhName,
            dest_wh_name: destWhName,
            origin_project: originProjName,
            dest_project: destProjName,
            authorized_by: formData.authorizedBy,
            items: cart
        });

        setCart([]);
        alert(`✅ Traspaso ${transferId} completado.`);
        await fetchNextFolio(); // Actualizar folio para el próximo

    } catch (error) {
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
            <p className="text-xs text-slate-500">Gestión correlativa de movimientos</p>
          </div>
          <button onClick={() => navigate('/gestion')} className="text-sm font-bold text-slate-500 hover:text-slate-800">Volver</button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CONFIGURACIÓN */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Building2 size={18}/> Ruta</h3>
                <div className="space-y-4">
                    <Combobox options={availableOrigins} value={formData.originWarehouse} onChange={(val) => {setFormData({...formData, originWarehouse: val}); setCart([]);}} label="Origen" />
                    <div className="flex justify-center -my-2"><ArrowRightLeft size={16} className="rotate-90 text-slate-400"/></div>
                    <Combobox options={availableDestinations} value={formData.destinationWarehouse} onChange={(val) => setFormData({...formData, destinationWarehouse: val})} label="Destino" />
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><UserCheck size={18}/> Proyectos</h3>
                <div className="space-y-3">
                    <input type="text" className="w-full border p-2 rounded-lg outline-none" placeholder="Autorizado Por" value={formData.authorizedBy} onChange={e => setFormData({...formData, authorizedBy: e.target.value})} />
                    <Combobox options={[{ id: '', name: '-- Sin Proyecto --' }, ...projects]} value={formData.originProjectId} onChange={(val) => setFormData({...formData, originProjectId: val})} label="Proyecto Origen" />
                    <Combobox options={[{ id: '', name: '-- Sin Proyecto --' }, ...projects]} value={formData.destinationProjectId} onChange={(val) => setFormData({...formData, destinationProjectId: val})} label="Proyecto Destino" />
                </div>
            </div>
        </div>

        {/* CARRITO Y ACCIONES */}
        <div className="lg:col-span-2 space-y-6">
            <div className={`bg-white p-5 rounded-xl shadow-sm border ${!formData.originWarehouse ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-3 border bg-slate-50 p-3 rounded-xl">
                    <Search className="text-slate-400"/><input type="text" placeholder="Buscar producto..." className="bg-transparent w-full outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                {searchTerm && (
                    <div className="max-h-40 overflow-y-auto border rounded-lg bg-white absolute shadow-xl w-full max-w-lg z-20">
                        {filteredProducts.map(prod => (
                            <div key={prod.id} className="p-3 hover:bg-indigo-50 cursor-pointer" onClick={() => handleOpenModal(prod)}>
                                <p className="font-bold text-sm">{prod.name}</p><p className="text-xs text-slate-400">{prod.code}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-1.5 rounded-lg shadow-sm"><FileText size={20}/></div>
                        <div>
                            <h3 className="font-bold text-indigo-900">Documento de Traspaso</h3>
                            <span className="text-[10px] font-mono text-indigo-500 uppercase font-bold tracking-wider">Folio actual: {nextTransferId}</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-[300px] p-4 space-y-2">
                    {cart.map(item => (
                        <div key={item.id} className="bg-white border p-3 rounded-lg shadow-sm">
                            <div className="flex justify-between font-bold text-sm"><span>{item.name}</span><button onClick={() => removeFromCart(item.id)} className="text-red-400"><Trash2 size={16}/></button></div>
                            <div className="text-xs text-slate-500 mt-1">Cantidad: <span className="text-indigo-600 font-bold">{item.transferQty} UN</span></div>
                        </div>
                    ))}
                    {cart.length === 0 && <div className="text-center text-slate-400 mt-10">Agregue materiales para iniciar</div>}
                </div>

                <div className="p-4 bg-slate-50 border-t flex flex-col gap-3">
                    <div className="flex gap-2">
                        <button onClick={async () => {
                            if (cart.length === 0) return alert('Carrito vacío.');
                            if (!formData.originWarehouse || !formData.destinationWarehouse) return alert('Selecciona origen y destino para la vista previa.');
                            // Construir payload similar al que se guarda
                            const originWhName = warehouses.find(w => w.id === formData.originWarehouse)?.name;
                            const destWhName = warehouses.find(w => w.id === formData.destinationWarehouse)?.name;
                            const originProjName = projects.find(p => p.id == formData.originProjectId)?.name || 'Sin Asignar';
                            const destProjName = projects.find(p => p.id == formData.destinationProjectId)?.name || 'Sin Asignar';
                            const previewData = {
                                transfer_number: nextTransferId || 'BORRADOR',
                                origin_wh_name: originWhName,
                                dest_wh_name: destWhName,
                                origin_project: originProjName,
                                dest_project: destProjName,
                                authorized_by: formData.authorizedBy,
                                items: cart,
                                currency: 'CLP'
                            };
                            try {
                                const blob = await pdf(<TransferPDF data={previewData} />).toBlob();
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                            } catch (err) {
                                console.error('Error generando PDF preview', err);
                                alert('Error generando vista previa del PDF');
                            }
                        }} className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 flex justify-center items-center gap-2">
                            <FileText size={18}/> Vista Previa PDF
                        </button>
                    </div>
                    {lastTransferData && (
                        <PDFDownloadLink document={<TransferPDF data={lastTransferData}/>} fileName={`${lastTransferData.transfer_number}.pdf`}>
                            <button className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 flex justify-center items-center gap-2"><FileText size={18}/> Descargar Comprobante {lastTransferData.transfer_number}</button>
                        </PDFDownloadLink>
                    )}
                    <button onClick={handleSaveTransfer} disabled={loading || cart.length === 0} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 shadow-lg disabled:opacity-50 flex justify-center items-center gap-2">
                        {loading ? <Loader className="animate-spin"/> : <><Save size={20}/> Confirmar {nextTransferId}</>}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {isModalOpen && selectedProductForModal && (
        <DistributionModal product={selectedProductForModal} locations={locationsForProduct} onConfirm={handleConfirmFromModal} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

// COMPONENTE MODAL (Mantenido según requerimiento original)
function DistributionModal({ product, locations, onConfirm, onClose }) {
    const [inputs, setInputs] = useState({}); 
    const handleInputChange = (id, max, val) => setInputs(prev => ({ ...prev, [id]: Math.min(Math.max(Number(val), 0), max) }));
    const handleSave = () => {
        const dist = locations.map(l => ({ tableId: l.id, locationId: l.location_id, locationCode: l.locations?.full_code || '?', quantityToTake: inputs[l.id] || 0 })).filter(d => d.quantityToTake > 0);
        onConfirm(dist);
    };
    const total = Object.values(inputs).reduce((a, b) => a + b, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <div><h3 className="font-bold text-lg">{product.name}</h3><p className="text-xs text-slate-500">Distribución de Rack</p></div>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                    {locations.map(loc => (
                        <div key={loc.id} className="flex items-center justify-between p-3 border rounded-xl">
                            <div><p className="font-black text-slate-700">{loc.locations?.full_code}</p><p className="text-xs text-slate-400">Stock: {loc.quantity}</p></div>
                            <input type="number" className="w-20 p-2 text-center border-2 rounded-lg font-bold text-indigo-600" value={inputs[loc.id] || ''} placeholder="0" onChange={(e) => handleInputChange(loc.id, loc.quantity, e.target.value)} />
                        </div>
                    ))}
                </div>
                <div className="p-5 border-t bg-slate-50 flex justify-between items-center">
                    <span className="font-black text-2xl text-indigo-700">{total} UN</span>
                    <button onClick={handleSave} disabled={total === 0} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold">Confirmar</button>
                </div>
            </div>
        </div>
    );
}