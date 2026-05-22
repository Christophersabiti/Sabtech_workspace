import { QuotationStatus } from '@/types';

const STATUS_STYLES: Record<QuotationStatus, string> = {
  draft:     'bg-slate-100 text-slate-600',
  sent:      'bg-blue-100 text-blue-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  expired:   'bg-amber-100 text-amber-700',
  converted: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<QuotationStatus, string> = {
  draft:     'Draft',
  sent:      'Sent',
  approved:  'Approved',
  rejected:  'Rejected',
  expired:   'Expired',
  converted: 'Converted',
};

type QuotationStatusBadgeProps = {
  status: QuotationStatus;
};

export function QuotationStatusBadge({ status }: QuotationStatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
