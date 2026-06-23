'use client';

import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Paperclip, Upload, Link2, ExternalLink, Download, Trash2,
  Loader2, ChevronDown, ChevronUp, File, FileText, Image as ImageIcon,
  Film, Music, Archive, X, Plus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

type Attachment = {
  id: string;
  type: 'file' | 'link';
  display_name: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string | null;
  signed_url: string | null;
  url: string | null;
  link_title: string | null;
  link_domain: string | null;
  link_favicon_url: string | null;
  created_at: string;
};

type UploadingFile = {
  tempId: string;
  name: string;
  size: number;
  progress: number; // 0-100
  error: string | null;
};

export type AttachmentsSectionProps = {
  entityId: string;       // taskId or raidId
  companyId: string;
  storageFolder: string;  // e.g. "{companyId}/tasks/{taskId}"
  apiBase: string;        // '/api/task-attachments' or '/api/raid-attachments'
  entityParam: string;    // 'taskId' or 'raidId' — used in POST body and GET query
};

// ─── Constants ───────────────────────────────────────────────────────────────

const BUCKET = 'task-attachments';

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'jar', 'msi', 'dmg', 'app',
  'com', 'pif', 'scr', 'hta', 'cpl', 'reg',
]);

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mimeIcon(mimeType: string | null, className = 'w-5 h-5') {
  if (!mimeType) return <File className={className} />;
  if (mimeType.startsWith('image/'))  return <ImageIcon className={className} />;
  if (mimeType.startsWith('video/'))  return <Film className={className} />;
  if (mimeType.startsWith('audio/'))  return <Music className={className} />;
  if (mimeType === 'application/pdf' || mimeType.includes('word') || mimeType.startsWith('text/'))
    return <FileText className={className} />;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive'))
    return <Archive className={className} />;
  return <File className={className} />;
}

function humanSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  const d     = new Date(iso);
  const now   = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function validateFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.has(ext)) return `File type .${ext} is not allowed.`;
  if (file.size > MAX_FILE_BYTES)   return `File exceeds 100 MB limit.`;
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AttachmentsSection({
  entityId, companyId, storageFolder, apiBase, entityParam,
}: AttachmentsSectionProps) {
  const supabase = createClient();

  const [attachments, setAttachments]   = useState<Attachment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [collapsed, setCollapsed]       = useState(false);
  const [uploading, setUploading]       = useState<UploadingFile[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl]           = useState('');
  const [linkLabel, setLinkLabel]       = useState('');
  const [addingLink, setAddingLink]     = useState(false);
  const [linkError, setLinkError]       = useState('');
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [isDragOver, setIsDragOver]     = useState(false);
  const fileInputRef                    = useRef<HTMLInputElement>(null);
  const dropZoneRef                     = useRef<HTMLDivElement>(null);

  const fetchAttachments = useCallback(async () => {
    const res  = await fetch(`${apiBase}?${entityParam}=${entityId}&companyId=${companyId}`);
    const data = await res.json().catch(() => ({ attachments: [] }));
    return (data.attachments ?? []) as Attachment[];
  }, [apiBase, entityId, companyId, entityParam]);

  useEffect(() => {
    let cancelled = false;
    void fetchAttachments()
      .then((list) => { if (!cancelled) { setAttachments(list); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchAttachments]);

  // ─── File upload ────────────────────────────────────────────────────────────

  async function uploadFiles(files: FileList | File[]) {
    const fileArr = Array.from(files);

    const newEntries: UploadingFile[] = fileArr.map(f => ({
      tempId: crypto.randomUUID(),
      name:   f.name,
      size:   f.size,
      progress: 0,
      error:  null,
    }));
    setUploading(prev => [...prev, ...newEntries]);

    await Promise.all(fileArr.map(async (file, idx) => {
      const entry = newEntries[idx];

      const validationError = validateFile(file);
      if (validationError) {
        setUploading(prev => prev.map(u =>
          u.tempId === entry.tempId ? { ...u, error: validationError } : u,
        ));
        return;
      }

      const uuid     = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path     = `${storageFolder}/${uuid}_${safeName}`;

      setUploading(prev => prev.map(u =>
        u.tempId === entry.tempId ? { ...u, progress: 20 } : u,
      ));

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || `application/octet-stream`, upsert: false });

      if (uploadError) {
        setUploading(prev => prev.map(u =>
          u.tempId === entry.tempId ? { ...u, error: uploadError.message } : u,
        ));
        return;
      }

      setUploading(prev => prev.map(u =>
        u.tempId === entry.tempId ? { ...u, progress: 70 } : u,
      ));

      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [entityParam]: entityId,
          companyId,
          type:        'file',
          fileName:    file.name,
          fileSize:    file.size,
          mimeType:    file.type || null,
          storagePath: path,
          displayName: file.name,
        }),
      });

      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error ?? 'Upload failed.';
        // Remove the uploaded file from storage since DB insert failed
        await supabase.storage.from(BUCKET).remove([path]);
        setUploading(prev => prev.map(u =>
          u.tempId === entry.tempId ? { ...u, error: msg } : u,
        ));
        return;
      }

      setUploading(prev => prev.map(u =>
        u.tempId === entry.tempId ? { ...u, progress: 100 } : u,
      ));

      // Remove from uploading list after brief display
      setTimeout(() => {
        setUploading(prev => prev.filter(u => u.tempId !== entry.tempId));
      }, 800);

      // Reload the list to pick up the new attachment with its signed URL
      void fetchAttachments().then(list => setAttachments(list));
    }));
  }

  // ─── Link attachment ────────────────────────────────────────────────────────

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmedUrl = linkUrl.trim();
    if (!trimmedUrl) return;

    setLinkError('');
    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        setLinkError('Please enter a valid http or https URL.');
        return;
      }
    } catch {
      setLinkError('Please enter a valid URL (include https://).');
      return;
    }

    setAddingLink(true);
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        [entityParam]: entityId,
        companyId,
        type:        'link',
        url:         trimmedUrl,
        displayName: linkLabel.trim() || undefined,
      }),
    });

    setAddingLink(false);

    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error ?? 'Failed to add link.';
      setLinkError(msg);
      return;
    }

    setLinkUrl('');
    setLinkLabel('');
    setShowLinkInput(false);
    void fetchAttachments().then(list => setAttachments(list));
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    setDeletingId(null);
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  // ─── Drag-and-drop ──────────────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      void uploadFiles(e.dataTransfer.files);
    }
  }

  // ─── Clipboard paste ─────────────────────────────────────────────────────────

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        void uploadFiles(files);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [entityId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const fileAttachments = attachments.filter(a => a.type === 'file');
  const linkAttachments = attachments.filter(a => a.type === 'link');
  const totalCount      = attachments.length + uploading.length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="border-t border-gray-100 mt-2">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5" />
          Attachments
          {totalCount > 0 && (
            <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold">
              {totalCount}
            </span>
          )}
        </span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">

          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative rounded-xl border-2 border-dashed transition-colors p-3 ${
              isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
            }`}
          >
            {isDragOver ? (
              <p className="text-center text-xs text-blue-600 font-medium py-1">Drop files to attach</p>
            ) : (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => { setShowLinkInput(l => !l); setLinkError(''); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Link URL
                </button>
                <span className="text-[10px] text-gray-400">or drag & drop · paste image</span>
              </div>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={e => { if (e.target.files?.length) { void uploadFiles(e.target.files); e.target.value = ''; } }}
          />

          {/* Link input form */}
          {showLinkInput && (
            <form onSubmit={handleAddLink} className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Link2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-gray-700">Add Link</span>
                <button
                  type="button"
                  onClick={() => { setShowLinkInput(false); setLinkUrl(''); setLinkLabel(''); setLinkError(''); }}
                  className="ml-auto p-0.5 rounded text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/…"
                required
                autoFocus
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors bg-white"
              />
              <input
                type="text"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                placeholder="Label (optional — auto-fetched if blank)"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors bg-white"
              />
              {linkError && <p className="text-xs text-red-500">{linkError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!linkUrl.trim() || addingLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
                >
                  {addingLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {addingLink ? 'Adding…' : 'Add Link'}
                </button>
              </div>
              <p className="text-[10px] text-gray-400">
                Supports Google Docs, Sheets, Slides, Figma, Notion, Confluence, and any URL
              </p>
            </form>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading attachments…
            </div>
          )}

          {/* In-progress uploads */}
          {uploading.length > 0 && (
            <div className="space-y-1.5">
              {uploading.map(u => (
                <div key={u.tempId} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                  <Loader2 className={`w-4 h-4 shrink-0 ${u.error ? 'text-red-400' : 'text-blue-400 animate-spin'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{u.name}</p>
                    {u.error ? (
                      <p className="text-[10px] text-red-500">{u.error}</p>
                    ) : (
                      <div className="mt-0.5 h-1 bg-blue-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${u.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {u.error && (
                    <button
                      type="button"
                      onClick={() => setUploading(prev => prev.filter(x => x.tempId !== u.tempId))}
                      className="shrink-0 p-1 rounded text-gray-300 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && attachments.length === 0 && uploading.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-1">
              No attachments yet. Upload a file or add a link.
            </p>
          )}

          {/* ── Files ────────────────────────────────────────────── */}
          {fileAttachments.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Files ({fileAttachments.length})
              </p>
              <div className="space-y-1">
                {fileAttachments.map(att => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <span className="shrink-0 text-gray-400">
                      {mimeIcon(att.mime_type, 'w-4 h-4')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {att.display_name || att.file_name || 'Untitled file'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {humanSize(att.file_size)} · {formatTime(att.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {att.signed_url && (
                        <a
                          href={att.signed_url}
                          download={att.file_name ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(att.id)}
                        disabled={deletingId === att.id}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === att.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Links ────────────────────────────────────────────── */}
          {linkAttachments.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Links ({linkAttachments.length})
              </p>
              <div className="space-y-1">
                {linkAttachments.map(att => (
                  <div
                    key={att.id}
                    className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {att.link_favicon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={att.link_favicon_url}
                        alt=""
                        className="w-4 h-4 shrink-0 rounded-sm object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <Link2 className="w-4 h-4 shrink-0 text-gray-400" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">
                        {att.display_name || att.link_title || att.link_domain || att.url || 'Link'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {att.link_domain && <span className="mr-1">{att.link_domain}</span>}
                        · {formatTime(att.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {att.url && (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Open link"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(att.id)}
                        disabled={deletingId === att.id}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        {deletingId === att.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            Files up to 100 MB · PDF, Word, Excel, images, video, zip and more · Paste image from clipboard
          </p>
        </div>
      )}
    </div>
  );
}
