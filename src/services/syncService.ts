/**
 * syncService — pulls data from Supabase into the local Dexie database.
 * Called once on app mount (full sync) and again when the device comes back online.
 *
 * Strategy: incremental sync using a per-table `last_synced_at` timestamp stored
 * in IndexedDB. On first run (no timestamp) we fetch up to `INITIAL_LIMIT` rows
 * ordered by updated_at so we get the most recent records.
 */
'use client';

import type { Table } from 'dexie';
import { createClient } from '@/lib/supabase/client';
import { localDB } from '@/db/localDB';

const INITIAL_LIMIT = 200; // rows per table on first sync

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncResult {
  table: string;
  upserted: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getLastSyncedAt(table: string): Promise<string | null> {
  const meta = await localDB.syncMeta.get(table);
  return meta?.last_synced_at ?? null;
}

async function setLastSyncedAt(table: string, ts: string) {
  await localDB.syncMeta.put({ table, last_synced_at: ts });
}

// ─── Per-table sync ───────────────────────────────────────────────────────────

// T is unconstrained so every Dexie table (even ones without a string index
// signature) is accepted. We cast to Record<string,unknown> only when we need
// to read the dynamic orderColumn value.
async function syncTable<T>(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dexieTable: Table<T, any>,
  orderColumn = 'updated_at',
): Promise<SyncResult> {
  try {
    const since = await getLastSyncedAt(tableName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from(tableName as any) as any)
      .select('*')
      .order(orderColumn, { ascending: false });

    if (since) {
      query = query.gt(orderColumn, since);
    } else {
      query = query.limit(INITIAL_LIMIT);
    }

    const { data, error } = await query;
    if (error) return { table: tableName, upserted: 0, error: error.message };

    const rows: T[] = data ?? [];
    if (rows.length > 0) {
      await dexieTable.bulkPut(rows);
      // Advance the cursor to the most recent timestamp in this batch.
      // Cast to Record so we can read the dynamic orderColumn key safely.
      const latest = rows.reduce<string>((max, row) => {
        const ts = (row as Record<string, unknown>)[orderColumn] as string | undefined;
        return ts && ts > max ? ts : max;
      }, since ?? '1970-01-01T00:00:00Z');
      await setLastSyncedAt(tableName, latest);
    }

    return { table: tableName, upserted: rows.length };
  } catch (err) {
    return { table: tableName, upserted: 0, error: String(err) };
  }
}

// ─── Main sync entry-point ───────────────────────────────────────────────────

export async function runSync(): Promise<SyncResult[]> {
  const supabase = createClient();

  // Don't sync if not logged in
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const results = await Promise.all([
    syncTable(supabase, 'clients',          localDB.clients,          'updated_at'),
    syncTable(supabase, 'projects',         localDB.projects,         'updated_at'),
    syncTable(supabase, 'invoices',         localDB.invoices,         'updated_at'),
    syncTable(supabase, 'invoice_items',    localDB.invoice_items,    'created_at'),
    syncTable(supabase, 'payments',         localDB.payments,         'created_at'),
    syncTable(supabase, 'quotations',       localDB.quotations,       'updated_at'),
    syncTable(supabase, 'quotation_items',  localDB.quotation_items,  'created_at'),
    syncTable(supabase, 'project_tasks',    localDB.project_tasks,    'created_at'),
  ]);

  const errors = results.filter(r => r.error);
  if (errors.length) {
    console.warn('[SyncService] Some tables had sync errors:', errors);
  }

  return results;
}

// ─── Utility: clear all local data (e.g. on sign-out) ────────────────────────

export async function clearLocalData() {
  await localDB.transaction('rw', [
    localDB.clients, localDB.projects, localDB.invoices, localDB.invoice_items,
    localDB.payments, localDB.quotations, localDB.quotation_items,
    localDB.project_tasks, localDB.syncMeta,
  ], async () => {
    await Promise.all([
      localDB.clients.clear(),
      localDB.projects.clear(),
      localDB.invoices.clear(),
      localDB.invoice_items.clear(),
      localDB.payments.clear(),
      localDB.quotations.clear(),
      localDB.quotation_items.clear(),
      localDB.project_tasks.clear(),
      localDB.syncMeta.clear(),
    ]);
  });
}
