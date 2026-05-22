import { type LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon?:        LucideIcon;
  title:        string;
  description?: string;
  action?:      React.ReactNode;
  className?:   string;
};

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center ${className}`}>
      {Icon && <Icon className="h-10 w-10 text-slate-300 mb-3" />}
      <p className="text-slate-600 font-medium mb-1">{title}</p>
      {description && <p className="text-slate-400 text-sm mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
