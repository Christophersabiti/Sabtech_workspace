import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, MinusCircle } from 'lucide-react';

const packages = [
  {
    name: 'Starter',
    key: 'starter',
    monthly: 'UGX 75,000',
    annual: 'UGX 750,000',
    users: '3 users',
    invoices: '50 invoices',
    trial: '7-day trial',
    cta: 'Start Starter trial',
    featured: false,
    features: {
      clients: true,
      projects: true,
      quotations: true,
      invoices: true,
      reports: false,
      branding: false,
      inventory: false,
      accounting: false,
    },
  },
  {
    name: 'Professional',
    key: 'professional',
    monthly: 'UGX 150,000',
    annual: 'UGX 1,500,000',
    users: '10 users',
    invoices: '250 invoices',
    trial: '7-day trial',
    cta: 'Start Professional trial',
    featured: true,
    features: {
      clients: true,
      projects: true,
      quotations: true,
      invoices: true,
      reports: true,
      branding: true,
      inventory: false,
      accounting: false,
    },
  },
  {
    name: 'Business',
    key: 'business',
    monthly: 'UGX 300,000',
    annual: 'UGX 3,000,000',
    users: '25 users',
    invoices: '1,000 invoices',
    trial: '7-day trial',
    cta: 'Start Business trial',
    featured: false,
    features: {
      clients: true,
      projects: true,
      quotations: true,
      invoices: true,
      reports: true,
      branding: true,
      inventory: true,
      accounting: true,
    },
  },
  {
    name: 'Enterprise',
    key: 'enterprise',
    monthly: 'Custom',
    annual: 'Custom',
    users: 'Custom users',
    invoices: 'Custom volume',
    trial: 'Guided trial',
    cta: 'Create Enterprise account',
    featured: false,
    features: {
      clients: true,
      projects: true,
      quotations: true,
      invoices: true,
      reports: true,
      branding: true,
      inventory: true,
      accounting: true,
    },
  },
];

const featureRows = [
  ['clients', 'Client management'],
  ['projects', 'Projects and tasks'],
  ['quotations', 'Quotations'],
  ['invoices', 'Invoices and payments'],
  ['reports', 'Report exports'],
  ['branding', 'Company branding'],
  ['inventory', 'Inventory operations'],
  ['accounting', 'Accounting reports'],
] as const;

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#F4F7FC] text-[#091545]">
      <header className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/welcome">
            <Image src="/brand/sabtech-workspace-horizontal-light.svg" alt="Sabtech Workspace" width={250} height={56} className="h-auto w-52 sm:w-64" />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg border border-[#D8E2EF] px-4 py-2 text-sm font-bold hover:bg-[#F4F7FC]">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-lg bg-[#091545] px-4 py-2 text-sm font-bold text-white hover:bg-[#112068]">
              Start trial
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-14 text-center sm:px-8">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#1D9E75]">Pricing</p>
        <h1 className="mt-3 text-4xl font-black tracking-normal sm:text-5xl">Packages that control real entitlements</h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-slate-600">
          Select a package during onboarding, use the included features during the 7-day trial, and activate billing when the team is ready.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-12 sm:px-8 lg:grid-cols-4">
        {packages.map((pkg) => (
          <div
            key={pkg.key}
            className={`relative rounded-lg border bg-white p-6 shadow-sm ${
              pkg.featured ? 'border-[#2952C8] ring-2 ring-[#2952C8]/20' : 'border-[#D8E2EF]'
            }`}
          >
            {pkg.featured ? (
              <span className="absolute -top-3 left-5 rounded-full bg-[#2952C8] px-3 py-1 text-xs font-black text-white">
                Popular
              </span>
            ) : null}
            <h2 className="text-xl font-black">{pkg.name}</h2>
            <p className="mt-4 text-3xl font-black">{pkg.monthly}</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Monthly</p>
            <p className="mt-4 text-sm font-bold text-[#1D9E75]">{pkg.annual} annually</p>
            <div className="mt-5 space-y-2 border-t border-[#EEF3F8] pt-5 text-sm font-semibold text-slate-600">
              <p>{pkg.users}</p>
              <p>{pkg.invoices}</p>
              <p>{pkg.trial}</p>
            </div>
            <Link
              href={`/signup?plan=${pkg.key}`}
              className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-black ${
                pkg.featured ? 'bg-[#1D9E75] text-white hover:bg-[#168B66]' : 'bg-[#091545] text-white hover:bg-[#112068]'
              }`}
            >
              {pkg.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <div className="overflow-x-auto rounded-lg border border-[#D8E2EF] bg-white">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-[#091545] text-white">
              <tr>
                <th className="px-5 py-4 font-black">Feature</th>
                {packages.map((pkg) => (
                  <th key={pkg.key} className="px-5 py-4 font-black">{pkg.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F8]">
              {featureRows.map(([key, label]) => (
                <tr key={key}>
                  <td className="px-5 py-4 font-bold text-[#091545]">{label}</td>
                  {packages.map((pkg) => (
                    <td key={pkg.key} className="px-5 py-4">
                      {pkg.features[key] ? (
                        <CheckCircle2 className="h-5 w-5 text-[#1D9E75]" />
                      ) : (
                        <MinusCircle className="h-5 w-5 text-slate-300" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
