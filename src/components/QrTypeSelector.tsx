import { useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { QR_TYPES, type QrCategory } from '../lib/qrTypes';
import type { QrTypeId } from '../types/qr';

interface QrTypeSelectorProps {
  selectedType: QrTypeId;
  onSelectType: (type: QrTypeId) => void;
}

const CATEGORIES: Array<QrCategory | 'Todos'> = [
  'Todos',
  'Básicos y enlaces',
  'Comercio y contenido',
  'Comunicación',
  'Ubicación y mapas',
  'Técnicos y datos',
];

export function QrTypeSelector({ selectedType, onSelectType }: QrTypeSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<QrCategory | 'Todos'>('Todos');

  const currentDef = useMemo(
    () => QR_TYPES.find((t) => t.id === selectedType) || QR_TYPES[0],
    [selectedType]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return QR_TYPES.filter((t) => {
      if (category !== 'Todos' && t.category !== category) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.shortDesc.toLowerCase().includes(q) ||
        String(t.number) === q
      );
    });
  }, [search, category]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-100">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Tipo {currentDef.number} de 29</span>
            <span aria-hidden="true">·</span>
            <span>{currentDef.category}</span>
          </div>
          <h2 className="text-base font-semibold text-slate-900 truncate mt-0.5">
            {currentDef.number}. {currentDef.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{currentDef.scanBehavior}</p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="px-3.5 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>{expanded ? 'Ocultar tipos' : 'Cambiar tipo'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 bg-slate-50/70 space-y-3 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar entre los 29 tipos de QR..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as QrCategory | 'Todos')}
              aria-label="Filtrar por categoría"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
            {filtered.map((item) => {
              const active = item.id === selectedType;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectType(item.id);
                    setExpanded(false);
                  }}
                  className={`text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-900 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold truncate">
                      {item.number}. {item.name}
                    </span>
                  </div>
                  <p
                    className={`text-xs mt-1 line-clamp-2 ${
                      active ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {item.shortDesc}
                  </p>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full py-6 text-center text-sm text-slate-500">
                No se encontraron tipos de QR con ese criterio.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
