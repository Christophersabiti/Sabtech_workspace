-- Migration 005: Storage RLS policies for company-assets bucket
-- Allows authenticated users to upload/update the company logo,
-- and grants public read access for rendering it in invoices and the sidebar.

-- Ensure the bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  2097152,  -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any existing policies on this bucket before recreating
DROP POLICY IF EXISTS "company_assets_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "company_assets_auth_insert"   ON storage.objects;
DROP POLICY IF EXISTS "company_assets_auth_update"   ON storage.objects;
DROP POLICY IF EXISTS "company_assets_auth_delete"   ON storage.objects;

-- Public read — anyone can view the logo (needed for invoices, sidebar, emails)
CREATE POLICY "company_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

-- Authenticated insert — any signed-in user can upload a logo
CREATE POLICY "company_assets_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'company-assets');

-- Authenticated update — allows upsert (upload with upsert:true calls UPDATE internally)
CREATE POLICY "company_assets_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-assets');

-- Authenticated delete — allows logo removal
CREATE POLICY "company_assets_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'company-assets');
