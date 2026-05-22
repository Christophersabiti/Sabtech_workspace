'use client';

import { Modal } from './Modal';
import { AlertTriangle } from 'lucide-react';

type ConfirmDialogProps = {
  open:          boolean;
  onClose:       () => void;
  onConfirm:     () => void;
  title:         string;
  description?:  string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
  loading?:      boolean;
  /** Optional extra content rendered below description (e.g. a textarea for reason) */
  children?:     React.ReactNode;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
  loading      = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth="sm">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          {danger && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 mb-1">{title}</h3>
            {description && (
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        {children && <div className="mb-5">{children}</div>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
