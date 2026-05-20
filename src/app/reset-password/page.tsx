'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setMessage('Password updated. You can now sign in with your new password.');
      setPassword('');
      setConfirmPassword('');
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center">
            <Image src="/logo.svg" alt="Sabtech Online" width={64} height={64} />
          </div>
          <h1 className="text-2xl font-black text-white">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-400">Choose a secure password for your account.</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-8 shadow-2xl">
          {message && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {[
              { label: 'New password', value: password, setValue: setPassword },
              { label: 'Confirm password', value: confirmPassword, setValue: setConfirmPassword },
            ].map((field) => (
              <label key={field.label} className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.label}</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={field.value}
                    onChange={(event) => field.setValue(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? 'Updating...' : 'Update password'}
          </button>

          {message && (
            <Link href="/login" className="mt-5 block text-center text-sm font-medium text-purple-600 hover:text-purple-700">
              Continue to sign in
            </Link>
          )}
        </form>
      </div>
    </div>
  );
}
