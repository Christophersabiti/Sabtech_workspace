'use client';

import { useState } from 'react';
import { BookOpen, Save, Trash2, FileText, Star, X } from 'lucide-react';
import type { SavedReportTemplate } from '@/types';

type Props = {
  templates: SavedReportTemplate[];
  onLoad: (t: SavedReportTemplate) => void;
  onSave: (name: string, description: string) => void;
  onDelete: (id: string) => void;
};

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  client_weekly: 'Weekly',
  client_monthly: 'Monthly',
  internal_health: 'Health',
  financial: 'Financial',
  task_completion: 'Completion',
  overdue_tasks: 'Overdue',
  milestone: 'Milestone',
  custom: 'Custom',
};

export default function SavedTemplates({ templates, onLoad, onSave, onDelete }: Props) {
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSave(saveName.trim(), saveDesc.trim());
    setSaveName('');
    setSaveDesc('');
    setShowSave(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-blue-500" /> Report Templates
        </h4>
        <button
          onClick={() => setShowSave(!showSave)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100
                     transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          {showSave ? 'Cancel' : 'Save Current'}
        </button>
      </div>

      {/* Save form */}
      {showSave && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Template name..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                       bg-white"
          />
          <input
            type="text"
            value={saveDesc}
            onChange={e => setSaveDesc(e.target.value)}
            placeholder="Description (optional)..."
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
                       bg-white"
          />
          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                       text-white bg-blue-600 rounded-lg hover:bg-blue-700
                       disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Template
          </button>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No saved templates yet
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(template => (
            <div
              key={template.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl
                         hover:border-slate-300 hover:shadow-sm transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                {template.is_system ? (
                  <Star className="w-4 h-4 text-amber-500" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{template.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                    {TEMPLATE_TYPE_LABELS[template.template_type] || 'Custom'}
                  </span>
                  {template.description && (
                    <span className="text-xs text-slate-400 truncate">{template.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onLoad(template)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50
                             rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Load
                </button>
                {!template.is_system && (
                  <button
                    onClick={() => onDelete(template.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
