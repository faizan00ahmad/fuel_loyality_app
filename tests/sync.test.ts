import test from 'node:test';
import assert from 'node:assert/strict';
import { MIN, balanceOf, buildCustomerCache, createRewardToken, earn, redeemToken, staffRedeem } from '../src/core/logic';
import { processQueue } from '../src/core/sync';
import { DEMO_ALI, DEMO_SARA, buildSeed } from '../src/core/seed';

const now = Date.UTC(2026, 9, 12);

test('offline queue replays in capture order and credits the right customers', () => {
  const db = buildSeed(now);
  const before = balanceOf(db, DEMO_ALI, now);
  const { db: after, results } = processQueue(db, [
    { id: 'q2', customerId: DEMO_ALI, litres: 20.9, ts: now + 40 * MIN },
    { id: 'q1', customerId: DEMO_SARA, litres: 12, ts: now + 10 * MIN },
  ]);
  assert.deepEqual(results.map((r) => r.id), ['q1', 'q2']);
  assert.equal(results.every((r) => r.ok), true);
  assert.equal(balanceOf(after, DEMO_ALI, now + 50 * MIN), before + 20);
  assert.equal(balanceOf(after, DEMO_SARA, now + 50 * MIN), 12 + 60);
});

test('offline queue: duplicate scan of the same QR inside 30 minutes is rejected on sync, the first one stands', () => {
  const db = buildSeed(now);
  const { db: after, results } = processQueue(db, [
    { id: 'a', customerId: DEMO_SARA, litres: 10, ts: now + 1 * MIN },
    { id: 'b', customerId: DEMO_SARA, litres: 10, ts: now + 5 * MIN },
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].reason ?? '', /30 minutes/);
  assert.equal(after.txns.filter((t) => t.customerId === DEMO_SARA && t.type === 'earn').length, 2);
});

test('offline queue: unknown or malformed QR is rejected without blocking the rest', () => {
  const db = buildSeed(now);
  const { results } = processQueue(db, [
    { id: 'x', customerId: '33333333-3333-4333-8333-333333333333', litres: 10, ts: now + MIN },
    { id: 'y', customerId: 'not-a-uuid', litres: 10, ts: now + 2 * MIN },
    { id: 'z', customerId: DEMO_ALI, litres: 10, ts: now + 3 * MIN },
  ]);
  assert.deepEqual(results.map((r) => r.ok), [false, false, true]);
});

test('queued earn does not hit the central ledger until synced (customer cache stays unchanged)', () => {
  const db = buildSeed(now);
  const cacheBefore = buildCustomerCache(db, DEMO_ALI, now)!;
  const queued = [{ id: 'q', customerId: DEMO_ALI, litres: 50, ts: now + MIN }];
  assert.equal(buildCustomerCache(db, DEMO_ALI, now + MIN)!.balance, cacheBefore.balance);
  const { db: synced } = processQueue(db, queued);
  assert.equal(buildCustomerCache(synced, DEMO_ALI, now + 2 * MIN)!.balance, cacheBefore.balance + 50);
});

test('end to end across all four roles using one shared ledger', () => {
  let db = buildSeed(now);
  // Staff (POS) earns for Sara; her Rule A window resets, so her banner clears.
  db = earn(db, DEMO_SARA, 100.7, now + MIN).db;
  const sara = buildCustomerCache(db, DEMO_SARA, now + 2 * MIN)!;
  assert.equal(sara.balance, 160);
  assert.equal(sara.expiring, null);
  // Customer creates a Reward QR for puncture service, desk scans it.
  const made = createRewardToken(db, DEMO_SARA, 'puncture', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', now + 3 * MIN);
  const done = redeemToken(made.db, made.token.token, now + 4 * MIN);
  assert.equal(buildCustomerCache(done.db, DEMO_SARA, now + 5 * MIN)!.balance, 10);
  // Path B deducts the rest.
  const b = staffRedeem(done.db, DEMO_SARA, 'tyre_air', now + 6 * MIN);
  assert.equal(buildCustomerCache(b.db, DEMO_SARA, now + 7 * MIN)!.balance, 0);
  // Customer history shows earn (green) then redeems (red), newest first.
  const hist = buildCustomerCache(b.db, DEMO_SARA, now + 7 * MIN)!.txns;
  assert.deepEqual(hist.slice(0, 3).map((t) => t.type), ['redeem', 'redeem', 'earn']);
});
