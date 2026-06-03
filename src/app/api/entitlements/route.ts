import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/platformAdmin';
import {
  EntitlementError,
  FeatureKey,
  assertFeatureEntitlement,
  getCompanyEntitlementSnapshot,
} from '@/lib/entitlements';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('companyId');
  const featureKey = searchParams.get('feature') as FeatureKey | null;

  if (!companyId) {
    return NextResponse.json({ error: 'Company ID is required.' }, { status: 400 });
  }

  const adminSupabase = createAdminSupabase();

  try {
    let snapshot;

    if (featureKey) {
      snapshot = await assertFeatureEntitlement(adminSupabase, session.user.id, companyId, featureKey);
    } else {
      const { data: appUser } = await adminSupabase
        .from('app_users')
        .select('role, status')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!(appUser?.role === 'super_admin' && appUser.status === 'active')) {
        const { data: membership } = await adminSupabase
          .from('company_users')
          .select('id')
          .eq('auth_user_id', session.user.id)
          .eq('company_id', companyId)
          .eq('status', 'active')
          .maybeSingle();

        if (!membership) {
          return NextResponse.json({ error: 'You are not an active member of this company.' }, { status: 403 });
        }
      }

      snapshot = await getCompanyEntitlementSnapshot(adminSupabase, companyId);
    }

    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return NextResponse.json(
        {
          error: error.message,
          featureKey: error.featureKey,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load entitlements.' },
      { status: 500 },
    );
  }
}
