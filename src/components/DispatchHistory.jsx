import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Search, FileText, Download, HardHat, User, Truck } from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import DispatchPDF from './DispatchPDF';

const DispatchHistory = ({ defaultSearch }) => {
    const { user } = useAuth();
    const [search, setSearch] = useState(defaultSearch || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (defaultSearch) setSearch(defaultSearch);
    }, [defaultSearch]);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const { data: profile } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single();
                
                // CORRECCIÓN AQUÍ: Quitamos 'name' de location_id
                let query = supabase.from('logis_outbound_documents')
                    .select(`
                        *, 
                        project:project_id(name), 
                        receiver:receiver_id(first_name, last_name, rut), 
                        warehouse:warehouse_id(name), 
                        items:logis_outbound_items(
                            *, 
                            product:product_id(name, sku, unit), 
                            location:location_id(zone, full_code) 
                        )
                    `)
                    .eq('organization_id', profile.organization_id)
                    .order('document_number', { ascending: false });

                if (search) {
                    if (!isNaN(search)) {
                        query = query.eq('document_number', search);
                    }
                }

                const { data, error } = await query.limit(20);
                if (error) throw error;
                setResults(data || []);
            } catch (error) {
                console.error("Error cargando historial:", error);
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(fetchHistory, 300);
        return () => clearTimeout(timeoutId);

    }, [search, user]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Barra de Buscador */}
            <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 items-center">
                <Search className="text-stone-400" />
                <input 
                    placeholder="Buscar por Número de Vale..." 
                    className="flex-grow outline-none text-sm bg-transparent" 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                />
            </div>

            {/* Lista de Resultados */}
            <div className="grid grid-cols-1 gap-4">
                {loading && <div className="text-center p-10 text-stone-400">Cargando historial...</div>}
                
                {!loading && results.length === 0 && (
                    <div className="text-center p-10 border-2 border-dashed border-stone-200 rounded-xl">
                        <FileText className="mx-auto text-stone-300 mb-2" size={32}/>
                        <p className="text-stone-400 italic">No se encontraron documentos.</p>
                    </div>
                )}

                {results.map(doc => (
                    <div key={doc.id} className="bg-white p-6 rounded-xl shadow-sm border border-stone-200 hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-center gap-4">
                        
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="bg-stone-100 p-2 rounded-lg text-stone-600 font-mono font-bold text-lg">
                                    #{doc.document_number}
                                </div>
                                <div>
                                    <p className="text-xs text-stone-400 font-bold uppercase">{new Date(doc.created_at).toLocaleDateString()}</p>
                                    <p className="text-xs text-stone-500">{doc.warehouse?.name}</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">
                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded flex items-center gap-1 border border-blue-100">
                                    <User size={10} /> {doc.receiver?.first_name} {doc.receiver?.last_name}
                                </span>
                                {doc.project && (
                                    <span className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded flex items-center gap-1 border border-orange-100">
                                        <HardHat size={10} /> {doc.project.name}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <PDFDownloadLink 
                                document={<DispatchPDF data={{
                                    document_number: doc.document_number,
                                    dispatch_date: new Date(doc.dispatch_date).toLocaleDateString(),
                                    warehouse_name: doc.warehouse?.name,
                                    project_name: doc.project?.name,
                                    receiver_name: `${doc.receiver?.first_name} ${doc.receiver?.last_name}`,
                                    receiver_rut: doc.receiver?.rut,
                                    destination_zone: doc.destination_zone,
                                    total_cost: doc.total_cost,
                                    items: doc.items.map(i => ({
                                        product_name: i.product?.name,
                                        // CORRECCIÓN: Usamos zone directamente
                                        location_name: i.location?.zone || 'S/N', 
                                        quantity: i.quantity,
                                        unit_cost: i.unit_cost,
                                        total: i.total_line || 0
                                    }))
                                }} />}
                                fileName={`Vale_Salida_${doc.document_number}.pdf`}
                                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 flex items-center gap-2 text-sm shadow-sm transition-transform active:scale-95"
                            >
                                {({ loading }) => loading ? '...' : <><Download size={16}/> Copia PDF</>}
                            </PDFDownloadLink>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DispatchHistory;