import { NextResponse } from 'next/server';
import { requirePlatformSuperAdmin } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const platform = await requirePlatformSuperAdmin();
  if (!platform.ok) {
    return NextResponse.json({ error: platform.error }, { status: platform.status });
  }

  const { adminSupabase } = platform;
  const [{ data: companies, error }, { data: memberships }] = await Promise.all([
    adminSupabase
      .from('companies')
      .select('id, name, slug, status, created_at')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('company_users')
      .select('company_id, status')
      .eq('status', 'active'),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const memberCounts = new Map<string, number>();
  (memberships ?? []).forEach((membership) => {
    memberCounts.set(
      membership.company_id,
      (memberCounts.get(membership.company_id) ?? 0) + 1,
    );
  });

  return NextResponse.json({
    companies: (companies ?? []).map((company) => ({
      ...company,
      member_count: memberCounts.get(company.id) ?? 0,
    })),
  });
}
