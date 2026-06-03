import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function createUniqueSignupCompany(
  adminSupabase: SupabaseClient,
  name: string,
  ownerUserId: string,
  customSlug?: string,
  plan?: string,
  primaryContactEmail?: string,
) {
  const baseSlug = slugify(customSlug || name) || `workspace-${Date.now()}`;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await adminSupabase
      .from('companies')
      .insert({
        name,
        slug,
        owner_user_id: ownerUserId,
        status: 'active',
        plan: plan || 'starter',
        primary_contact_email: primaryContactEmail || null,
      })
      .select('id, name, slug, status')
      .single();

    if (!error && data) return data;
    if (error?.code !== '23505') throw error;
  }

  throw new Error('Could not create a unique workspace slug.');
}

async function startSignupTrial(adminSupabase: SupabaseClient, companyId: string, requestedPlanKey?: string) {
  const normalizedPlanKey = requestedPlanKey === 'growth'
    ? 'professional'
    : requestedPlanKey === 'pro'
      ? 'business'
      : requestedPlanKey || 'starter';
  let { data: plan } = await adminSupabase
    .from('subscription_plans')
    .select('id, key, trial_days')
    .eq('key', normalizedPlanKey)
    .eq('is_active', true)
    .maybeSingle();

  if (!plan) {
    const fallback = await adminSupabase
      .from('subscription_plans')
      .select('id, key, trial_days')
      .eq('key', 'starter')
      .maybeSingle();
    plan = fallback.data;
  }

  if (!plan) return null;

  const startsAt = new Date();
  const trialDays = Number(plan.trial_days ?? 7);
  const endsAt = new Date(startsAt);
  endsAt.setDate(startsAt.getDate() + trialDays);

  await adminSupabase
    .from('company_subscriptions')
    .upsert({
      company_id: companyId,
      plan_id: plan.id,
      status: 'trialing',
      billing_status: trialDays > 0 ? 'trial_active' : 'trial_expired',
      subscription_status: 'trialing',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      trial_start_date: startsAt.toISOString(),
      trial_end_date: endsAt.toISOString(),
      current_period_start: startsAt.toISOString(),
      current_period_end: endsAt.toISOString(),
      payment_provider: 'pesapal',
      updated_at: startsAt.toISOString(),
    }, { onConflict: 'company_id' });

  await adminSupabase
    .from('companies')
    .update({ plan: plan.key, updated_at: new Date().toISOString() })
    .eq('id', companyId);

  return {
    planKey: plan.key as string,
    trialEndsAt: endsAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code     = searchParams.get('code');
  const redirect = searchParams.get('redirect') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()       { return cookieStore.getAll(); },
          setAll(list)   { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      }
    );

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && session) {
      const adminSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const sessionEmail = (session.user.email ?? '').toLowerCase();

      // Ensure this user has an app_users record. Prefer auth_user_id, then
      // link an email-only placeholder such as the seeded Platform Super Admin.
      const { data: existingByAuth } = await adminSupabase
        .from('app_users')
        .select('id, full_name, status')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      const { data: existingByEmail } = !existingByAuth && sessionEmail
        ? await adminSupabase
            .from('app_users')
            .select('id, full_name, status')
            .ilike('email', sessionEmail)
            .is('auth_user_id', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
        : { data: null };

      const existing = existingByAuth ?? existingByEmail;

      // Check if there's a pending invitation for this email
      const { data: invitation } = await adminSupabase
        .from('invitations')
        .select('*')
        .eq('email', session.user.email ?? '')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const role = invitation?.role ?? 'staff';
      let appUserId = existing?.id as string | undefined;

      if (!existing) {
        const { data: createdUser } = await adminSupabase.from('app_users').insert({
          auth_user_id: session.user.id,
          email: session.user.email ?? '',
          full_name: invitation?.full_name ?? session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null,
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
          role: 'staff',
          status: 'active',
          invited_at: invitation ? invitation.created_at : null,
          last_login_at: new Date().toISOString(),
        }).select('id').single();

        appUserId = createdUser?.id;
      } else {
        // Update last login and link email placeholders to the auth user.
        await adminSupabase
          .from('app_users')
          .update({
            auth_user_id: session.user.id,
            email: session.user.email ?? '',
            full_name: existing.full_name ?? session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null,
            status: existing.status === 'invited' ? 'active' : existing.status ?? 'active',
            last_login_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }

      if (invitation && appUserId) {
        await adminSupabase
          .from('company_users')
          .upsert({
            company_id: invitation.company_id,
            app_user_id: appUserId,
            auth_user_id: session.user.id,
            role_id: role,
            status: 'active',
            invited_by: invitation.invited_by,
            joined_at: new Date().toISOString(),
          }, { onConflict: 'company_id,auth_user_id' });

        await adminSupabase
          .from('invitations')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', invitation.id);
      }

      const metadata = session.user.user_metadata ?? {};
      const signupCompanyName = typeof metadata.signup_company_name === 'string'
        ? metadata.signup_company_name.trim()
        : '';

      if (!invitation && appUserId && signupCompanyName) {
        const { data: existingMembership } = await adminSupabase
          .from('company_users')
          .select('id')
          .eq('auth_user_id', session.user.id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();

        if (!existingMembership) {
          const planKey = typeof metadata.signup_plan === 'string' ? metadata.signup_plan : 'starter';
          const company = await createUniqueSignupCompany(
            adminSupabase,
            signupCompanyName,
            appUserId,
            typeof metadata.signup_company_slug === 'string' ? metadata.signup_company_slug : undefined,
            planKey,
            session.user.email ?? undefined,
          );

          await adminSupabase
            .from('company_users')
            .upsert({
              company_id: company.id,
              app_user_id: appUserId,
              auth_user_id: session.user.id,
              role_id: 'admin',
              status: 'active',
              joined_at: new Date().toISOString(),
            }, { onConflict: 'company_id,auth_user_id' });

          await adminSupabase
            .from('company_settings')
            .upsert({
              company_id: company.id,
              company_name: company.name,
              email: session.user.email ?? null,
              currency: 'UGX',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'company_id' });

          const trial = await startSignupTrial(adminSupabase, company.id, planKey);

          await adminSupabase
            .from('audit_log')
            .insert({
              company_id: company.id,
              entity_type: 'company',
              entity_id: company.id,
              action: 'signup_workspace_created',
              performed_by: appUserId,
              new_values: {
                name: company.name,
                slug: company.slug,
                plan: trial?.planKey ?? planKey,
                trial_end_date: trial?.trialEndsAt ?? null,
              },
            });
        }
      }

      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
