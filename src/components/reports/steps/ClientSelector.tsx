'use client';

import { useState, useMemo } from 'react';
import { Search, Building2, User, Check } from 'lucide-react';
import type { Client } from '@/types';

type Props = {
  clients: Client[];
  selectedClientId: string | null;
  onSelect: (id: string | null) => void;
};

export default function ClientSelector({ clients, selectedClientId, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.contact_person || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  return (
    <div className="space-y-4">
      {/* All Clients option */}
      <button
        onClick={() => onSelect(null)}
        className={`
          w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer
          ${!selectedClientId
            ? 'border-blue-500 bg-blue-50/50 shadow-sm shadow-blue-500/10'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }
        `}
      >
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center
          ${!selectedClientId ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}
        `}>
          <Building2 className="w-5 h-5" />
        </div>
        <div className="text-left flex-1">
          <p className="font-medium text-slate-800">All Clients</p>
          <p className="text-xs text-slate-500">Include all clients in the report</p>
        </div>
        {!selectedClientId && (
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </button>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                     bg-white placeholder:text-slate-400"
        />
      </div>

      {/* Client list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No clients found</p>
        ) : (
          filtered.map(client => {
            const isSelected = selectedClientId === client.id;
            return (
              <button
                key={client.id}
                onClick={() => onSelect(client.id)}
                className={`
                  w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm shadow-blue-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }
                `}
              >
                <div className={`
                  w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold
                  ${isSelected
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500'
                  }
                `}>
                  {client.name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{client.name}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                    {client.company_name && (
                      <span className="flex items-center gap-1 truncate">
                        <Building2 className="w-3 h-3" />
                        {client.company_name}
                      </span>
                    )}
                    {client.contact_person && (
                      <span className="flex items-center gap-1 truncate">
                        <User className="w-3 h-3" />
                        {client.contact_person}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
