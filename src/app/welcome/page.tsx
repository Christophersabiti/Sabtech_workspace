import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  FolderOpen,
  HelpCircle,
  Layers3,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-react';

const workflows = [
  { label: 'Client intake', icon: Users },
  { label: 'Project delivery', icon: FolderOpen },
  { label: 'Quotations', icon: ClipboardList },
  { label: 'Invoicing', icon: FileText },
  { label: 'Expenses', icon: ReceiptText },
  { label: 'Reports', icon: BarChart3 },
];

const features = [
  'Client management',
  'Projects and tasks',
  'Actions and approvals',
  'Quotations and invoices',
  'Expenses and payments',
  'Reports and dashboards',
  'Multi-company access',
  'Role-based permissions',
];

const plans = [
  { name: 'Starter', price: 'UGX 75k', users: '3 users', tone: 'border-[#BFEADB]' },
  { name: 'Professional', price: 'UGX 150k', users: '10 users', tone: 'border-[#2952C8]' },
  { name: 'Business', price: 'UGX 300k', users: '25 users', tone: 'border-[#D8E2EF]' },
];

const faqs = [
  ['How long is the trial?', 'Every new company gets exactly 7 days on the selected package.'],
  ['What happens after expiry?', 'Data stays intact. Major create and export actions pause until billing becomes active.'],
  ['Can each tenant use its own branding?', 'Company Admins can configure logos, colors, document branding, and display names.'],
];

