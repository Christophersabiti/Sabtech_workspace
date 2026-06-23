-- Migration 026: Task & RAID Attachments (files + links)
-- - Enhances task_attachments to support both file uploads and URL link attachments
-- - Creates private task-attachments storage bucket (100 MB limit, all standard formats)
-- - Adds raid_attachments table for RAID log evidence documents and links

-- ─── A. Enhance task_attachments ────────────────────────────────────────────

ALTER TABLE task_attachments
  ALTER COLUMN file_name DROP NOT NULL,
  ALTER COLUMN file_url  DROP NOT NULL;

ALTER TABLE task_attachments
  ADD COLUMN IF NOT EXISTS type             text    NOT NULL DEFAULT 'file'
                                             CHECK (type IN ('file', 'link')),
  ADD COLUMN IF NOT EXISTS display_name     text,
  ADD COLUMN IF NOT EXISTS storage_path     text,
  ADD COLUMN IF NOT EXISTS url              text,
  ADD COLUMN IF NOT EXISTS link_title       text,
  ADD COLUMN IF NOT EXISTS link_domain      text,
  ADD COLUMN IF NOT EXISTS link_favicon_url text;


-- ─── B. Create task-attachments storage bucket ──────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  false,
  104857600,  -- 100 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed', 'application/vnd.rar',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/wav', 'audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ─── C. Storage RLS for task-attachments bucket ─────────────────────────────
-- File path convention: {company_id}/tasks/{task_id}/{uuid}_{filename}
--                    or {company_id}/raid/{raid_id}/{uuid}_{filename}
-- The first path component is always the company_id, checked against membership.

DROP POLICY IF EXISTS "task_att_storage_read"   ON storage.objects;
DROP POLICY IF EXISTS "task_att_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "task_att_storage_delete" ON storage.objects;

CREATE POLICY "task_att_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "task_att_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "task_att_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT company_id::text FROM company_users
      WHERE auth_user_id = auth.uid() AND status = 'active'
    )
  );


-- ─── D. Create raid_attachments table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS raid_attachments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid        NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  raid_id          uuid        NOT NULL REFERENCES raid_log(id)   ON DELETE CASCADE,
  uploaded_by      uuid,
  type             text        NOT NULL DEFAULT 'file'
                               CHECK (type IN ('file', 'link')),
  display_name     text,
  file_name        text,
  file_url         text,
  storage_path     text,
  file_size        integer,
  mime_type        text,
  url              text,
  link_title       text,
  link_domain      text,
  link_favicon_url text,
  is_internal      boolean     NOT NULL DEFAULT true,
  client_visible   boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raid_attachments_raid    ON raid_attachments(raid_id);
CREATE INDEX IF NOT EXISTS idx_raid_attachments_company ON raid_attachments(company_id);

ALTER TABLE raid_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_raid_attachments_all"
  ON raid_attachments FOR ALL
  USING    (is_company_member(company_id))
  WITH CHECK (is_company_member(company_id));
