import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Warehouse, MapPin, Plus, Trash2, Grid, QrCode, Printer, X, Save, Search, Layers, ChevronRight, FileDown } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

export default function LocationSettings() {
    const navigate = useNavigate();

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Formulario para nueva ubicación
    const [formData, setFormData] = useState({ zone: '', row: '', shelf: '' });

    // Estado para el Modal de Etiqueta
    const [labelData, setLabelData] = useState(null);

    // 1. Cargar Bodegas
    useEffect(() => {
        const loadWarehouses = async () => {
            const { data } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
            setWarehouses(data || []);
            if (data?.[0]) setSelectedWarehouse(data[0].id);
        };
        loadWarehouses();
    }, []);

    // 2. Cargar Ubicaciones
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

    // 3. Generar Código Visual
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
        if (!selectedWarehouse) return toast.error("Selecciona una bodega primero.");

        const fullCode = generateCode();

        try {
            const { error } = await supabase.from('locations').insert({
                warehouse_id: selectedWarehouse,
                zone: formData.zone.toUpperCase(),
                row: formData.row.toUpperCase(),
                shelf: formData.shelf.toUpperCase(),
                full_code: fullCode
            });

            if (error) throw error;

            setFormData({ zone: '', row: '', shelf: '' });
            fetchLocations();
            toast.success("✅ Ubicación creada correctamente");

        } catch (err) {
            console.error(err);
            toast.error("Error: Posible código duplicado.");
        }
    };

    // 5. Borrar Ubicación
    const handleDelete = async (id) => {
        if (!window.confirm("¿Borrar esta ubicación? Asegúrate de que esté vacía.")) return;

        try {
            const { error } = await supabase.from('locations').delete().eq('id', id);
            if (error) throw error;
            fetchLocations();
            toast.success("Ubicación eliminada");
        } catch (err) {
            toast.error("No se pudo borrar (posiblemente tenga stock).");
        }
    };

    // 6. Imprimir Etiqueta
    const printLabel = () => {
        const printWindow = window.open('', '', 'width=600,height=600');
        printWindow.document.write(`
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; text-align: center; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .label-container { border: 4px solid black; padding: 40px; }
                    h1 { font-size: 48px; margin: 20px 0; font-weight: 900; font-family: monospace; }
                    p { font-size: 24px; margin: 0; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="label-container">
                    ${document.getElementById('qr-code-svg').outerHTML}
                    <h1>${labelData.full_code}</h1>
                    <p>ZONA ${labelData.zone} - FILA ${labelData.row}</p>
                </div>
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
        </html>
      `);
        printWindow.document.close();
    };

    const filteredLocations = locations.filter(l => l.full_code.includes(searchTerm.toUpperCase()));

    return (
        <div className="space-y-6 animate-in fade-in duration-300 h-[calc(100vh-100px)] flex flex-col">

            {/* HEADER COMPACTO */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Grid size={24} /></div>
                    <div>
                        <h1 className="font-bold text-slate-800 text-lg leading-tight">Mapa de Bodegas</h1>
                        <p className="text-xs text-slate-500">Configuración de Pasillos y Estanterías</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 md:pb-0">
                    {warehouses.map(wh => {
                        const isSelected = selectedWarehouse === wh.id;
                        return (
                            <button key={wh.id} onClick={() => setSelectedWarehouse(wh.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all whitespace-nowrap ${isSelected ? 'bg-orange-600 border-orange-600 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-orange-300'}`}>
                                <Warehouse size={16} />
                                <span className="font-bold">{wh.name}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

                {/* IZQUIERDA: LISTA DE UBICACIONES (TABLA) */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-0">
                    <div className="p-4 border-b flex justify-between items-center gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar código de ubicación..."
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-400 uppercase"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                            {filteredLocations.length} Ubicaciones
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3">Código</th>
                                    <th className="px-6 py-3">Zona</th>
                                    <th className="px-6 py-3 text-center">Fila</th>
                                    <th className="px-6 py-3 text-center">Nivel</th>
                                    <th className="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan="5" className="py-20 text-center text-slate-400">Cargando mapa...</td></tr>
                                ) : filteredLocations.length === 0 ? (
                                    <tr><td colSpan="5" className="py-20 text-center text-slate-400 italic">No se encontraron ubicaciones.</td></tr>
                                ) : (
                                    filteredLocations.map(loc => (
                                        <tr key={loc.id} className="hover:bg-orange-50 transition-colors group">
                                            <td className="px-6 py-3 font-mono font-bold text-slate-700">{loc.full_code}</td>
                                            <td className="px-6 py-3 font-bold text-orange-600">{loc.zone}</td>
                                            <td className="px-6 py-3 text-center text-slate-600">{loc.row}</td>
                                            <td className="px-6 py-3 text-center text-slate-600">{loc.shelf}</td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => setLabelData(loc)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Ver QR"><QrCode size={18} /></button>
                                                    <button onClick={() => handleDelete(loc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Eliminar"><Trash2 size={18} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* DERECHA: FORMULARIO STICKY */}
                <div className="w-full lg:w-80 flex flex-col gap-4">
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-orange-100 sticky top-4 animate-in slide-in-from-right-4">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 pb-4 border-b border-orange-50">
                            <Plus size={20} className="text-orange-500" /> Nueva Ubicación
                        </h3>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Zona / Pasillo</label>
                                <input
                                    placeholder="Ej: PASILLO-A"
                                    className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-orange-400 outline-none uppercase font-bold text-slate-700 transition-all"
                                    value={formData.zone}
                                    onChange={e => setFormData({ ...formData, zone: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fila</label>
                                    <input
                                        placeholder="Ej: 01"
                                        className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-orange-400 outline-none uppercase font-bold text-slate-700 transition-all text-center"
                                        value={formData.row}
                                        onChange={e => setFormData({ ...formData, row: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nivel</label>
                                    <input
                                        placeholder="Ej: N1"
                                        className="w-full border-2 border-slate-100 p-3 rounded-xl bg-slate-50 focus:bg-white focus:border-orange-400 outline-none uppercase font-bold text-slate-700 transition-all text-center"
                                        value={formData.shelf}
                                        onChange={e => setFormData({ ...formData, shelf: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Previsualización Compacta */}
                            <div className="bg-slate-900 p-4 rounded-xl text-center mt-2 shadow-inner">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Vista Previa</p>
                                <p className="text-orange-400 font-mono text-xl tracking-wider font-black truncate">
                                    {selectedWarehouse ? generateCode() : '---'}
                                </p>
                            </div>

                            <button className="w-full bg-orange-600 text-white py-3 rounded-xl font-bold hover:bg-orange-700 shadow-lg shadow-orange-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-center gap-2">
                                <Save size={18} /> Crear Ubicación
                            </button>
                        </form>
                    </div>

                    <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 text-xs text-blue-800">
                        <p className="font-bold flex items-center gap-2 mb-2"><Layers size={14} /> Estructura Recomendada</p>
                        <ul className="list-disc pl-4 space-y-1 opacity-80">
                            <li><strong>ZONA:</strong> Área macro (ej: PASILLO-A, EXTERIOR).</li>
                            <li><strong>FILA:</strong> Número de estantería (ej: 01, 02).</li>
                            <li><strong>NIVEL:</strong> Altura en el rack (ej: N1=Piso, N2, N3).</li>
                        </ul>
                    </div>
                </div>

            </div>

            {/* MODAL QR */}
            {labelData && (
                <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 relative">
                        <button onClick={() => setLabelData(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-2 transition-all"><X size={20} /></button>

                        <div className="p-8 flex flex-col items-center text-center bg-white">
                            <div className="border-4 border-slate-900 p-4 rounded-2xl bg-white mb-6 shadow-xl">
                                <QRCodeSVG id="qr-code-svg" value={labelData.full_code} size={180} />
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 mb-1 uppercase tracking-widest font-mono">{labelData.full_code}</h2>
                            <div className="flex gap-2 text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full mb-4">
                                <span>ZONA {labelData.zone}</span> • <span>FILA {labelData.row}</span> • <span>NIVEL {labelData.shelf}</span>
                            </div>
                            <button onClick={printLabel} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-lg flex justify-center items-center gap-2 transition-transform hover:scale-[1.02]">
                                <Printer size={20} /> Imprimir Etiqueta
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}