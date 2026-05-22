import { PaymentStatus } from '@/types';

const STATUS_STYLES: Record<PaymentStatus, string> = {
  pending:  'bg-amber-100 text-amber-700',
  confirmed:'bg-green-100 text-green-700',
  failed:   'bg-red-100 text-red-600',
  reversed: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending:  'Pending',
  confirmed:'Confirmed',
  failed:   'Failed',
  reversed: 'Reversed',
};

type PaymentStatusBadgeProps = {
  status: PaymentStatus | string;
};

export function PaymentStatusBadge({ status }: PaymentStatusBadgeProps) {
  const style = STATUS_STYLES[status as PaymentStatus] ?? 'bg-slate-100 text-slate-600';
  const label = STATUS_LABELS[status as PaymentStatus] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${style}`}>
      {label}
    </span>
  );
}
