import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, MIN, LedgerError, applyExpiry, balanceOf, buildCustomerCache, computeMetrics, createRewardToken,
  earn, emptyDb, getLedger, isRewardToken, isUuid, litresToPoints, redeemToken, registerCustomer,
  staffRedeem, updateConfig,
} from '../src/core/logic';
import { DEMO_ALI, DEMO_SARA, buildSeed } from '../src/core/seed';

const U1 = '11111111-1111-4111-8111-111111111111';
const T0 = Date.UTC(2026, 0, 1);

function withCustomer(ts = T0) {
  return registerCustomer(emptyDb(), { uuid: U1, name: 'Test User', mobile: '03001112222', passHash: 'x' }, ts).db;
}
const code = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return e instanceof LedgerError ? e.code : 'OTHER:' + String(e); }
  return 'NO_ERROR';
};

test('SRS 3.6: fractional litres round down (10.8 L = 10 points)', () => {
  assert.equal(litresToPoints(10.8), 10);
  assert.equal(litresToPoints(10.99), 10);
  assert.equal(litresToPoints(0.9), 0);
  assert.equal(litresToPoints(25), 25);
  assert.equal(litresToPoints(NaN), 0);
  assert.equal(litresToPoints(-4), 0);
});

test('earning: 1 litre = 1 point, creates a batch and a green ledger entry', () => {
  const { db, points } = earn(withCustomer(), U1, 10.8, T0 + DAY);
  assert.equal(points, 10);
  assert.equal(balanceOf(db, U1, T0 + DAY), 10);
  assert.equal(db.batches.length, 1);
  assert.equal(db.txns[0].type, 'earn');
  assert.equal(db.txns[0].litres, 10.8);
});

test('earning under 1 litre is rejected (0 points)', () => {
  assert.equal(code(() => earn(withCustomer(), U1, 0.9, T0)), 'BAD_LITRES');
});

test('earning rejects malformed QR payloads and unknown customers', () => {
  assert.equal(code(() => earn(withCustomer(), '03001112222', 10, T0)), 'BAD_QR');
  assert.equal(code(() => earn(withCustomer(), '22222222-2222-4222-8222-222222222222', 10, T0)), 'UNKNOWN_CUSTOMER');
});

test('SRS 3.7: max 1 earn per QR within 30 minutes', () => {
  const a = earn(withCustomer(), U1, 10, T0 + DAY).db;
  assert.equal(code(() => earn(a, U1, 10, T0 + DAY + 29 * MIN)), 'VELOCITY');
  const b = earn(a, U1, 10, T0 + DAY + 30 * MIN);
  assert.equal(b.points, 10);
});

test('Rule A: points stay valid with a purchase every 45 days, and lapse after 45 days of inactivity', () => {
  let db = earn(withCustomer(), U1, 100, T0).db;
  assert.equal(balanceOf(db, U1, T0 + 44 * DAY), 100);
  db = earn(db, U1, 10, T0 + 44 * DAY).db; // resets the window
  assert.equal(balanceOf(db, U1, T0 + 80 * DAY), 110);
  const lapsed = applyExpiry(db, T0 + 90 * DAY);
  assert.equal(balanceOf(lapsed, U1, T0 + 90 * DAY), 0);
  const expiries = lapsed.txns.filter((t) => t.type === 'expire');
  assert.equal(expiries.length, 1); // both batches lapse together, logged as one event
  assert.equal(expiries[0].points, 110);
});

test('Rule A: a late purchase cannot revive already-lapsed points', () => {
  let db = earn(withCustomer(), U1, 100, T0).db;
  db = earn(db, U1, 5, T0 + 60 * DAY).db; // 60 days later, past the 45-day window
  assert.equal(balanceOf(db, U1, T0 + 60 * DAY), 5);
});

test('Rule B: hard expiry at 365 days from issue overrides Rule A', () => {
  let db = withCustomer();
  db = earn(db, U1, 50, T0).db;
  for (let d = 30; d <= 360; d += 30) db = earn(db, U1, 10, T0 + d * DAY).db; // keeps Rule A alive
  assert.equal(balanceOf(db, U1, T0 + 364 * DAY) > 50, true);
  const view = getLedger(db, U1, T0 + 364 * DAY);
  assert.equal(view.batches[0].rule, 'B');
  const after = applyExpiry(db, T0 + 366 * DAY);
  const first = after.batches.find((b) => b.issuedAt === T0)!;
  assert.equal(first.remaining, 0);
  assert.equal(after.batches.filter((b) => b.remaining > 0).length > 0, true);
});

test('Admin can switch Rule B to 180 days and Rule A window within 45-60', () => {
  let db = earn(withCustomer(), U1, 50, T0).db;
  db = updateConfig(db, { hardExpiryDays: 180, activityWindowDays: 60 });
  for (let d = 30; d <= 170; d += 30) db = earn(db, U1, 1, T0 + d * DAY).db;
  assert.equal(getLedger(db, U1, T0 + 179 * DAY).batches.some((b) => b.issuedAt === T0), true);
  assert.equal(getLedger(db, U1, T0 + 181 * DAY).batches.some((b) => b.issuedAt === T0), false);
  assert.equal(code(() => updateConfig(db, { activityWindowDays: 30 })), 'BAD_INPUT');
  assert.equal(code(() => updateConfig(db, { hardExpiryDays: 200 })), 'BAD_INPUT');
});

test('urgency banner data: points expiring within 7 days', () => {
  const db = earn(withCustomer(), U1, 60, T0).db;
  assert.equal(getLedger(db, U1, T0 + 30 * DAY).expiring, null);
  const e = getLedger(db, U1, T0 + 40 * DAY).expiring!;
  assert.equal(e.points, 60);
  assert.equal(e.days, 5);
});

