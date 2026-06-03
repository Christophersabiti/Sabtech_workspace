'use client';

export const dynamic = 'force-dynamic';

import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Lock, Mail, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const packages = [
  { key: 'starter', name: 'Starter', price: 'UGX 75k/mo', limit: '3 users' },
  { key: 'professional', name: 'Professional', price: 'UGX 150k/mo', limit: '10 users' },
  { key: 'business', name: 'Business', price: 'UGX 300k/mo', limit: '25 users' },
  { key: 'enterprise', name: 'Enterprise', price: 'Custom', limit: 'Custom' },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const requestedPlan = searchParams.get('plan') || 'professional';
  const [plan, setPlan] = useState(packages.some((pkg) => pkg.key === requestedPlan) ? requestedPlan : 'professional');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const companySlug = slugify(companyName);
    const redirectTo = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/')}`;
    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          full_name: fullName.trim(),
          signup_company_name: companyName.trim(),
          signup_company_slug: companySlug,
          signup_plan: plan,
        },
      },
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          slug: companySlug,
          plan,
          primaryContactName: fullName,
          primaryContactEmail: email.trim().toLowerCase(),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Account created, but workspace setup failed.');
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();
      return;
    }

    setMessage('Check your inbox to confirm the account. The company workspace and 7-day trial will finish setup after confirmation.');
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-[#091545] text-white">
      <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between px-5 py-8 sm:px-10 lg:px-14">
          <Link href="/welcome" className="inline-flex w-fit items-center">
            <Image src="/brand/sabtech-workspace-horizontal-dark.svg" alt="Sabtech Workspace" width={280} height={62} priority className="h-auto w-64" />
          </Link>

          <div className="max-w-xl py-12">
            <p className="text-sm font-black uppercase tracking-[0.24em] text-[#5DCAA5]">7-day trial</p>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-normal sm:text-5xl">
              Create your company workspace.
            </h1>
            <p className="mt-5 text-lg leading-8 text-[#E1F5EE]">
              Choose a package, create the first Company Admin account, and start with package-scoped access.
            </p>
            <div className="mt-8 space-y-3">
              {['Company Admin role assigned to the creator', 'Trial dates stored on the tenant subscription', 'Package entitlements control feature access'].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#5DCAA5]" />
                  <span className="font-semibold text-[#F4F7FC]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <Link href="/login" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-[#E1F5EE] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Already have an account
          </Link>
        </section>

        <section className="flex items-center justify-center bg-[#F4F7FC] px-5 py-10 text-[#091545] sm:px-8">
          <form onSubmit={submit} className="w-full max-w-3xl rounded-lg border border-[#D8E2EF] bg-white p-6 shadow-2xl shadow-[#091545]/15 sm:p-8">
            <div className="mb-7">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#1D9E75]">Create account</p>
              <h2 className="mt-2 text-3xl font-black">Start the trial</h2>
            </div>

            {message ? (
              <div className="mb-6 flex items-start gap-2 rounded-lg border border-[#BFEADB] bg-[#E1F5EE] px-4 py-3 text-sm font-semibold text-[#0F6E56]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}
            {error ? (
              <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Full name *</span>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-lg border border-[#D8E2EF] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Company name *</span>
                <input
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full rounded-lg border border-[#D8E2EF] px-4 py-3 text-sm outline-none focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Email *</span>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-lg border border-[#D8E2EF] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">Password *</span>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-lg border border-[#D8E2EF] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#2952C8] focus:ring-4 focus:ring-[#2952C8]/10"
                  />
                </div>
              </label>
            </div>

            <div className="mt-7">
              <p className="mb-3 text-sm font-bold">Select package *</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {packages.map((pkg) => {
                  const selected = plan === pkg.key;
                  return (
                    <button
                      key={pkg.key}
                      type="button"
                      onClick={() => setPlan(pkg.key)}
                      className={`rounded-lg border p-4 text-left transition ${
                        selected ? 'border-[#2952C8] bg-[#E8EEFF] ring-2 ring-[#2952C8]/20' : 'border-[#D8E2EF] bg-white hover:border-[#1D9E75]'
                      }`}
                    >
                      <p className="font-black">{pkg.name}</p>
                      <p className="mt-2 text-sm font-bold text-[#2952C8]">{pkg.price}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{pkg.limit}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#091545] px-6 text-sm font-black text-white hover:bg-[#112068] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
              {loading ? 'Creating account...' : 'Create account and start trial'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#091545]">
        <Loader2 className="h-8 w-8 animate-spin text-[#5DCAA5]" />
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
