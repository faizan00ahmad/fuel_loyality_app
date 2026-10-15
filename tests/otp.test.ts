import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OTP_RESEND_MS, OTP_TTL_MS, issueOtp, resendWaitMs, resetOtpForTests, verifyOtp } from '../src/core/otp';
import { PIN_LOCK_MS, resetPinForTests, verifyPin } from '../src/core/staff';
import {
  DAY, balanceOf, buildCustomerCache, computeMetrics, applyExpiry, getLedger,
} from '../src/core/logic';
import {
  DEMO_ALI, DEMO_AYESHA, DEMO_BILAL, DEMO_FATIMA, DEMO_HAMZA, DEMO_IMRAN, DEMO_SARA, DEMO_USMAN, DEMO_ZAINAB, buildSeed,
} from '../src/core/seed';
import { DEMO_CUSTOMERS } from '../src/core/demo';

const T = 1_000_000;
beforeEach(() => { resetOtpForTests(); resetPinForTests(); });

test('OTP is 6 digits and works exactly once', () => {
  const r = issueOtp('0300-1112222', T, () => 0.5);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.match(r.code, /^\d{6}$/);
  assert.deepEqual(verifyOtp('03001112222', r.code, T + 1000), { ok: true });
  assert.deepEqual(verifyOtp('03001112222', r.code, T + 2000), { ok: false, reason: 'none' }); // already burned
});

test('OTP expires after 2 minutes', () => {
  const r = issueOtp('03001112222', T);
  if (!r.ok) throw new Error('issue failed');
  assert.deepEqual(verifyOtp('03001112222', r.code, T + OTP_TTL_MS + 1), { ok: false, reason: 'expired' });
});

test('OTP locks after 3 wrong tries, even if the right code follows', () => {
  const r = issueOtp('03001112222', T, () => 0.1);
  if (!r.ok) throw new Error('issue failed');
  const wrong = r.code === '000000' ? '111111' : '000000';
  assert.deepEqual(verifyOtp('03001112222', wrong, T + 1), { ok: false, reason: 'wrong', triesLeft: 2 });
  assert.deepEqual(verifyOtp('03001112222', wrong, T + 2), { ok: false, reason: 'wrong', triesLeft: 1 });
  assert.deepEqual(verifyOtp('03001112222', wrong, T + 3), { ok: false, reason: 'locked' });
  assert.deepEqual(verifyOtp('03001112222', r.code, T + 4), { ok: false, reason: 'locked' });
});

test('OTP resend is rate limited to one SMS per 30 seconds, then a new code replaces the old one', () => {
  const a = issueOtp('03001112222', T, () => 0.2);
  assert.ok(a.ok);
  const blocked = issueOtp('03001112222', T + 10_000, () => 0.9);
  assert.deepEqual(blocked, { ok: false, waitMs: OTP_RESEND_MS - 10_000 });
  assert.equal(resendWaitMs('03001112222', T + 10_000), OTP_RESEND_MS - 10_000);
  const b = issueOtp('03001112222', T + OTP_RESEND_MS, () => 0.9);
  if (!a.ok || !b.ok) throw new Error('issue failed');
  assert.notEqual(a.code, b.code);
  assert.equal(verifyOtp('03001112222', a.code, T + OTP_RESEND_MS + 1).ok, false); // old code is dead
  assert.equal(verifyOtp('03001112222', b.code, T + OTP_RESEND_MS + 2).ok, true);
});

test('OTP codes are per number', () => {
  const a = issueOtp('03001112222', T, () => 0.3);
  issueOtp('03003334444', T, () => 0.7);
  if (!a.ok) throw new Error('issue failed');
  assert.equal(verifyOtp('03003334444', a.code, T + 1).ok, false);
});

test('staff PIN: right PIN passes, wrong PINs count down then lock for 30 seconds', () => {
  assert.deepEqual(verifyPin('bilal', '0000', T), { ok: false, reason: 'wrong', triesLeft: 2 });
  assert.deepEqual(verifyPin('bilal', '0000', T + 1), { ok: false, reason: 'wrong', triesLeft: 1 });
  assert.deepEqual(verifyPin('bilal', '0000', T + 2), { ok: false, reason: 'locked', waitMs: PIN_LOCK_MS });
  assert.equal(verifyPin('bilal', '1111', T + 3).ok, false); // still locked even with the right PIN
  assert.equal(verifyPin('bilal', '1111', T + 2 + PIN_LOCK_MS + 1).ok, true);
  assert.equal(verifyPin('nobody', '1111', T).ok, false);
});

const NOW = Date.UTC(2026, 9, 12);

test('seed: every demo customer card matches the story it promises', () => {
  const db = buildSeed(NOW);
  const bal = (id: string) => balanceOf(db, id, NOW);
  assert.equal(bal(DEMO_ALI), 565);
  assert.deepEqual(getLedger(db, DEMO_ALI, NOW).expiring, { points: 40, days: 5 });
  assert.equal(bal(DEMO_SARA), 60);
  assert.deepEqual(getLedger(db, DEMO_SARA, NOW).expiring, { points: 60, days: 5 });
  assert.ok(bal(DEMO_USMAN) >= 500, 'Usman can afford a Car Wash');
  assert.equal(bal(DEMO_ZAINAB), 480); // 20 short of a Car Wash
  assert.equal(bal(DEMO_FATIMA), 0);
  assert.ok(db.txns.some((t) => t.customerId === DEMO_FATIMA && t.type === 'expire'));
  assert.equal(bal(DEMO_AYESHA), 35);
  assert.equal(bal(DEMO_IMRAN), 120);
  assert.deepEqual(getLedger(db, DEMO_IMRAN, NOW).expiring, { points: 120, days: 2 });
  assert.ok(bal(DEMO_HAMZA) > 500);
  assert.ok(bal(DEMO_BILAL) > 0);
});

test('seed: demo cards on the sign-in screen all exist in the data', () => {
  const db = buildSeed(NOW);
  for (const d of DEMO_CUSTOMERS) assert.ok(db.customers.some((c) => c.mobile === d.mobile), d.name);
});

test('seed: the dashboard is populated, every service redeemed, and the ledger reconciles over time', () => {
  const db = buildSeed(NOW);
  const m = computeMetrics(db, NOW);
  assert.equal(m.totalCustomers, 9);
  assert.ok(m.issued > 5000);
  assert.ok(m.redeemed > 2000);
  assert.ok(m.redemptionsByService.every((r) => r.count >= 3));
  for (const offset of [0, 7, 40, 200, 400]) {
    const later = applyExpiry(db, NOW + offset * DAY);
    const mm = computeMetrics(later, NOW + offset * DAY);
    assert.equal(mm.issued, mm.redeemed + mm.expired + mm.outstanding, `offset ${offset}`);
  }
  assert.equal(buildCustomerCache(db, DEMO_USMAN, NOW)!.txns.length > 20, true);
});