test('Path A: Reward QR is single-use, deducts points, logs the service', () => {
  let db = earn(withCustomer(), U1, 600, T0).db;
  const made = createRewardToken(db, U1, 'car_wash', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', T0 + MIN);
  db = made.db;
  assert.equal(isRewardToken(made.token.token), true);
  assert.equal(isUuid(made.token.token), false);
  const r = redeemToken(db, made.token.token, T0 + 2 * MIN);
  assert.equal(balanceOf(r.db, U1, T0 + 2 * MIN), 100);
  assert.equal(r.db.txns.at(-1)!.type, 'redeem');
  assert.equal(r.db.txns.at(-1)!.desc, 'Redeemed: Car Wash');
  assert.equal(code(() => redeemToken(r.db, made.token.token, T0 + 3 * MIN)), 'TOKEN_USED');
});

test('Path A: Reward QR expires after 5 minutes', () => {
  const db = earn(withCustomer(), U1, 20, T0).db;
  const made = createRewardToken(db, U1, 'tyre_air', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', T0 + MIN);
  assert.equal(code(() => redeemToken(made.db, made.token.token, T0 + MIN + 5 * MIN + 1)), 'TOKEN_EXPIRED');
  assert.equal(redeemToken(made.db, made.token.token, T0 + MIN + 5 * MIN).service.id, 'tyre_air');
});

test('Path A: locked services cannot generate a Reward QR; unknown tokens are rejected', () => {
  const db = earn(withCustomer(), U1, 20, T0).db;
  assert.equal(code(() => createRewardToken(db, U1, 'car_wash', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', T0)), 'INSUFFICIENT');
  assert.equal(code(() => redeemToken(db, 'RWD-nope', T0)), 'TOKEN_NOT_FOUND');
});

test('Path A: balance spent elsewhere after QR creation blocks the redemption', () => {
  let db = earn(withCustomer(), U1, 10, T0).db;
  const made = createRewardToken(db, U1, 'tyre_air', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', T0 + MIN);
  db = staffRedeem(made.db, U1, 'tyre_air', T0 + 2 * MIN).db;
  assert.equal(code(() => redeemToken(db, made.token.token, T0 + 3 * MIN)), 'INSUFFICIENT');
});

test('Path B: staff deduction validates sufficient funds first', () => {
  const db = earn(withCustomer(), U1, 149, T0).db;
  assert.equal(code(() => staffRedeem(db, U1, 'puncture', T0 + MIN)), 'INSUFFICIENT');
  const ok = staffRedeem(earn(db, U1, 1, T0 + 31 * MIN).db, U1, 'puncture', T0 + 32 * MIN);
  assert.equal(balanceOf(ok.db, U1, T0 + 32 * MIN), 0);
});

test('redemption deducts oldest-expiring batches first', () => {
  let db = earn(withCustomer(), U1, 10, T0).db;
  db = earn(db, U1, 20, T0 + 10 * DAY).db;
  db = staffRedeem(db, U1, 'tyre_air', T0 + 11 * DAY).db;
  const view = getLedger(db, U1, T0 + 11 * DAY);
  assert.equal(view.batches.length, 1);
  assert.equal(view.batches[0].remaining, 20);
});

test('registration: validates name and mobile, blocks duplicates, QR payload is the UUID only (no PII)', () => {
  const db = withCustomer();
  assert.equal(code(() => registerCustomer(db, { uuid: U1, name: 'A', mobile: '03001112222', passHash: 'x' }, T0)), 'BAD_INPUT');
  assert.equal(code(() => registerCustomer(db, { uuid: U1, name: 'Bob', mobile: '123', passHash: 'x' }, T0)), 'BAD_INPUT');
  assert.equal(code(() => registerCustomer(db, { uuid: U1, name: 'Bob', mobile: '0300-111-2222', passHash: 'x' }, T0)), 'DUPLICATE');
  const cache = buildCustomerCache(db, U1, T0)!;
  assert.equal(isUuid(cache.uuid), true);
  assert.equal(cache.uuid.includes('Test'), false);
  assert.equal(cache.uuid.includes('0300'), false);
});

test('seed data: Ali has a Rule B banner and all services; Sara has a Rule A banner', () => {
  const now = Date.UTC(2026, 9, 12);
  const db = buildSeed(now);
  const ali = getLedger(db, DEMO_ALI, now);
  assert.equal(ali.balance, 565);
  assert.deepEqual(ali.expiring, { points: 40, days: 5 });
  const sara = getLedger(db, DEMO_SARA, now);
  assert.equal(sara.balance, 60);
  assert.deepEqual(sara.expiring, { points: 60, days: 5 });
});

test('QA time travel: advancing the clock wipes lapsed points and writes expiry ledger entries', () => {
  const now = Date.UTC(2026, 9, 12);
  const db = applyExpiry(buildSeed(now), now + 6 * DAY);
  assert.equal(balanceOf(db, DEMO_SARA, now + 6 * DAY), 0);
  assert.equal(balanceOf(db, DEMO_ALI, now + 6 * DAY), 525);
  assert.equal(db.txns.some((t) => t.type === 'expire' && t.customerId === DEMO_SARA), true);
});

test('admin metrics: issued, redeemed, expired and liability reconcile (issued = redeemed + expired + outstanding)', () => {
  const now = Date.UTC(2026, 9, 12);
  for (const offset of [0, 6, 40, 200]) {
    const db = applyExpiry(buildSeed(now), now + offset * DAY);
    const m = computeMetrics(db, now + offset * DAY);
    assert.equal(m.issued, m.redeemed + m.expired + m.outstanding, `offset ${offset}`);
  }
});

