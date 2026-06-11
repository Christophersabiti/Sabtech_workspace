import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processDueReminders } from '@/lib/calendar/reminderService';

// POST /api/calendar/reminders/process
// Called by a Vercel cron job every 5 minutes to dispatch due reminders.
// Protected by CRON_SECRET to prevent public abuse.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const result = await processDueReminders(supabase, 5);
  return NextResponse.json({ ok: true, ...result });
}

// Also allow GET for manual trigger by platform admins
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only platform super_admin can trigger manually
  const { data: appUser } = await supabase
    .from('app_users')
    .select('role')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (appUser?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const result = await processDueReminders(supabase, 60);
  return NextResponse.json({ ok: true, ...result });
}
