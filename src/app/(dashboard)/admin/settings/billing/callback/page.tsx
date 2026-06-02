'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function BillingCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackingId = searchParams.get('OrderTrackingId');
  const merchantReference = searchParams.get('OrderMerchantReference');

  const [status, setStatus] = useState<'verifying' | 'completed' | 'failed' | 'timeout'>('verifying');
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!merchantReference) {
      setStatus('failed');
      return;
    }

    const supabase = createClient();
    let intervalId: any;

    async function checkStatus() {
      const { data, error } = await supabase
        .from('billing_transactions')
        .select('status')
        .eq('merchant_reference', merchantReference)
        .maybeSingle();

      if (error) {
        console.error('Error fetching transaction status:', error);
      }

      if (data?.status === 'completed') {
        setStatus('completed');
        clearInterval(intervalId);
        // Force refresh company data in active state
        router.refresh();
      } else if (data?.status === 'failed') {
        setStatus('failed');
        clearInterval(intervalId);
      } else {
        setAttempts((a) => {
          if (a >= 8) {
            setStatus('timeout');
            clearInterval(intervalId);
          }
          return a + 1;
        });
      }
    }

    // Run first check immediately
    void checkStatus();

    // Check status every 1.5 seconds
    intervalId = setInterval(checkStatus, 1500);

    return () => clearInterval(intervalId);
  }, [merchantReference, router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-lg text-center space-y-6">
        {status === 'verifying' && (
          <>
            <div className="mx-auto w-12 h-12 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Verifying Payment...</h1>
              <p className="text-xs text-slate-500 mt-1">Please wait while we confirm your payment status from Pesapal.</p>
            </div>
          </>
        )}

        {status === 'completed' && (
          <>
            <div className="mx-auto w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Payment Successful!</h1>
              <p className="text-xs text-slate-500 mt-1">Thank you! Your company subscription has been successfully activated.</p>
            </div>
            <div className="pt-2">
              <Link
                href="/admin/settings/billing"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 py-2.5 text-xs font-semibold text-white transition-colors"
              >
                Go to Billing Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="mx-auto w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Payment Failed</h1>
              <p className="text-xs text-slate-500 mt-1">Pesapal reported this transaction failed or it was cancelled.</p>
            </div>
            <div className="pt-2">
              <Link
                href="/admin/settings/billing"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-semibold text-white transition-colors"
              >
                Return to Billing
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div className="mx-auto w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Confirmation Pending</h1>
              <p className="text-xs text-slate-500 mt-1">We haven't received confirmation yet. We will update your subscription as soon as the gateway notifies us.</p>
            </div>
            <div className="pt-2">
              <Link
                href="/admin/settings/billing"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 py-2.5 text-xs font-semibold text-white transition-colors"
              >
                Go to Billing Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function BillingCallbackPage() {
  return (
    <Suspense fallback={
      <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading checkout status...
      </div>
    }>
      <BillingCallbackContent />
    </Suspense>
  );
}
