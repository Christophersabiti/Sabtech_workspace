/**
 * Dexie (IndexedDB) local database — mirrors the Supabase schema for offline use.
 * Tables here are append-or-replace caches; writes happen through Supabase first
 * and then sync back into this store via syncService.
 */
import Dexie, { type Table } from 'dexie';
import type {
  Client,
  Project,
  Invoice,
  InvoiceItem,
  Payment,
  Quotation,
  QuotationItem,
  ProjectTask,
} from '@/types';

// ─── Extra columns added by migration 007 that aren't on the shared type yet ──
export interface LocalProjectTask extends ProjectTask {
  start_date?: string | null;
  end_date?: string | null;
  assigned_to?: string | null;
  updated_at?: string;
}

// ─── Database class ──────────────────────────────────────────────────────────

export class SabtechLocalDB extends Dexie {
  clients!:       Table<Client,       string>;
  projects!:      Table<Project,      string>;
  invoices!:      Table<Invoice,      string>;
  invoice_items!: Table<InvoiceItem,  string>;
  payments!:      Table<Payment,      string>;
  quotations!:    Table<Quotation,    string>;
  quotation_items!: Table<QuotationItem, string>;
  project_tasks!: Table<LocalProjectTask, string>;

  /** last-synced timestamps per table — stored in a tiny meta table */
  syncMeta!: Table<{ table: string; last_synced_at: string }, string>;

  constructor() {
    super('sabtech_local');

    this.version(1).stores({
      // Primary key first, then indexed columns
      clients:        'id, status, updated_at',
      projects:       'id, client_id, status, updated_at',
      invoices:       'id, client_id, project_id, status, updated_at',
      invoice_items:  'id, invoice_id',
      payments:       'id, invoice_id, status',
      quotations:     'id, client_id, status, updated_at',
      quotation_items:'id, quotation_id',
      project_tasks:  'id, project_id, status',
      syncMeta:       'table',
    });
  }
}

export const localDB = new SabtechLocalDB();
