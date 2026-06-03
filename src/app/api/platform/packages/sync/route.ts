import { NextResponse } from 'next/server';
import { requirePlatformSuperAdmin } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function POST() {
  const access = await requirePlatformSuperAdmin();

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await access.adminSupabase.rpc('sync_subscription_package_metadata');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    result: data,
  });
}
