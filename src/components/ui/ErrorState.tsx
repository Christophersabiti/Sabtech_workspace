import { AlertCircle } from 'lucide-react';

type ErrorStateProps = {
  message:    string;
  retry?:     () => void;
  className?: string;
};

export function ErrorState({ message, retry, className = '' }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center ${className}`}>
      <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
      <p className="text-red-600 font-medium mb-1">Something went wrong</p>
      <p className="text-slate-500 text-sm mb-4">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
