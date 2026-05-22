import { Loader2 } from 'lucide-react';

type LoadingSpinnerProps = {
  label?:     string;
  className?: string;
  size?:      'sm' | 'md' | 'lg';
};

const SIZE_CLASSES = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

export function LoadingSpinner({ label, className = '', size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-12 text-slate-400 ${className}`}>
      <Loader2 className={`${SIZE_CLASSES[size]} animate-spin`} />
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  );
}
