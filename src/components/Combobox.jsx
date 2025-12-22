import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export default function Combobox({ options, value, onChange, placeholder, label, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = query === '' 
    ? options 
    : options.filter(opt => opt.name.toLowerCase().includes(query.toLowerCase()) || opt.id?.toString().includes(query));

  const selected = options.find(opt => opt.id === value);

  // Resetear índice enfocado cuando cambia el filtro
  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (!isOpen || filtered.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (filtered[focusedIndex]) {
          onChange(filtered[focusedIndex].id);
          setIsOpen(false);
          setQuery('');
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        break;
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {label && <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{label}</label>}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-white border-2 p-2 rounded-lg font-medium transition-all ${
          disabled ? 'bg-slate-100 cursor-not-allowed opacity-60' : 'hover:border-blue-400 focus:border-blue-600'
        }`}
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[100] mt-1 w-full bg-white border shadow-xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-150">
          <div className="flex items-center border-b p-2 bg-slate-50">
            <Search size={16} className="text-slate-400 mr-2" />
            <input
              ref={inputRef}
              autoFocus
              className="w-full bg-transparent outline-none text-sm"
              placeholder="Escribe para buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.length > 0 ? filtered.map((opt, idx) => (
              <div
                key={opt.id}
                onClick={() => { onChange(opt.id); setIsOpen(false); setQuery(''); }}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={`flex items-center justify-between p-3 cursor-pointer text-sm border-b last:border-0 transition-colors ${
                  idx === focusedIndex ? 'bg-blue-100' : 'hover:bg-blue-50'
                }`}
              >
                <span>{opt.name}</span>
                {value === opt.id && <Check size={14} className="text-blue-600" />}
              </div>
            )) : <div className="p-4 text-center text-slate-400 text-xs">No hay resultados</div>}
          </div>
        </div>
      )}
    </div>
  );
}
