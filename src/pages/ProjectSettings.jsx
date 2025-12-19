import React, { useState, useEffect } from 'react';
import { 
  Search, Briefcase, User, Calendar, DollarSign, 
  Copy, CheckCircle, XCircle, Info, Loader
} from 'lucide-react';
import { supabaseProcurement } from '../services/procurementClient';
import Combobox from '../components/Combobox';

export default function ProjectSettings() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVO'); // Filtro por defecto: activos

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      // Conexión a la Base de Datos Externa (Consultas)
      const { data, error } = await supabaseProcurement
        .from('proyectos')
        .select('*')
        .order('proyecto', { ascending: true });

      if (error) throw error;
      setProjects(data);
      
      // Extraer valores únicos de estado_proyecto
      const uniqueStatuses = [...new Set(data.map(p => p.estado_proyecto).filter(Boolean))];
    } catch (error) {
      console.error('Error cargando proyectos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Formateador de Moneda (Peso Chileno)
  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  // Formateador de Fecha
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  // Función para copiar datos (WhatsApp style)
  const handleCopyInfo = (p) => {
    const textToCopy = `
🏗️ *FICHA DE PROYECTO*
📌 *${p.proyecto}*
-------------------------
👤 *Cliente:* ${p.cliente || 'No especificado'}
💰 *Presupuesto:* ${formatCurrency(p.presupuesto_total)}
📅 *Inicio:* ${formatDate(p.fecha_inicio)}
🏁 *Término:* ${formatDate(p.fecha_termino)}
📊 *Estado:* ${p.estado_proyecto || 'S/I'}
📝 *Obs:* ${p.observacion || '-'}
    `.trim();

    navigator.clipboard.writeText(textToCopy)
      .then(() => alert('📋 ¡Ficha copiada al portapapeles!'))
      .catch(err => console.error('Error al copiar:', err));
  };

  // Filtro de búsqueda y estado
  const filteredProjects = projects.filter(p => {
    const matchesSearch = 
      (p.proyecto || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cliente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.estado_proyecto || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = true; // Por defecto mostrar todos si no hay filtro
    
    if (statusFilter === 'ACTIVO') {
      matchesStatus = p.activo === true;
    } else if (statusFilter === 'Inactivo') {
      matchesStatus = p.activo === false;
    }
    // Si statusFilter es 'TODOS', matchesStatus queda true
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Header y Buscador (Sin botón crear) */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Cartera de Proyectos</h2>
           <p className="text-xs text-slate-500">
             Total: {projects.length} | Mostrando: {filteredProjects.length} | Conexión externa: Consultas
           </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          {/* Filtro de Estado */}
          <Combobox
            options={[
              { id: 'ACTIVO', name: 'Activos' },
              { id: 'Inactivo', name: 'Inactivos' },
              { id: 'TODOS', name: 'Todos' }
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
            placeholder="Estado"
          />

          {/* Buscador */}
          <div className="w-full md:w-80 relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por nombre, cliente o estado..." 
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grid de Tarjetas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
           <div className="col-span-full py-20 text-center text-slate-400 flex flex-col items-center">
              <Loader className="animate-spin mb-2" size={32}/>
              <p>Sincronizando proyectos...</p>
           </div>
        ) : filteredProjects.length === 0 ? (
           <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
              <Briefcase className="mx-auto mb-2 opacity-50" size={48}/>
              <p>No se encontraron proyectos con ese criterio.</p>
           </div>
        ) : (
          filteredProjects.map((project) => (
            <div 
              key={project.id} 
              className="bg-white p-5 rounded-xl border border-slate-200 hover:shadow-md hover:border-blue-300 transition-all group flex flex-col h-full relative overflow-hidden"
            >
                {/* Badge Estado */}
                <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1
                  ${project.activo 
                    ? 'bg-emerald-50 text-emerald-700 border-b border-l border-emerald-100' 
                    : 'bg-slate-100 text-slate-500 border-b border-l border-slate-200'
                  }`}
                >
                    {project.activo ? <CheckCircle size={10}/> : <XCircle size={10}/>}
                    {project.estado_proyecto || (project.activo ? 'Activo' : 'Inactivo')}
                </div>

                {/* Encabezado */}
                <div className="flex items-start gap-4 mb-4 pr-16">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Briefcase size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 leading-snug line-clamp-2" title={project.proyecto}>
                            {project.proyecto}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1 text-slate-500">
                            <User size={12}/>
                            <p className="text-xs truncate max-w-[180px]">{project.cliente || 'Sin cliente'}</p>
                        </div>
                    </div>
                </div>

                {/* Detalles Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5"><Calendar size={10}/> Inicio</span>
                        <span className="font-medium text-slate-700">{formatDate(project.fecha_inicio)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5"><Calendar size={10}/> Término</span>
                        <span className="font-medium text-slate-700">{formatDate(project.fecha_termino)}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-slate-200 mt-1">
                        <span className="text-slate-400 flex items-center gap-1 mb-0.5"><DollarSign size={10}/> Presupuesto Total</span>
                        <span className="font-mono font-bold text-slate-700 text-sm">
                            {formatCurrency(project.presupuesto_total)}
                        </span>
                    </div>
                </div>

                {/* Observaciones (Si existen) */}
                {project.observacion && (
                    <div className="text-xs text-slate-500 mb-4 bg-yellow-50/50 p-2 rounded border border-yellow-100 flex gap-2">
                        <Info size={14} className="text-yellow-500 shrink-0 mt-0.5"/>
                        <p className="line-clamp-2">{project.observacion}</p>
                    </div>
                )}

                {/* Footer / Acciones */}
                <div className="mt-auto pt-3 border-t border-slate-100 flex justify-end">
                    <button 
                        onClick={() => handleCopyInfo(project)}
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        title="Copiar ficha técnica"
                    >
                        <Copy size={14} /> Copiar Ficha
                    </button>
                </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}