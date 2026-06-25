'use client';

import { useState } from 'react';
import { FileText, FileSpreadsheet, Download, Loader2, CheckSquare, Square } from 'lucide-react';
import { CSV_COLUMNS } from './reportTypes';

type Props = {
  onExportPdf: () => void;
  onExportCsv: (columns: string[]) => void;
  loading: boolean;
  exportingFormat: 'pdf' | 'csv' | null;
};

export default function ExportPanel({ onExportPdf, onExportCsv, loading, exportingFormat }: Props) {
  const [selectedCsvCols, setSelectedCsvCols] = useState<string[]>(
    CSV_COLUMNS.filter(c => c.default).map(c => c.key)
  );

  const toggleCol = (key: string) => {
    setSelectedCsvCols(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const selectAllCols = () => setSelectedCsvCols(CSV_COLUMNS.map(c => c.key));
  const clearAllCols = () => setSelectedCsvCols([]);

  return (
    <div className="grid sm:grid-cols-2 gap-6">
      {/* ─── PDF Export Card ────────────────────────────────── */}
      <div className="border-2 border-slate-200 rounded-2xl p-6 hover:border-blue-300
                      hover:shadow-lg hover:shadow-blue-500/5 transition-all bg-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-800">PDF Report</h4>
            <p className="text-xs text-slate-500">Professional branded document</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4">
          Generate a formatted PDF with company branding, executive summary, task tables,
          financial data, and all selected sections.
        </p>

        <ul className="text-xs text-slate-500 space-y-1 mb-6">
          <li className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-slate-400" /> Company logo and header
          </li>
          <li className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-slate-400" /> Executive summary section
          </li>
          <li className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-slate-400" /> Financial breakdown tables
          </li>
          <li className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-slate-400" /> Milestones, risks & next steps
          </li>
          <li className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-slate-400" /> Confidentiality footer
          </li>
        </ul>

        <button
          onClick={onExportPdf}
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3
                     text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700
                     rounded-xl shadow-sm hover:from-blue-700 hover:to-blue-800
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {loading && exportingFormat === 'pdf' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating PDF...</>
          ) : (
            <><Download className="w-4 h-4" /> Download PDF</>
          )}
        </button>
      </div>

      {/* ─── CSV Export Card ─────────────────────────────────── */}
      <div className="border-2 border-slate-200 rounded-2xl p-6 hover:border-emerald-300
                      hover:shadow-lg hover:shadow-emerald-500/5 transition-all bg-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-800">CSV / Excel</h4>
            <p className="text-xs text-slate-500">Spreadsheet-compatible export</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-3">
          Export task data as CSV with selectable columns. Compatible with Excel, Google Sheets, and Numbers.
        </p>

        {/* Column selector */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-700">Select columns:</span>
            <div className="flex gap-2">
              <button onClick={selectAllCols} className="text-xs text-blue-600 hover:underline cursor-pointer">All</button>
              <button onClick={clearAllCols} className="text-xs text-slate-400 hover:underline cursor-pointer">None</button>
            </div>
          </div>
          <div className="max-h-[180px] overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
            {CSV_COLUMNS.map(col => {
              const isSelected = selectedCsvCols.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleCol(col.key)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left
                             hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  {isSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  )}
                  <span className={isSelected ? 'text-slate-700' : 'text-slate-400'}>{col.label}</span>
                  {col.financial && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">$</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1">{selectedCsvCols.length} columns selected</p>
        </div>

        <button
          onClick={() => onExportCsv(selectedCsvCols)}
          disabled={loading || selectedCsvCols.length === 0}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3
                     text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-emerald-700
                     rounded-xl shadow-sm hover:from-emerald-700 hover:to-emerald-800
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {loading && exportingFormat === 'csv' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating CSV...</>
          ) : (
            <><Download className="w-4 h-4" /> Download CSV</>
          )}
        </button>
      </div>
    </div>
  );
}
