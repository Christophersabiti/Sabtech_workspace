import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { FileText, Users, FolderOpen, CreditCard } from 'lucide-react';

export default function DashboardPage() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome to Sabtech Online Invoicing System"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Clients', href: '/clients', icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'Projects', href: '/projects', icon: FolderOpen, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Invoices', href: '/invoices', icon: FileText, color: 'bg-amber-50 text-amber-600' },
          { label: 'Payments', href: '/payments', icon: CreditCard, color: 'bg-green-50 text-green-600' },
        ].map(({ label, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md transition-shadow flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="h-6 w-6" />
            </div>
            <span className="font-semibold text-slate-800">{label}</span>
          </Link>
        ))}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-700 mb-2">Ready to go</h2>
        <p className="text-sm text-slate-500">
          Start by adding a <Link href="/clients" className="text-blue-600 hover:underline">Client</Link>,{' '}
          then create a <Link href="/projects" className="text-blue-600 hover:underline">Project</Link>,{' '}
          and <Link href="/invoices/new" className="text-blue-600 hover:underline">generate your first Invoice</Link>.
        </p>
      </div>
    </div>
  );
}
