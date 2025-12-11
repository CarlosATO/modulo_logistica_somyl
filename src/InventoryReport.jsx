import React, { useState, useMemo, useEffect } from 'react';
import { Search, ArrowDownRight, CheckCircle, FileText, X, BarChart3, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';

// --- COMPONENTES AUXILIARES (BADGES) ---

const StatusBadge = ({ value, isDiff = false, reverse = false }) => {
  if (value === 0 || value === undefined) return <span className="text-slate-300">-</span>;
  
  if (isDiff) {
    if (reverse) {
        if (value > 0) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">Rebajar</span>;
        if (value < 0) return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">Ajustar</span>;
        return <span className="text-emerald-600 font-bold text-[10px]">OK</span>;
    }
    // Diferencias Globales
    if (value < 0) return <span className="font-bold text-rose-600 bg-rose-50 px-1 rounded"> {value.toLocaleString('es-CL')}</span>;
    return <span className="font-bold text-emerald-600 bg-emerald-50 px-1 rounded">+{value.toLocaleString('es-CL')}</span>;
  }
  return <span className="text-slate-700 font-medium">{value.toLocaleString('es-CL')}</span>;
};

// --- MODAL DE DETALLE (Diseño Mejorado) ---

const DetailModal = ({ isOpen, onClose, item, data, type }) => {
  if (!isOpen || !item) return null;

  const projectData = data && data[type] ? data[type] : [];
  
  const totalInstalado = projectData.reduce((acc, curr) => acc + (type === 'FON' ? curr.plano : curr.instalado), 0);
  const totalSap = projectData.reduce((acc, curr) => acc + curr.sap, 0);

  const headerColor = type === 'FON' ? 'bg-orange-600' : 'bg-blue-600';

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className={`${headerColor} text-white p-5 flex justify-between items-center shrink-0 shadow-md`}>
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <BarChart3 size={20} className="text-white/80"/> 
              Detalle de Proyecto: {type}
            </h2>
            <div className="flex items-center gap-2 mt-1 opacity-90 text-sm">
                <span className="font-mono bg-white/20 px-2 rounded">{item.code}</span>
                <span className="truncate max-w-md">{item.desc}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body Modal */}
        <div className="p-6 overflow-y-auto bg-slate-50/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Instalado</p>
                    <p className="text-2xl font-bold text-slate-800">{totalInstalado.toLocaleString('es-CL')}</p>
                </div>
                <FileText className="text-slate-200" size={32}/>
                </div>
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rebajado SAP</p>
                    <p className="text-2xl font-bold text-blue-600">{totalSap.toLocaleString('es-CL')}</p>
                </div>
                <CheckCircle className="text-blue-100" size={32}/>
                </div>
            </div>

          <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2 text-xs uppercase tracking-wide">
            <ArrowDownRight size={14} className="text-slate-400"/> 
            Desglose por Zona
          </h3>
          
          {projectData.length > 0 ? (
            <div className="overflow-hidden bg-white border border-slate-200 rounded-lg shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-xs text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">Zona / TRIOT</th>
                    {type === 'FON' ? (
                      <>
                        <th className="px-4 py-3 text-right">Instalado</th>
                        <th className="px-4 py-3 text-right text-orange-700 bg-orange-50/50">Despuntes</th>
                        <th className="px-4 py-3 text-right text-blue-700 bg-blue-50/50">SAP</th>
                        <th className="px-4 py-3 text-right text-red-700 bg-red-50/50">Estado</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-right">Instalado</th>
                        <th className="px-4 py-3 text-right text-blue-700 bg-blue-50/50">SAP</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors text-xs">
                      <td className="px-4 py-3 font-medium text-slate-700">{row.triot}</td>
                        {type === 'FON' ? (
                        <>
                          <td className="px-4 py-3 text-right font-mono text-slate-600">{Math.round(row.plano).toLocaleString('es-CL')}</td>
                          <td className="px-4 py-3 text-right font-mono text-orange-600">{row.despuntes > 0 ? Math.round(row.despuntes).toLocaleString('es-CL') : '-'}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-600 font-semibold">{Math.round(row.sap).toLocaleString('es-CL')}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            <StatusBadge value={Math.round(row.dif)} isDiff={true} reverse={true} />
                          </td>
                        </>
                        ) : (
                        <>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{Math.round(row.instalado).toLocaleString('es-CL')}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-600">{Math.round(row.sap).toLocaleString('es-CL')}</td>
                        </>
                        )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-slate-400 text-sm">Sin detalles disponibles</p>
            </div>
          )}
          
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-100 text-yellow-800 text-sm flex items-start gap-2">
            <Calculator className="shrink-0 mt-0.5" size={16}/>
            <p className="text-xs leading-relaxed">
                <strong>Nota:</strong> En FON, la columna "Estado" indica la diferencia entre lo instalado y lo rebajado en SAP.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---

export default function InventoryReport() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [summaryData, setSummaryData] = useState([]);
  const [detailData, setDetailData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const filteredData = useMemo(() => {
    const filtered = summaryData.filter(item => 
      (item.desc || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (item.code || '').includes(searchTerm)
    );
    return filtered.sort((a, b) => (a.desc || '').localeCompare(b.desc || ''));
  }, [searchTerm, summaryData]);

  const handleCellClick = (item, type) => {
    if (type === 'ALL') return;
    setSelectedItem(item);
    setFilterType(type);
    setModalOpen(true);
  };

  const calculateTotal = (fot, fon) => fot + fon;
  const calculateBalance = (ing, out) => ing - out;

  const parseMasterSheet = (rows) => {
    const summaryMap = {};
    const detailMap = {};

    rows.forEach(r => {
      const project = (r.proyecto || '').toString().trim().toUpperCase();
      const code = String(r.Catalogo || r['Catalogo'] || r.Catalogo).trim();
      if (!code) return;
      const desc = (r['Catalogo - Descripcion'] || r['Catalogo - Descripcion'] || '').toString().trim();
      const triot = (r.Triot || r.TRIOT || '').toString().trim();
      const instalado = Math.round(Number(r[' INSTALADO '] || r['INSTALADO'] || 0) || 0);
      const despunte = Math.round(Number(r[' DESPUNTE '] || r['DESPUNTE'] || 0) || 0);
      const rebajado = Math.round(Number(r[' REBAJADO '] || r['REBAJADO'] || 0) || 0);
      const ingresosSap = Math.round(Number(r[' INGRESOS SAP '] || r['INGRESOS SAP'] || r.ingresos || 0) || 0);
      const stockReal = Math.round(Number(r[' STOCK  REAL  '] || r['STOCK  REAL '] || 0) || 0);

      if (!summaryMap[code]) summaryMap[code] = { code, desc, ingFot: 0, ingFon: 0, outFot: 0, outFon: 0, despuntesTotal: 0, stockReal: 0, diff: 0 };
      if (!detailMap[code]) detailMap[code] = { FON: [], FOT: [] };

      if (stockReal > 0) summaryMap[code].stockReal = stockReal;
      summaryMap[code].despuntesTotal += despunte;

      if (project === 'FON') {
        summaryMap[code].outFon += instalado;
        summaryMap[code].ingFon += ingresosSap;
        detailMap[code].FON.push({ triot, plano: instalado, despuntes: despunte, sap: rebajado, dif: instalado - rebajado });
      } else {
        summaryMap[code].outFot += instalado;
        summaryMap[code].ingFot += ingresosSap;
        detailMap[code].FOT.push({ triot, ingresos: ingresosSap, instalado, sap: rebajado, dif: instalado - rebajado });
      }
    });

    return { 
        summary: Object.values(summaryMap).map(item => {
            const totalSalidas = item.outFot + item.outFon + item.despuntesTotal;
            const saldoTeorico = (item.ingFot + item.ingFon) - totalSalidas;
            item.diff = item.stockReal - saldoTeorico;
            return item;
        }), 
        detailMap 
    };
  };

  const loadLocalMasterExcel = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/inventario.xlsx');
      if (!res.ok) throw new Error('Archivo no encontrado');
      const data = await res.arrayBuffer();
      const wb = XLSX.read(data);
      const sheet = wb.Sheets['MAESTRO'] || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const { summary, detailMap } = parseMasterSheet(json);
      setSummaryData(summary);
      setDetailData(detailMap);
      setLastUpdate(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadLocalMasterExcel(); }, []);

  return (
    <div className="bg-slate-50 p-4 md:p-6 font-sans text-slate-800 min-h-full">
      
      {/* Header Compacto */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" size={24} />
            Cierre de Inventario
          </h1>
          <p className="text-xs text-slate-500 mt-1">Validación cruzada FOT/FON vs SAP</p>
        </div>
        
        {/* Barra de búsqueda integrada */}
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
                type="text"
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="Buscar por código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
          <span className="text-sm">Procesando datos...</span>
        </div>
      ) : (
      <>
      {/* --- TABLA PRINCIPAL OPTIMIZADA --- */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col max-h-[75vh]">
        <div className="overflow-auto relative"> {/* Container con scroll */}
          <table className="w-full border-collapse text-[11px] md:text-xs">
            
            {/* Header Sticky Grouped */}
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-slate-800 text-white uppercase tracking-wider font-bold text-[10px]">
                <th colSpan="2" className="sticky left-0 z-30 bg-slate-900 border-r border-slate-700 px-2 py-2 text-left w-64">Material</th>
                <th colSpan="3" className="text-center border-r border-slate-700/50 bg-blue-900">Ingresos (Asignación)</th>
                <th colSpan="4" className="text-center border-r border-slate-700/50 bg-slate-700">Salidas (Instalado + Despunte)</th>
                <th colSpan="3" className="text-center border-r border-slate-700/50 bg-indigo-900">Saldo Teórico</th>
                <th colSpan="2" className="text-center bg-emerald-900">Físico</th>
              </tr>
              <tr className="bg-slate-100 text-slate-500 font-semibold uppercase text-[10px] border-b border-slate-200">
                <th className="sticky left-0 z-30 bg-slate-100 px-3 py-2 text-left w-24 border-r border-slate-200">Código</th>
                <th className="sticky left-24 z-30 bg-slate-100 px-3 py-2 text-left min-w-[200px] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Descripción</th>
                
                {/* Ingresos */}
                <th className="px-2 py-2 text-right w-20">FOT</th>
                <th className="px-2 py-2 text-right w-20">FON</th>
                <th className="px-2 py-2 text-right w-20 font-bold text-slate-700 border-r border-slate-200">Total</th>

                {/* Salidas */}
                <th className="px-2 py-2 text-right w-20">FOT</th>
                <th className="px-2 py-2 text-right w-20">FON</th>
                <th className="px-2 py-2 text-right w-20 text-orange-600">Desp.</th>
                <th className="px-2 py-2 text-right w-20 font-bold text-slate-700 border-r border-slate-200">Total</th>

                {/* Saldos */}
                <th className="px-2 py-2 text-right w-20">FOT</th>
                <th className="px-2 py-2 text-right w-20">FON</th>
                <th className="px-2 py-2 text-right w-20 font-bold text-slate-700 border-r border-slate-200">Total</th>

                {/* Realidad */}
                <th className="px-2 py-2 text-right w-20 bg-emerald-50 text-emerald-800">Stock</th>
                <th className="px-2 py-2 text-right w-24 bg-slate-50">Dif.</th>
              </tr>
            </thead>

            {/* Body */}
            <tbody className="divide-y divide-slate-100">
              {filteredData.map((item, idx) => {
                const totalIng = calculateTotal(item.ingFot, item.ingFon);
                const totalOut = calculateTotal(item.outFot, item.outFon) + (item.despuntesTotal || 0);
                const saldoFot = calculateBalance(item.ingFot, item.outFot);
                const saldoFon = calculateBalance(item.ingFon, item.outFon);
                const totalSaldo = saldoFot + saldoFon - (item.despuntesTotal || 0);

                return (
                  <tr key={item.code} className="hover:bg-blue-50/40 transition-colors group h-8">
                    
                    {/* Columnas Fijas (Sticky) */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-blue-50/40 px-3 py-1.5 font-mono text-slate-500 font-semibold border-r border-slate-100 text-[10px] whitespace-nowrap">
                        {item.code}
                    </td>
                    <td className="sticky left-24 z-10 bg-white group-hover:bg-blue-50/40 px-3 py-1.5 font-medium text-slate-700 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] truncate max-w-xs" title={item.desc}>
                      {item.desc}
                    </td>

                    {/* Datos Numéricos */}
                    <td className="px-2 py-1.5 text-right font-mono text-slate-500">{item.ingFot > 0 ? item.ingFot.toLocaleString('es-CL') : '-'}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-slate-500">{item.ingFon > 0 ? item.ingFon.toLocaleString('es-CL') : '-'}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-700 bg-slate-50/50 border-r border-slate-200">{totalIng.toLocaleString('es-CL')}</td>

                    {/* Links Interactivos */}
                    <td className="px-2 py-1.5 text-right font-mono relative p-0">
                        {item.outFot > 0 && (
                            <button onClick={() => handleCellClick(item, 'FOT')} className="w-full text-right text-blue-600 hover:underline decoration-dotted hover:font-bold">{item.outFot.toLocaleString('es-CL')}</button>
                        )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono relative p-0">
                        {item.outFon > 0 && (
                            <button onClick={() => handleCellClick(item, 'FON')} className="w-full text-right text-orange-600 hover:underline decoration-dotted hover:font-bold">{item.outFon.toLocaleString('es-CL')}</button>
                        )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-orange-400 text-[10px]">{item.despuntesTotal > 0 ? item.despuntesTotal.toLocaleString('es-CL') : ''}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-700 bg-slate-50/50 border-r border-slate-200">{totalOut.toLocaleString('es-CL')}</td>

                    {/* Saldos */}
                    <td className={`px-2 py-1.5 text-right font-mono ${saldoFot < 0 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>{saldoFot !== 0 ? saldoFot.toLocaleString('es-CL') : '-'}</td>
                    <td className={`px-2 py-1.5 text-right font-mono ${saldoFon < 0 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>{saldoFon !== 0 ? saldoFon.toLocaleString('es-CL') : '-'}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-700 bg-slate-50/50 border-r border-slate-200">{totalSaldo.toLocaleString('es-CL')}</td>

                    {/* Validación */}
                    <td className="px-2 py-1.5 text-right font-mono bg-emerald-50/30 text-emerald-700 font-bold border-r border-white">{item.stockReal.toLocaleString('es-CL')}</td>
                    <td className="px-2 py-1.5 text-right font-mono bg-slate-50 border-l border-slate-100">
                       <StatusBadge value={item.diff} isDiff={true} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Footer simple con conteo */}
        <div className="bg-slate-50 p-2 border-t border-slate-200 text-xs text-slate-500 flex justify-between px-4">
            <span>Mostrando {filteredData.length} registros</span>
            <span>Última act: {lastUpdate ? lastUpdate.toLocaleTimeString() : '-'}</span>
        </div>
      </div>

      {/* Modal */}
      <DetailModal isOpen={modalOpen} onClose={() => setModalOpen(false)} item={selectedItem} data={selectedItem ? detailData[selectedItem.code] : null} type={filterType} />
      </>
      )}
    </div>
  );
}