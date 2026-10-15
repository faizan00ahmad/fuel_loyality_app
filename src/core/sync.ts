import { LedgerError, earn, findCustomer, litresToPoints } from './logic';
import type { DB, QueuedEarn, SyncResult } from '../types';

/**
 * SRS 3.5 offline queueing: transactions captured while the POS is offline are held locally
 * and replayed against the central ledger, in capture order, when the network returns.
 * Each is re-validated server-side (QR validity, 30-minute velocity check), so a queued
 * transaction can be rejected on sync, and the attendant is shown which ones.
 */
export function processQueue(db: DB, queue: QueuedEarn[]): { db: DB; results: SyncResult[] } {
  let cur = db;
  const results: SyncResult[] = [];
  for (const q of [...queue].sort((a, b) => a.ts - b.ts)) {
    const name = findCustomer(cur, q.customerId)?.name;
    try {
      const r = earn(cur, q.customerId, q.litres, q.ts);
      cur = r.db;
      results.push({ id: q.id, customerId: q.customerId, customerName: name, litres: q.litres, ok: true, points: r.points });
    } catch (e) {
      if (!(e instanceof LedgerError)) throw e;
      results.push({ id: q.id, customerId: q.customerId, customerName: name, litres: q.litres, ok: false, reason: e.message });
    }
  }
  return { db: cur, results };
}

export const previewPoints = litresToPoints;
