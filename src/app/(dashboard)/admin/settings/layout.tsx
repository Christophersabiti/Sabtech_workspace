'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Wallet, Receipt, Palette } from 'lucide-react';

const tabs = [
  { label: 'Company Profile',  href: '/admin/settings/company',         icon: Building2 },
  { label: 'Payment Methods',  href: '/admin/settings/payment-methods', icon: Wallet },
  { label: 'Invoice Settings', href: '/admin/settings/invoice',         icon: Receipt },
  { label: 'Branding',         href: '/admin/settings/branding',        icon: Palette },
];

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your company profile, payment methods, invoice configuration, and branding.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-slate-200 mb-8">
        {tabs.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-purple-600 text-purple-700 bg-purple-50 rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
