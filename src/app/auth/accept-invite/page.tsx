'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Shield, CheckCircle, AlertCircle, Loader2, LogIn } from 'lucide-react';

function AcceptInviteContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  const [status, setStatus]   = useState<'checking' | 'ready' | 'accepting' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('');
  const [role, setRole]       = useState('');

  useEffect(() => {
    async function check() {
      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Redirect to login, come back here after
        router.push(`/login?redirect=${encodeURIComponent('/auth/accept-invite')}`);
        return;
      }

      // Check if there's a valid invitation for this email
      const email = session.user.email ?? '';
      const { data: inv } = await supabase
        .from('invitations')
        .select('role, status, expires_at')
        .eq('email', email.toLowerCase())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!inv) {
        setStatus('error');
        setMessage('No valid invitation found for your email address, or the invitation has expired.');
        return;
      }

      setRole(inv.role.replace('_', ' '));
      setStatus('ready');
    }
    check();
  }, []);

  async function handleAccept() {
    setStatus('accepting');
    try {
      const res = await fetch('/api/admin/accept-invite', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRole(data.role?.replace('_', ' ') || role);
      setStatus('success');
      setTimeout(() => router.push('/'), 2500);
    } catch (e: unknown) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  const redirectParam = searchParams.get('redirect') || '/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
        {status === 'checking' && (
          <>
            <Loader2 className="h-12 w-12 text-purple-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Checking your invitation…</h2>
            <p className="text-slate-400 text-sm mt-2">Please wait a moment.</p>
          </>
        )}

        {status === 'ready' && (
          <>
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">You&apos;re invited!</h2>
            <p className="text-slate-500 text-sm mb-1">
              You have been invited to join <span className="font-semibold text-slate-800">Sabtech Online</span>
            </p>
            <p className="text-slate-500 text-sm mb-6">
              as a <span className="inline-flex items-center bg-purple-100 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ml-1">{role}</span>
            </p>
            <button
              onClick={handleAccept}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Accept Invitation
            </button>
          </>
        )}

        {status === 'accepting' && (
          <>
            <Loader2 className="h-12 w-12 text-purple-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900">Accepting invitation…</h2>
            <p className="text-slate-400 text-sm mt-2">Setting up your account.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome aboard!</h2>
            <p className="text-slate-500 text-sm mb-1">
              Your account has been set up as a
            </p>
            <span className="inline-flex items-center bg-purple-100 text-purple-700 text-sm font-semibold px-3 py-1.5 rounded-full capitalize mb-6">{role}</span>
            <p className="text-slate-400 text-xs">Redirecting you to the dashboard…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Invitation Problem</h2>
            <p className="text-slate-500 text-sm mb-6">{message}</p>
            <button
              onClick={() => router.push(redirectParam)}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="h-5 w-5" />
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
