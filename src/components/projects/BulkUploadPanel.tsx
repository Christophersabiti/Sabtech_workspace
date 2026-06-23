'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Upload, Download, X, CheckCircle2, AlertTriangle,
  Loader2, FileText,
} from 'lucide-react';

// ─── Column definition ────────────────────────────────────────────────────────

export type ColumnDef = {
  key: string;         // DB column key + normalized CSV header key
  header: string;      // human-readable CSV header (written to template)
  required: boolean;
  example?: string;    // example value written to template row 2
  allowed?: string[];  // allowed enum values (shown as note)
  parse: (raw: string) => { value: unknown; error: string | null };
};

// ─── CSV helpers (no external library) ───────────────────────────────────────

function encodeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; i++; } else { quoted = !quoted; }
    } else if (char === ',' && !quoted) {
      row.push(value.trim()); value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
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

function normalizeHeader(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedRow = {
  rowNumber: number;
  data: Record<string, unknown>;
  rawValues: Record<string, string>;
  errors: string[];
};

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  columns: ColumnDef[];
  templateFilename: string;
  apiEndpoint: string;
  companyId: string;
  entityLabel: string;     // "milestone", "RAID entry", "change request"
  open: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
};

export function BulkUploadPanel({
  columns, templateFilename, apiEndpoint, companyId,
  entityLabel, open, onClose, onSuccess,
}: Props) {
  const fileInputRef        = useRef<HTMLInputElement>(null);
  const [fileName, setFileName]       = useState<string | null>(null);
  const [rows, setRows]               = useState<ParsedRow[]>([]);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [importing, setImporting]     = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver]   = useState(false);

  // ── Template download ───────────────────────────────────────────────────────

  function downloadTemplate() {
    const headerRow  = columns.map(c => encodeCsvCell(c.header)).join(',');
    const exampleRow = columns.map(c => encodeCsvCell(c.example ?? '')).join(',');
    const notesRow   = columns.map(c => {
      const parts: string[] = [];
      if (c.required) parts.push('REQUIRED');
      if (c.allowed) parts.push(`Allowed: ${c.allowed.join('/')}`);
      return encodeCsvCell(parts.join(' | '));
    }).join(',');

    const csv = [headerRow, `# Notes: ${notesRow}`, exampleRow].join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = templateFilename; link.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV parse ───────────────────────────────────────────────────────────────

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    setRows([]);
    setParseError(null);
    setImportError(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }

    file.text().then(text => {
      const csvRows = parseCsv(text);
      // Skip rows that start with "#" (notes rows)
      const nonComment = csvRows.filter(r => !r[0]?.startsWith('#'));
      if (nonComment.length < 2) {
        setParseError('CSV must have a header row and at least one data row.');
        return;
      }

      const headers   = nonComment[0].map(normalizeHeader);
      const dataRows  = nonComment.slice(1);

      const parsed: ParsedRow[] = dataRows.map((row, idx) => {
        const rawValues: Record<string, string> = {};
        const data: Record<string, unknown>     = {};
        const errors: string[]                  = [];

        columns.forEach(col => {
          const normalizedKey = normalizeHeader(col.header);
          // Try both the key and header variations
          const colIdx = headers.indexOf(normalizedKey) >= 0
            ? headers.indexOf(normalizedKey)
            : headers.indexOf(col.key);
          const raw = colIdx >= 0 ? (row[colIdx] ?? '') : '';
          rawValues[col.key] = raw;

          if (col.required && !raw.trim()) {
            errors.push(`"${col.header}" is required.`);
            data[col.key] = null;
          } else {
            const { value, error } = col.parse(raw);
            data[col.key] = value;
            if (error) errors.push(`"${col.header}": ${error}`);
          }
        });

        return { rowNumber: idx + 2, data, rawValues, errors };
      });

      if (parsed.length === 0) {
        setParseError('No data rows found in the CSV.');
        return;
      }

      setRows(parsed);
    });
  }, [columns]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function handleImport() {
    const validRows = rows.filter(r => r.errors.length === 0);
    if (validRows.length === 0 || !companyId) return;
    setImporting(true);
    setImportError(null);

    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        rows: validRows.map(r => r.data),
      }),
    });

    const json = await res.json().catch(() => ({}));
    setImporting(false);

    if (!res.ok) {
      setImportError(json.error ?? 'Import failed.');
      return;
    }

    onSuccess(json.imported ?? validRows.length);
    reset();
    onClose();
  }

  function reset() {
    setFileName(null);
    setRows([]);
    setParseError(null);
    setImportError(null);
  }

  if (!open) return null;

  const validCount   = rows.filter(r => r.errors.length === 0).length;
  const invalidCount = rows.filter(r => r.errors.length > 0).length;
  const previewCols  = columns.slice(0, 5); // show first 5 cols in preview

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          Bulk Upload — {entityLabel}s
        </p>
        <button
          type="button"
          onClick={() => { reset(); onClose(); }}
          className="p-1 rounded text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Step 1: Template */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1.5">
            1. Download the template, fill it in, then upload.
          </p>
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       text-slate-700 bg-white border border-slate-200 rounded-lg
                       hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template
          </button>
        </div>
      </div>

      {/* Column reference */}
      <div className="text-[10px] text-slate-400 leading-relaxed">
        <span className="font-medium text-slate-500">Columns: </span>
        {columns.map((c, i) => (
          <span key={c.key}>
            <span className={c.required ? 'font-semibold text-slate-600' : ''}>
              {c.header}
              {c.required ? '*' : ''}
              {c.allowed ? ` (${c.allowed.join('/')})` : ''}
            </span>
            {i < columns.length - 1 && ', '}
          </span>
        ))}
        <span className="ml-1 text-slate-300">— * required</span>
      </div>

      {/* Step 2: Upload */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">2. Upload your filled-in CSV.</p>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
            isDragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          {fileName ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium text-slate-700">{fileName}</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); reset(); }}
                className="ml-1 p-0.5 rounded text-slate-400 hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div>
              <Upload className="w-5 h-5 mx-auto mb-1 text-slate-400" />
              <p className="text-xs text-slate-500">
                <span className="font-medium text-blue-600">Click to browse</span>
                {' '}or drag & drop a CSV file
              </p>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {parseError}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-600 font-medium">{rows.length} rows parsed</span>
            {validCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> {validCount} valid
              </span>
            )}
            {invalidCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" /> {invalidCount} errors
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-2 py-1.5 text-left text-slate-500 font-medium">#</th>
                  {previewCols.map(c => (
                    <th key={c.key} className="px-2 py-1.5 text-left text-slate-500 font-medium">
                      {c.header}
                    </th>
                  ))}
                  {columns.length > previewCols.length && (
                    <th className="px-2 py-1.5 text-left text-slate-400 font-medium">
                      +{columns.length - previewCols.length} more
                    </th>
                  )}
                  <th className="px-2 py-1.5 text-left text-slate-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => (
                  <tr
                    key={row.rowNumber}
                    className={row.errors.length > 0 ? 'bg-red-50' : 'bg-white'}
                  >
                    <td className="px-2 py-1.5 text-slate-400">{row.rowNumber}</td>
                    {previewCols.map(c => (
                      <td key={c.key} className="px-2 py-1.5 text-slate-700 max-w-[140px] truncate">
                        {row.rawValues[c.key] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    {columns.length > previewCols.length && (
                      <td className="px-2 py-1.5 text-slate-400">…</td>
                    )}
                    <td className="px-2 py-1.5">
                      {row.errors.length === 0 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <span className="text-red-500" title={row.errors.join('\n')}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="ml-1 text-[10px]">{row.errors[0]}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {importError}
        </div>
      )}

      {/* Import button */}
      {validCount > 0 && (
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={importing}
          className="w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-medium
                     text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
            : `Import ${validCount} ${entityLabel}${validCount !== 1 ? 's' : ''}`}
        </button>
      )}

      {invalidCount > 0 && validCount === 0 && (
        <p className="text-xs text-center text-slate-400">
          Fix the errors above before importing.
        </p>
      )}
    </div>
  );
}
