'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

type CommentAuthor = {
  full_name?: string | null;
  email?: string | null;
};

type TaskComment = {
  id: string;
  content: string;
  is_internal: boolean;
  client_visible: boolean;
  created_at: string;
  user_id: string | null;
  app_users: CommentAuthor | null;
};

type Props = {
  taskId: string;
  companyId: string;
};

function initials(author: CommentAuthor | null): string {
  const name = author?.full_name ?? author?.email ?? '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function displayName(author: CommentAuthor | null): string {
  return author?.full_name ?? author?.email ?? 'Unknown';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: diffHrs > 24 * 300 ? 'numeric' : undefined });
}

export function TaskCommentsSection({ taskId, companyId }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    if (!taskId || !companyId) return [];
    const res = await fetch(`/api/task-comments?taskId=${taskId}&companyId=${companyId}`);
    const data = await res.json().catch(() => ({ comments: [] }));
    return data.comments ?? [];
  }, [taskId, companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    const nextComments = await fetchComments();
    setComments(nextComments);
    setLoading(false);
  }, [fetchComments]);

  useEffect(() => {
    let cancelled = false;
    void fetchComments()
      .then((nextComments) => {
        if (cancelled) return;
        setComments(nextComments);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchComments]);

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [comments, collapsed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const res = await fetch('/api/task-comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, companyId, content: text.trim() }),
    });
    if (res.ok) {
      setText('');
      await load();
    }
    setSubmitting(false);
  }

  async function handleDelete(commentId: string) {
    setDeletingId(commentId);
    await fetch(`/api/task-comments/${commentId}`, { method: 'DELETE' });
    await load();
    setDeletingId(null);
  }

  return (
    <div className="border-t border-gray-100 mt-2">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="flex w-full items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" />
          Comments {comments.length > 0 && <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold">{comments.length}</span>}
        </span>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading comments...
            </div>
          )}

          {!loading && comments.length === 0 && (
            <p className="text-xs text-gray-400 py-2 text-center">No comments yet. Be the first to add one.</p>
          )}

          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5 group">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                {initials(comment.app_users)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-800">{displayName(comment.app_users)}</span>
                  <span className="text-[10px] text-gray-400">{formatTime(comment.created_at)}</span>
                </div>
                <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{comment.content}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(comment.id)}
                disabled={deletingId === comment.id}
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
              >
                {deletingId === comment.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Trash2 className="w-3 h-3" />}
              </button>
            </div>
          ))}

          <div ref={bottomRef} />

          <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  void handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="self-end px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {submitting ? '' : 'Send'}
            </button>
          </form>
          <p className="text-[10px] text-gray-400">Ctrl+Enter to send</p>
        </div>
      )}
    </div>
  );
}