function PreviewPanel() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-[#D8E2EF] bg-white shadow-2xl shadow-[#091545]/15">
      <div className="flex items-center justify-between border-b border-[#E6EDF5] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#1D9E75]" />
        </div>
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#1D9E75]">Live workspace</span>
      </div>
      <div className="grid min-h-[360px] grid-cols-[88px_1fr] bg-[#F4F7FC] sm:grid-cols-[150px_1fr]">
        <aside className="bg-[#091545] p-3 text-white sm:p-4">
          <Image
            src="/brand/sabtech-workspace-sidebar.svg"
            alt="Sabtech Workspace"
            width={220}
            height={54}
            className="hidden h-auto w-full sm:block"
          />
          <Image
            src="/logo.svg"
            alt="Sabtech Workspace icon"
            width={42}
            height={42}
            className="mx-auto block sm:hidden"
          />
          <div className="mt-8 space-y-2">
            {['Dashboard', 'Clients', 'Projects', 'Invoices', 'Reports'].map((item, index) => (
              <div
                key={item}
                className={`h-9 rounded-md ${index === 0 ? 'bg-white/15' : 'bg-white/5'} px-3 py-2 text-[11px] font-semibold text-white/80`}
              >
                <span className="hidden sm:inline">{item}</span>
              </div>
            ))}
          </div>
        </aside>
        <section className="min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#1D9E75]">Company KPI summary</p>
              <h2 className="mt-1 text-xl font-black text-[#091545]">Dashboard</h2>
            </div>
            <span className="w-fit rounded-full bg-[#E1F5EE] px-3 py-1 text-xs font-bold text-[#0F6E56]">
              Trial active
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Monthly Revenue', 'UGX 18.4M'],
              ['Open Projects', '14'],
              ['Outstanding', 'UGX 3.2M'],
              ['Profit Margin', '38%'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#D8E2EF] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-2 text-2xl font-black text-[#091545]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#D8E2EF] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-[#091545]">Recent workflow</p>
              <span className="text-xs font-semibold text-[#2952C8]">Today</span>
            </div>
            <div className="space-y-3">
              {['Quotation approved', 'Invoice sent', 'Expense captured'].map((item) => (
                <div key={item} className="flex items-center justify-between border-t border-[#EEF3F8] pt-3 text-sm">
                  <span className="font-medium text-slate-600">{item}</span>
                  <CheckCircle2 className="h-4 w-4 text-[#1D9E75]" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-[#F4F7FC] text-[#091545]">
      <section className="bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link href="/welcome" className="inline-flex items-center">
            <Image
              src="/brand/sabtech-workspace-horizontal-light.svg"
              alt="Sabtech Workspace"
              width={260}
              height={58}
              priority
              className="h-auto w-52 sm:w-64"
            />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/pricing" className="hidden rounded-lg px-4 py-2 text-sm font-bold text-[#112068] hover:bg-[#F4F7FC] sm:inline-flex">
              Pricing
            </Link>
            <Link href="/login" className="rounded-lg border border-[#D8E2EF] px-4 py-2 text-sm font-bold text-[#112068] hover:bg-[#F4F7FC]">
              Sign in
            </Link>
            <Link href="/signup" className="rounded-lg bg-[#091545] px-4 py-2 text-sm font-bold text-white hover:bg-[#112068]">
              Start trial
            </Link>
          </nav>
        </div>
      </section>

      <section className="overflow-hidden bg-[#091545] text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-14 pt-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:pb-16">
          <div className="flex flex-col justify-center">
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.24em] text-[#5DCAA5]">Commercial SaaS operations</p>
            <h1 className="text-5xl font-black leading-tight tracking-normal sm:text-6xl">
              Sabtech Workspace
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#E1F5EE]">
              Run clients, projects, tasks, quotations, invoices, expenses, reports, and team permissions in one branded multi-company workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#1D9E75] px-6 text-sm font-black text-white hover:bg-[#168B66]">
                Start 7-day trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/20 px-6 text-sm font-black text-white hover:bg-white/10">
                View pricing
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['7 days', 'trial access'],
                ['Company scoped', 'tenant data'],
                ['Package gated', 'features'],
              ].map(([value, label]) => (
                <div key={label} className="border-l border-white/20 pl-4">
                  <p className="text-2xl font-black">{value}</p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#5DCAA5]">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <PreviewPanel />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#1D9E75]">Main workflows</p>
            <h2 className="mt-2 text-3xl font-black">From first client to final report</h2>
          </div>
          <Link href="/signup" className="inline-flex w-fit items-center gap-2 text-sm font-black text-[#2952C8]">
            Create account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map(({ label, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-[#D8E2EF] bg-white p-5">
              <Icon className="h-6 w-6 text-[#2952C8]" />
              <p className="mt-4 font-black">{label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Structured records, scoped by company, connected to the rest of the operating flow.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#1D9E75]">Features</p>
            <h2 className="mt-2 text-3xl font-black">Built for governed business work</h2>
            <p className="mt-4 max-w-xl leading-7 text-slate-600">
              Company branding, role permissions, billing status, and package entitlements work together so every tenant sees the right experience.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-[#D8E2EF] px-4 py-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1D9E75]" />
                <span className="text-sm font-bold">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#1D9E75]">Pricing preview</p>
          <h2 className="mt-2 text-3xl font-black">Choose a package during onboarding</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.name} className={`rounded-lg border bg-white p-6 ${plan.tone}`}>
              <p className="text-lg font-black">{plan.name}</p>
              <p className="mt-3 text-3xl font-black">{plan.price}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">per month</p>
              <p className="mt-5 text-sm font-bold text-[#2952C8]">{plan.users}</p>
              <Link href="/pricing" className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#091545] text-sm font-black text-white hover:bg-[#112068]">
                View package
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#091545] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#5DCAA5]">How it works</p>
            <h2 className="mt-2 text-3xl font-black">Create, select, trial, activate</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              [Building2, 'Create company', 'Your account becomes Company Admin for the new tenant.'],
              [Layers3, 'Select package', 'Trial features follow the selected package entitlements.'],
              [ShieldCheck, 'Work securely', 'Company ID, role, package, and billing checks protect access.'],
              [CreditCard, 'Activate billing', 'Payments update subscriptions through secure webhooks.'],
            ].map(([Icon, title, copy]) => {
              const TypedIcon = Icon as typeof Building2;
              return (
                <div key={title as string} className="rounded-lg border border-white/15 bg-white/5 p-5">
                  <TypedIcon className="h-6 w-6 text-[#5DCAA5]" />
                  <p className="mt-4 font-black">{title as string}</p>
                  <p className="mt-2 text-sm leading-6 text-[#E1F5EE]">{copy as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="mb-8 flex items-center gap-3">
          <HelpCircle className="h-7 w-7 text-[#2952C8]" />
          <h2 className="text-3xl font-black">FAQ</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {faqs.map(([question, answer]) => (
            <div key={question} className="rounded-lg border border-[#D8E2EF] bg-white p-5">
              <p className="font-black">{question}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#D8E2EF] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Image src="/brand/sabtech-workspace-horizontal-light.svg" alt="Sabtech Workspace" width={220} height={48} className="h-auto w-48" />
          <div className="flex gap-4 text-sm font-bold text-[#112068]">
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
