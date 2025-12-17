import React, { useState, useEffect } from 'react';
import { Search, X, Loader } from 'lucide-react';

export default function GoogleSearchBar({ onSearch, placeholder = "Buscar...", initialValue = "", type = "text", loading = false }) {
  const [query, setQuery] = useState(initialValue);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // 1. Lógica de "Debounce": Espera 600ms después de que dejas de escribir
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  // 2. Disparar Búsqueda: Se ejecuta solo cuando el texto "reposado" cambia
  useEffect(() => {
    // Evitamos buscar si es lo mismo que ya se buscó
    onSearch(debouncedQuery);
  }, [debouncedQuery]);

  return (
    <div className="relative w-full max-w-3xl mx-auto group z-20">
      {/* Icono Lupa */}
      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
        <Search className={`h-5 w-5 transition-colors ${query ? 'text-blue-500' : 'text-slate-400'}`} />
      </div>

      {/* Input Estilo Google */}
      <input
        type={type}
        className="block w-full pl-12 pr-12 py-4 bg-white border border-slate-200 rounded-full 
                   leading-5 placeholder-slate-400 text-slate-700 font-medium text-lg
                   shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)] 
                   focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 
                   hover:shadow-[0_8px_25px_-5px_rgba(0,0,0,0.1)] transition-all duration-300"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* Icono Carga o Borrar */}
      <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
        {loading ? (
          <Loader className="h-5 w-5 text-blue-500 animate-spin" />
        ) : query ? (
          <button
            onClick={() => setQuery('')}
            className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}