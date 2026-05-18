export function StatCard({
  label,
  value,
  sub,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const colorMap = {
    blue: 'border-t-blue-500',
    green: 'border-t-green-500',
    amber: 'border-t-amber-500',
    red: 'border-t-red-500',
    slate: 'border-t-slate-400',
  };
  return (
    <div className={`bg-white rounded-xl border border-slate-200 border-t-4 ${colorMap[color]} p-6 shadow-sm`}>
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}
