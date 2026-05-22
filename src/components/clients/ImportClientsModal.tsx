'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Upload, AlertCircle, CheckCircle, Download } from 'lucide-react';

type ImportRow = {
  rowNumber: number;
  name:          string;
  company_name:  string;
  contact_person:string;
  email:         string;
  phone:         string;
  city:          string;
  country:       string;
  currency:      string;
  notes:         string;
  errors:        string[];
};

const EXPECTED_HEADERS = ['Name', 'Company', 'Contact Person', 'Email', 'Phone', 'City', 'Country', 'Currency', 'Notes'];
const VALID_CURRENCIES  = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];

function normalizeHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value.trim());
      if (row.some(c => c.length > 0)) rows.push(row);
      row = []; value = '';
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(c => c.length > 0)) rows.push(row);
  return rows;
}

function parseFile(text: string): { rows: ImportRow[]; error: string | null } {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };

  const headers  = csvRows[0].map(normalizeHeader);
  const hi = (names: string[]) => names.map(n => headers.indexOf(normalizeHeader(n))).find(i => i >= 0) ?? -1;

  const nameIdx    = hi(['name', 'client_name']);
  const companyIdx = hi(['company', 'company_name', 'business_name', 'organisation']);
  const contactIdx = hi(['contact_person', 'contact', 'contact_name']);
  const emailIdx   = hi(['email', 'email_address']);
  const phoneIdx   = hi(['phone', 'phone_number', 'mobile', 'telephone']);
  const cityIdx    = hi(['city', 'town']);
  const countryIdx = hi(['country']);
  const currencyIdx= hi(['currency', 'currency_code']);
  const notesIdx   = hi(['notes', 'note', 'remarks']);

  if (nameIdx < 0) return { rows: [], error: 'CSV must include a "Name" column.' };

  const rows = csvRows.slice(1).map((row, i) => {
    const get = (idx: number) => (idx >= 0 ? row[idx]?.trim() ?? '' : '');
    const currency = get(currencyIdx).toUpperCase() || 'UGX';
    const errors: string[] = [];

    const name = get(nameIdx);
    if (!name) errors.push('Name is required.');
    if (get(emailIdx) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(get(emailIdx))) errors.push('Invalid email address.');
    if (!VALID_CURRENCIES.includes(currency)) errors.push(`Currency must be one of: ${VALID_CURRENCIES.join(', ')}.`);

    return {
      rowNumber:      i + 2,
      name,
      company_name:   get(companyIdx),
      contact_person: get(contactIdx),
      email:          get(emailIdx),
      phone:          get(phoneIdx),
      city:           get(cityIdx),
      country:        get(countryIdx),
      currency,
      notes:          get(notesIdx),
      errors,
    } satisfies ImportRow;
  }).filter(r => r.name || r.email || r.company_name);

  if (rows.length === 0) return { rows: [], error: 'No valid rows found in the CSV.' };
  return { rows, error: null };
}

function downloadTemplate() {
  const csv = [EXPECTED_HEADERS, ['Acme Corp', 'Acme Ltd', 'Jane Doe', 'jane@acme.com', '+256 700 000 000', 'Kampala', 'Uganda', 'UGX', 'Sample client']]
    .map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clients-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

type ImportClientsModalProps = {
  open:       boolean;
  onClose:    () => void;
  companyId:  string;
  onImported: (count: number) => void;
};

type ImportPhase = 'pick' | 'preview' | 'importing' | 'done';

export function ImportClientsModal({ open, onClose, companyId, onImported }: ImportClientsModalProps) {
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>('pick');
  const [rows,  setRows]  = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  function reset() {
    setPhase('pick');
    setRows([]);
    setParseError(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows: parsed, error } = parseFile(text);
    if (error) { setParseError(error); setRows([]); return; }
    setParseError(null);
    setRows(parsed);
    setPhase('preview');
  }

  const validRows   = rows.filter(r => r.errors.length === 0);
  const invalidRows = rows.filter(r => r.errors.length > 0);

  async function handleImport() {
    if (validRows.length === 0) return;
    setPhase('importing');
    setImportError(null);

    // Generate client codes
    const year   = new Date().getFullYear();
    const prefix = `CLT-${year}-`;
    const res    = await fetch(`/api/clients/bulk-import`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        company_id: companyId,
        clients:    validRows.map(r => ({
          name:           r.name,
          company_name:   r.company_name  || null,
          contact_person: r.contact_person || null,
          email:          r.email         || null,
          phone:          r.phone         || null,
          city:           r.city          || null,
          country:        r.country       || null,
          currency:       r.currency,
          notes:          r.notes         || null,
        })),
      }),
    });

    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setImportError(data.error ?? 'Import failed. Please try again.');
      setPhase('preview');
      return;
    }

    const data = await res.json() as { imported?: number };
    setImportedCount(data.imported ?? validRows.length);
    setPhase('done');
    onImported(data.imported ?? validRows.length);
  }

  const title = phase === 'pick'      ? 'Import Clients'
              : phase === 'preview'   ? `Preview — ${rows.length} row${rows.length !== 1 ? 's' : ''}`
              : phase === 'importing' ? 'Importing…'
              : 'Import Complete';

  return (
    <Modal open={open} onClose={handleClose} title={title} maxWidth="lg">
      {phase === 'pick' && (
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600">
            Upload a CSV file to bulk-import clients. The file must include a <strong>Name</strong> column.
            Other columns are optional.
          </p>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-3 py-2 rounded-lg"
          >
            <Download className="h-4 w-4" /> Download Template
          </button>
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Click to choose a CSV file</p>
            <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
          {parseError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}
          <p className="text-xs text-slate-400">Supported columns: {EXPECTED_HEADERS.join(', ')}</p>
        </div>
      )}

      {phase === 'preview' && (
        <div className="flex flex-col">
          {/* Summary bar */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-sm flex-shrink-0">
            <span className="text-green-700 font-medium"><CheckCircle className="h-3.5 w-3.5 inline mr-1" />{validRows.length} valid</span>
            {invalidRows.length > 0 && (
              <span className="text-red-600 font-medium"><AlertCircle className="h-3.5 w-3.5 inline mr-1" />{invalidRows.length} with errors (will be skipped)</span>
            )}
          </div>
          {importError && (
            <div className="mx-6 mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}
          {/* Table */}
          <div className="overflow-auto max-h-72 flex-1">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['#', 'Name', 'Company', 'Email', 'Phone', 'Currency', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr key={row.rowNumber} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 text-slate-400">{row.rowNumber}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.name || <span className="text-slate-400 italic">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.company_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.email || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.phone || '—'}</td>
                    <td className="px-3 py-2 font-mono">{row.currency}</td>
                    <td className="px-3 py-2">
                      {row.errors.length > 0
                        ? <span className="text-red-600 font-medium" title={row.errors.join('\n')}>⚠ {row.errors[0]}</span>
                        : <span className="text-green-600">✓</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Actions */}
          <div className="p-4 border-t border-slate-200 flex gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={reset}
              className="flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50 py-2 rounded-lg text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={validRows.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              Import {validRows.length} Client{validRows.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {phase === 'importing' && (
        <div className="p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium">Importing clients…</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="p-10 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Import complete!</h3>
          <p className="text-slate-500 text-sm">{importedCount} client{importedCount !== 1 ? 's' : ''} imported successfully.</p>
          <button
            onClick={handleClose}
            className="mt-5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2 rounded-lg font-medium"
          >
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
