#!/usr/bin/env node
/*
  Create a test user and workspace using the Supabase service role key.
  Usage: node scripts/create_test_workspace.js test@example.com "Company Name"
*/
// Load .env.local if present
try { require('dotenv').config({ path: '.env.local' }); } catch {}
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
  process.exit(1);
}

const args = process.argv.slice(2);
const email = args[0] || `test+local+${Date.now()}@example.com`;
const companyName = args[1] || `Local Test Co ${Date.now()}`;
const password = args[2] || 'Test1234!';

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('Creating auth user:', email);
  // Create user via admin API
  const { data: user, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    console.error('Error creating auth user:', createErr.message || createErr);
    process.exit(1);
  }

  const authUserId = user.id;
  console.log('Auth user created:', authUserId);

  // Create app_user row
  const { data: appUser, error: appUserErr } = await admin
    .from('app_users')
    .insert({ auth_user_id: authUserId, email, full_name: null, role: 'admin', status: 'active', last_login_at: new Date().toISOString() })
    .select()
    .single();

  if (appUserErr) {
    console.error('Error creating app_users row:', appUserErr.message || appUserErr);
    process.exit(1);
  }

  console.log('app_users row created:', appUser.id);

  // Create company
  const { data: company, error: compErr } = await admin
    .from('companies')
    .insert({ name: companyName, slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g,'-'), owner_user_id: appUser.id, status: 'active' })
    .select()
    .single();

  if (compErr) {
    console.error('Error creating company:', compErr.message || compErr);
    process.exit(1);
  }

  console.log('Company created:', company.id);

  // Upsert membership
  const { error: membershipErr } = await admin
    .from('company_users')
    .upsert({ company_id: company.id, app_user_id: appUser.id, auth_user_id: authUserId, role_id: 'admin', status: 'active', joined_at: new Date().toISOString() }, { onConflict: 'company_id,auth_user_id' });

  if (membershipErr) {
    console.error('Error upserting company_users:', membershipErr.message || membershipErr);
    process.exit(1);
  }

  // Upsert company settings
  const { error: settingsErr } = await admin
    .from('company_settings')
    .upsert({ company_id: company.id, company_name: company.name, country: 'Uganda', currency: 'UGX', updated_at: new Date().toISOString() }, { onConflict: 'company_id' });

  if (settingsErr) {
    console.error('Error upserting company_settings:', settingsErr.message || settingsErr);
    process.exit(1);
  }

  console.log('Workspace creation complete. Credentials:');
  console.log('  email:', email);
  console.log('  password:', password);
  console.log('  company:', company.name, company.id);
  console.log('You can now sign in using the web UI at http://localhost:3000 and create a session.');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
