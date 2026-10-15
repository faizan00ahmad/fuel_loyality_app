/**
 * Formal QA suite. Every test title starts with a test-case ID that is listed in docs/QA-Report.md,
 * together with the SRS clause it verifies. Boundaries are tested on both sides.
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, MIN, DEFAULT_CONFIG, LedgerError, applyExpiry, balanceOf, buildCustomerCache, computeMetrics,
  createRewardToken, earn, emptyDb, getLedger, isRewardToken, isUuid, litresToPoints, normalizeMobile,
  redeemToken, registerCustomer, staffRedeem, updateConfig, validateMobile,
} from '../src/core/logic';
import {
  DEMO_PASSWORD, LOGIN_LOCK_MS, LOGIN_MAX_TRIES, checkLogin, hashPassword, resetAuthForTests, validatePassword,
} from '../src/core/auth';
import { OTP_RESEND_MS, OTP_TTL_MS, issueOtp, resetOtpForTests, verifyOtp } from '../src/core/otp';
import { PIN_LOCK_MS, STAFF_ACCOUNTS, resetPinForTests, verifyPin } from '../src/core/staff';
import { processQueue } from '../src/core/sync';
import { buildSeed } from '../src/core/seed';
import type { DB, ServiceId } from '../src/types';

const T0 = Date.UTC(2026, 0, 1, 9, 0, 0);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TK = (n: number) => `${String(n).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;

beforeEach(() => { resetOtpForTests(); resetPinForTests(); resetAuthForTests(); });

const reg = (db: DB, uuid: string, mobile: string, name = 'Test User', ts = T0) =>
  registerCustomer(db, { uuid, name, mobile, passHash: hashPassword(uuid, 'Secret1') }, ts).db;
const base = () => reg(reg(emptyDb(), A, '03001112222'), B, '03003334444', 'Second User');
const code = (fn: () => unknown): string => {
  try { fn(); } catch (e) { return e instanceof LedgerError ? e.code : 'OTHER:' + String(e); }
  return 'NO_ERROR';
};
const withPoints = (pts: number, ts = T0) => earn(base(), A, pts, ts).db;

// ---------------------------------------------------------------- REG: account provisioning (SRS 3.1)
test('REG-01: registration stores UUID, name and mobile; vehicle is optional', () => {
  const db = reg(emptyDb(), A, '03001112222');
  assert.equal(db.customers.length, 1);
  assert.equal(db.customers[0].uuid, A);
  assert.equal(db.customers[0].name, 'Test User');
  assert.equal(db.customers[0].vehicle, undefined);
});

test('REG-02: vehicle number is trimmed and upper-cased', () => {
  const r = registerCustomer(emptyDb(), { uuid: A, name: 'Test User', mobile: '03001112222', vehicle: '  lea-123 ', passHash: 'h' }, T0);
  assert.equal(r.customer.vehicle, 'LEA-123');
  const blank = registerCustomer(emptyDb(), { uuid: A, name: 'Test User', mobile: '03001112222', vehicle: '   ', passHash: 'h' }, T0);
  assert.equal(blank.customer.vehicle, undefined);
});

test('REG-03: names shorter than 2 characters are rejected', () => {
  assert.equal(code(() => reg(emptyDb(), A, '03001112222', 'A')), 'BAD_INPUT');
  assert.equal(code(() => reg(emptyDb(), A, '03001112222', '   ')), 'BAD_INPUT');
});

test('REG-04: invalid mobile numbers are rejected', () => {
  for (const bad of ['', '123', '1234567890', '0400-1234567', '0300-12345', '0300-123456789', 'abcdefghijk', '03001112']) {
    assert.equal(validateMobile(bad), false, `"${bad}" must be invalid`);
    assert.equal(code(() => reg(emptyDb(), A, bad)), 'BAD_INPUT', `"${bad}"`);
  }
  assert.equal(validateMobile('0300-1112222'), true);
});

test('REG-05: every common way of writing the same number normalises identically', () => {
  for (const f of ['03001112222', '0300-1112222', '0300 111 2222', '+92 300 1112222', '+923001112222', '923001112222', '00923001112222']) {
    assert.equal(normalizeMobile(f), '03001112222', f);
    assert.equal(validateMobile(f), true, f);
  }
});

test('REG-06: a number cannot be registered twice, whatever its format', () => {
  const db = reg(emptyDb(), A, '03001112222');
  for (const dup of ['0300-1112222', '+92 300 1112222', '923001112222']) {
    assert.equal(code(() => reg(db, B, dup, 'Other')), 'DUPLICATE', dup);
  }
});

test('REG-07: password rules (6+ chars, letter and number, confirmation matches)', () => {
  assert.ok(validatePassword('a1'));
  assert.ok(validatePassword('abcdef'));
  assert.ok(validatePassword('123456'));
  assert.ok(validatePassword('Secret1', 'Secret2'));
  assert.equal(validatePassword('Secret1', 'Secret1'), null);
  assert.equal(validatePassword('abc123'), null); // exactly 6 characters
});

test('REG-08: only a salted hash is stored, never the password', () => {
  const db = buildSeed(T0);
  for (const c of db.customers) {
    assert.match(c.passHash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(c).includes(DEMO_PASSWORD), false);
  }
  assert.notEqual(hashPassword(A, 'Secret1'), hashPassword(B, 'Secret1'));
});

// ---------------------------------------------------------------- AUTH: customer sign-in (mobile + password, never OTP)
test('AUTH-01: sign-in works with mobile and password in any phone format, no OTP involved', () => {
  const db = base();
  for (const m of ['03001112222', '0300-1112222', '+923001112222']) assert.equal(checkLogin(db, m, 'Secret1', T0).ok, true, m);
});

test('AUTH-02: wrong password counts tries down', () => {
  const db = base();
  assert.deepEqual(checkLogin(db, '03001112222', 'bad', T0), { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - 1 });
  assert.deepEqual(checkLogin(db, '03001112222', 'bad', T0 + 1), { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - 2 });
});

test('AUTH-03: 5 wrong passwords lock the number for 60 seconds, then it unlocks (both sides of the boundary)', () => {
  const db = base();
  for (let i = 0; i < LOGIN_MAX_TRIES; i++) checkLogin(db, '03001112222', 'bad', T0 + i);
  const lockAt = T0 + LOGIN_MAX_TRIES - 1;
  assert.equal(checkLogin(db, '03001112222', 'Secret1', lockAt + LOGIN_LOCK_MS - 1).ok, false);
  assert.equal(checkLogin(db, '03001112222', 'Secret1', lockAt + LOGIN_LOCK_MS).ok, true);
});

test('AUTH-04: unknown numbers are reported as unknown', () => {
  assert.deepEqual(checkLogin(base(), '03009999999', 'Secret1', T0), { ok: false, reason: 'unknown' });
});

test('AUTH-05: passwords are case sensitive and a blank password never matches', () => {
  const db = base();
  assert.equal(checkLogin(db, '03001112222', 'secret1', T0).ok, false);
  assert.equal(checkLogin(db, '03001112222', '', T0 + 1).ok, false);
});

test('AUTH-06: one customer being locked does not lock another', () => {
  const db = base();
  for (let i = 0; i < LOGIN_MAX_TRIES; i++) checkLogin(db, '03001112222', 'bad', T0 + i);
  assert.equal(checkLogin(db, '03003334444', 'Secret1', T0 + 10).ok, true);
});

test('AUTH-07: a correct sign-in clears earlier failed attempts', () => {
  const db = base();
  for (let i = 0; i < LOGIN_MAX_TRIES - 1; i++) checkLogin(db, '03001112222', 'bad', T0 + i);
  assert.equal(checkLogin(db, '03001112222', 'Secret1', T0 + 10).ok, true);
  assert.deepEqual(checkLogin(db, '03001112222', 'bad', T0 + 11), { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - 1 });
});

// ---------------------------------------------------------------- OTP: sign-up verification (SRS 3.1)
test('OTP-01: code is always 6 digits (lowest and highest random values)', () => {
  const lo = issueOtp('03001112222', T0, () => 0);
  resetOtpForTests();
  const hi = issueOtp('03001112222', T0, () => 0.9999999999);
  assert.ok(lo.ok && hi.ok);
  if (lo.ok && hi.ok) {
    assert.equal(lo.code, '100000');
    assert.equal(hi.code, '999999');
  }
});

test('OTP-02: single use, a correct code cannot be replayed', () => {
  const r = issueOtp('03001112222', T0);
  if (!r.ok) throw new Error('issue');
  assert.equal(verifyOtp('03001112222', r.code, T0 + 1).ok, true);
  assert.equal(verifyOtp('03001112222', r.code, T0 + 2).ok, false);
});

test('OTP-03: valid until exactly 2 minutes, expired one millisecond later', () => {
  const r = issueOtp('03001112222', T0);
  if (!r.ok) throw new Error('issue');
  assert.equal(verifyOtp('03001112222', r.code, T0 + OTP_TTL_MS).ok, true);
  resetOtpForTests();
  const r2 = issueOtp('03001112222', T0);
  if (!r2.ok) throw new Error('issue');
  assert.deepEqual(verifyOtp('03001112222', r2.code, T0 + OTP_TTL_MS + 1), { ok: false, reason: 'expired' });
});

test('OTP-04: three wrong tries lock the code, even for the right code afterwards', () => {
  const r = issueOtp('03001112222', T0, () => 0);
  if (!r.ok) throw new Error('issue');
  for (let i = 0; i < 3; i++) verifyOtp('03001112222', '000000', T0 + i);
  assert.deepEqual(verifyOtp('03001112222', r.code, T0 + 5), { ok: false, reason: 'locked' });
});

test('OTP-05: resend is blocked for 30 seconds, allowed at 30 seconds, and kills the previous code', () => {
  const a = issueOtp('03001112222', T0, () => 0.1);
  assert.deepEqual(issueOtp('03001112222', T0 + OTP_RESEND_MS - 1), { ok: false, waitMs: 1 });
  const b = issueOtp('03001112222', T0 + OTP_RESEND_MS, () => 0.8);
  if (!a.ok || !b.ok) throw new Error('issue');
  assert.equal(verifyOtp('03001112222', a.code, T0 + OTP_RESEND_MS + 1).ok, false);
  assert.equal(verifyOtp('03001112222', b.code, T0 + OTP_RESEND_MS + 2).ok, true);
});

test('OTP-06: a code for one number never verifies another number, and no code means no access', () => {
  const a = issueOtp('03001112222', T0);
  if (!a.ok) throw new Error('issue');
  assert.equal(verifyOtp('03003334444', a.code, T0 + 1).ok, false);
  assert.deepEqual(verifyOtp('03005556666', '123456', T0), { ok: false, reason: 'none' });
});

// ---------------------------------------------------------------- PIN: staff and admin sign-in
test('PIN-01: each demo staff account accepts only its own PIN', () => {
  for (const a of STAFF_ACCOUNTS) {
    assert.equal(verifyPin(a.id, a.pin, T0).ok, true, a.name);
    for (const other of STAFF_ACCOUNTS.filter((o) => o.id !== a.id)) {
      resetPinForTests();
      assert.equal(verifyPin(a.id, other.pin, T0).ok, false, `${a.name} with ${other.name}'s PIN`);
    }
    resetPinForTests();
  }
});

test('PIN-02: 3 wrong PINs lock the account for 30 seconds (both sides of the boundary)', () => {
  verifyPin('bilal', '0000', T0); verifyPin('bilal', '0000', T0 + 1);
  assert.deepEqual(verifyPin('bilal', '0000', T0 + 2), { ok: false, reason: 'locked', waitMs: PIN_LOCK_MS });
  assert.equal(verifyPin('bilal', '1111', T0 + 2 + PIN_LOCK_MS - 1).ok, false);
  assert.equal(verifyPin('bilal', '1111', T0 + 2 + PIN_LOCK_MS).ok, true);
});

test('PIN-03: unknown accounts and malformed PINs are rejected', () => {
  assert.equal(verifyPin('ghost', '1111', T0).ok, false);
  assert.equal(verifyPin('bilal', '', T0).ok, false);
  assert.equal(verifyPin('bilal', '11111', T0).ok, false);
});

// ---------------------------------------------------------------- QR: privacy and routing (SRS 3.7, 1.3.4)
test('QR-01: the customer QR payload is the UUID only, with no personal data', () => {
  const db = buildSeed(T0);
  for (const c of db.customers) {
    const qr = buildCustomerCache(db, c.uuid, T0)!.uuid;
    assert.equal(qr, c.uuid);
    assert.equal(isUuid(qr), true);
    for (const pii of [c.name, c.mobile.slice(-7), c.vehicle ?? '@@@']) assert.equal(qr.includes(pii), false);
  }
});

test('QR-02: every customer has a different UUID', () => {
  const ids = buildSeed(T0).customers.map((c) => c.uuid);
  assert.equal(new Set(ids).size, ids.length);
});

test('QR-03: Reward QR tokens are recognisable and never mistaken for a customer QR', () => {
  const db = withPoints(100);
  const { token } = createRewardToken(db, A, 'tyre_air', TK(1), T0 + MIN);
  assert.equal(isRewardToken(token.token), true);
  assert.equal(isUuid(token.token), false);
  assert.equal(isRewardToken(A), false);
});

test('QR-04: QR validation accepts UUIDs (any case) and rejects everything else', () => {
  assert.equal(isUuid(A.toUpperCase()), true);
  assert.equal(isUuid(` ${A} `), true);
  for (const bad of ['', '03001112222', 'hello', A.slice(1), A + 'x', 'RWD-' + A]) assert.equal(isUuid(bad), false, bad);
});

test('QR-05: a mobile number can never be used to earn points (anti point-stuffing, SRS 1.3.4)', () => {
  assert.equal(code(() => earn(base(), '03001112222', 10, T0)), 'BAD_QR');
  assert.equal(code(() => earn(base(), '', 10, T0)), 'BAD_QR');
});

// ---------------------------------------------------------------- ERN: earning (SRS 1.4, 3.1, 3.6, 3.7)
test('ERN-01: 1 litre = 1 point for whole litres, creating a timestamped batch', () => {
  for (const l of [1, 2, 10, 50, 999]) {
    const r = earn(base(), A, l, T0);
    assert.equal(r.points, l);
    assert.equal(r.db.batches[0].issuedAt, T0);
    assert.equal(r.db.batches[0].remaining, l);
  }
});

test('ERN-02: fractional litres always round DOWN (SRS 3.6)', () => {
  const cases: [number, number][] = [[10.8, 10], [10.99, 10], [10.01, 10], [1.99, 1], [49.5, 49], [0.5 + 20, 20], [999.99, 999]];
  for (const [l, p] of cases) assert.equal(litresToPoints(l), p, String(l));
  assert.equal(earn(base(), A, 10.8, T0).points, 10);
});

test('ERN-03: under one litre earns nothing and is rejected', () => {
  for (const l of [0.99, 0.5, 0.01]) assert.equal(code(() => earn(base(), A, l, T0)), 'BAD_LITRES', String(l));
});

test('ERN-04: zero, negative and non-numeric litres are rejected', () => {
  for (const l of [0, -1, -10.5, NaN, Infinity, -Infinity]) assert.equal(code(() => earn(base(), A, l, T0)), 'BAD_LITRES', String(l));
});

test('ERN-05: velocity check: blocked at 29:59, allowed at exactly 30:00 (SRS 3.7)', () => {
  const db = withPoints(10);
  assert.equal(code(() => earn(db, A, 10, T0 + 30 * MIN - 1)), 'VELOCITY');
  assert.equal(code(() => earn(db, A, 10, T0 + 30 * MIN)), 'NO_ERROR');
});

test('ERN-06: velocity check applies per QR, so a different customer is not blocked', () => {
  const db = withPoints(10);
  assert.equal(code(() => earn(db, B, 10, T0 + MIN)), 'NO_ERROR');
});

test('ERN-07: a blocked earn changes nothing in the ledger', () => {
  const db = withPoints(10);
  const before = JSON.stringify(db);
  assert.equal(code(() => earn(db, A, 25, T0 + MIN)), 'VELOCITY');
  assert.equal(JSON.stringify(db), before);
});

test('ERN-08: unknown customers cannot earn', () => {
  assert.equal(code(() => earn(base(), '33333333-3333-4333-8333-333333333333', 10, T0)), 'UNKNOWN_CUSTOMER');
});

test('ERN-09: separate purchases create separate dated batches (SRS 3.5)', () => {
  let db = earn(base(), A, 10, T0).db;
  db = earn(db, A, 20, T0 + 2 * DAY).db;
  assert.deepEqual(db.batches.map((b) => [b.points, b.issuedAt]), [[10, T0], [20, T0 + 2 * DAY]]);
});

test('ERN-10: litres are logged to 2 decimals and the ledger shows an earning entry', () => {
  const db = earn(base(), A, 12.3456, T0).db;
  assert.equal(db.txns[0].type, 'earn');
  assert.equal(db.txns[0].litres, 12.35);
  assert.equal(db.txns[0].points, 12);
});

// ---------------------------------------------------------------- CAT: catalogue (SRS 3.1, 3.3)
test('CAT-01: the catalogue is exactly the three SRS services with the SRS values', () => {
  const c = DEFAULT_CONFIG.catalog.map((s) => [s.id, s.points, s.price]);
  assert.deepEqual(c, [['tyre_air', 10, 50], ['puncture', 150, 250], ['car_wash', 500, 1000]]);
});

test('CAT-02: a service is unlocked exactly when balance >= its points (boundaries)', () => {
  const unlocked = (bal: number, id: ServiceId) => {
    if (bal === 0) return false;
    const db = withPoints(bal);
    return code(() => createRewardToken(db, A, id, TK(1), T0 + MIN)) === 'NO_ERROR';
  };
  for (const [id, pts] of [['tyre_air', 10], ['puncture', 150], ['car_wash', 500]] as [ServiceId, number][]) {
    assert.equal(unlocked(pts - 1, id), false, `${id} at ${pts - 1}`);
    assert.equal(unlocked(pts, id), true, `${id} at ${pts}`);
    assert.equal(unlocked(pts + 1, id), true, `${id} at ${pts + 1}`);
  }
});

// ---------------------------------------------------------------- RDM: redemption Path A (SRS 3.1)
test('RDM-A1: Reward QR lasts exactly 5 minutes (valid at 5:00, expired 1 ms later)', () => {
  const made = createRewardToken(withPoints(50), A, 'tyre_air', TK(1), T0 + MIN);
  assert.equal(code(() => redeemToken(made.db, made.token.token, T0 + MIN + 5 * MIN)), 'NO_ERROR');
  assert.equal(code(() => redeemToken(made.db, made.token.token, T0 + MIN + 5 * MIN + 1)), 'TOKEN_EXPIRED');
});

test('RDM-A2: Reward QR is single use', () => {
  const made = createRewardToken(withPoints(50), A, 'tyre_air', TK(1), T0 + MIN);
  const done = redeemToken(made.db, made.token.token, T0 + 2 * MIN);
  assert.equal(code(() => redeemToken(done.db, made.token.token, T0 + 3 * MIN)), 'TOKEN_USED');
});

test('RDM-A3: redemption deducts the right points and logs the service (red entry)', () => {
  const made = createRewardToken(withPoints(200), A, 'puncture', TK(1), T0 + MIN);
  const done = redeemToken(made.db, made.token.token, T0 + 2 * MIN);
  assert.equal(balanceOf(done.db, A, T0 + 2 * MIN), 50);
  const last = done.db.txns.at(-1)!;
  assert.deepEqual([last.type, last.points, last.serviceId, last.desc], ['redeem', 150, 'puncture', 'Redeemed: Tyre Puncture Service']);
});

test('RDM-A4: locked services cannot generate a Reward QR and nothing is created', () => {
  const db = withPoints(9);
  assert.equal(code(() => createRewardToken(db, A, 'tyre_air', TK(1), T0 + MIN)), 'INSUFFICIENT');
  assert.equal(db.tokens.length, 0);
});

test('RDM-A5: unknown or malformed tokens are rejected', () => {
  const db = withPoints(50);
  for (const t of ['', 'RWD-nope', A, 'RWD-' + A]) assert.equal(code(() => redeemToken(db, t, T0)), 'TOKEN_NOT_FOUND', t);
});

test('RDM-A6: an expired token deducts nothing', () => {
  const made = createRewardToken(withPoints(50), A, 'tyre_air', TK(1), T0 + MIN);
  assert.equal(code(() => redeemToken(made.db, made.token.token, T0 + 10 * MIN)), 'TOKEN_EXPIRED');
  assert.equal(balanceOf(made.db, A, T0 + 10 * MIN), 50);
});

test('RDM-A7: two Reward QRs cannot spend the same points twice', () => {
  const first = createRewardToken(withPoints(500), A, 'car_wash', TK(1), T0 + MIN);
  const second = createRewardToken(first.db, A, 'car_wash', TK(2), T0 + MIN);
  const a = redeemToken(second.db, first.token.token, T0 + 2 * MIN);
  assert.equal(code(() => redeemToken(a.db, second.token.token, T0 + 3 * MIN)), 'INSUFFICIENT');
  assert.equal(balanceOf(a.db, A, T0 + 3 * MIN), 0);
});

test('RDM-A8: the points shown to the customer are locked in when the QR is created, even if Admin changes the price', () => {
  const made = createRewardToken(withPoints(100), A, 'tyre_air', TK(1), T0 + MIN);
  const repriced = updateConfig(made.db, { catalog: made.db.config.catalog.map((s) => (s.id === 'tyre_air' ? { ...s, points: 40 } : s)) });
  const done = redeemToken(repriced, made.token.token, T0 + 2 * MIN);
  assert.equal(done.db.txns.at(-1)!.points, 10);
  assert.equal(balanceOf(done.db, A, T0 + 2 * MIN), 90);
});

test('RDM-A9: points that expire before the QR is scanned cannot be spent', () => {
  let db = earn(base(), A, 10, T0).db;
  const made = createRewardToken(db, A, 'tyre_air', TK(1), T0 + 44 * DAY + 23 * 60 * MIN);
  db = made.db;
  // the QR (5 min) is scanned after the 45-day window closed
  assert.ok(['INSUFFICIENT', 'TOKEN_EXPIRED'].includes(code(() => redeemToken(db, made.token.token, T0 + 45 * DAY + 1))));
});

// ---------------------------------------------------------------- RDM-B: staff-initiated (SRS 3.1)
test('RDM-B1: staff deduction works when funds are sufficient, and to exactly zero', () => {
  const r = staffRedeem(withPoints(150), A, 'puncture', T0 + MIN);
  assert.equal(balanceOf(r.db, A, T0 + MIN), 0);
});

test('RDM-B2: insufficient funds are rejected and the ledger is untouched', () => {
  const db = withPoints(149);
  const before = JSON.stringify(db);
  assert.equal(code(() => staffRedeem(db, A, 'puncture', T0 + MIN)), 'INSUFFICIENT');
  assert.equal(JSON.stringify(db), before);
});

test('RDM-B3: bad QR or unknown customer is rejected', () => {
  const db = withPoints(50);
  assert.equal(code(() => staffRedeem(db, 'nope', 'tyre_air', T0)), 'BAD_QR');
  assert.equal(code(() => staffRedeem(db, B.replace('2', '5'), 'tyre_air', T0)), 'UNKNOWN_CUSTOMER');
});

test('RDM-B4: deduction takes the soonest-expiring batches first, across batches', () => {
  let db = earn(base(), A, 10, T0).db;
  db = earn(db, A, 20, T0 + 10 * DAY).db;
  db = earn(db, A, 30, T0 + 20 * DAY).db;
  db = staffRedeem(db, A, 'tyre_air', T0 + 21 * DAY).db; // 10 points
  assert.deepEqual(getLedger(db, A, T0 + 21 * DAY).batches.map((b) => b.remaining), [20, 30]);
  db = staffRedeem(updateConfig(db, { catalog: db.config.catalog.map((s) => (s.id === 'tyre_air' ? { ...s, points: 35 } : s)) }), A, 'tyre_air', T0 + 22 * DAY).db;
  assert.deepEqual(getLedger(db, A, T0 + 22 * DAY).batches.map((b) => b.remaining), [15]);
});

// ---------------------------------------------------------------- EXP: expiry rules (SRS 3.1 Rules A and B, 4)
const lastBatchExpiry = (db: DB) => getLedger(db, A, T0).batches[0]?.expiresAt;

test('EXP-01: Rule A: valid until 45 days after the last purchase, expired at exactly 45 days', () => {
  const db = withPoints(100);
  assert.equal(balanceOf(db, A, T0 + 45 * DAY - 1), 100);
  assert.equal(balanceOf(db, A, T0 + 45 * DAY), 0);
  assert.equal(lastBatchExpiry(db), T0 + 45 * DAY);
});

test('EXP-02: Rule A: a new purchase renews validity of ALL existing points', () => {
  let db = withPoints(100);
  db = earn(db, A, 5, T0 + 44 * DAY).db;
  assert.equal(balanceOf(db, A, T0 + 88 * DAY), 105);
  assert.equal(balanceOf(db, A, T0 + 89 * DAY), 0);
});

test('EXP-03: Rule A window is configurable (60 days)', () => {
  const db = updateConfig(withPoints(100), { activityWindowDays: 60 });
  assert.equal(balanceOf(db, A, T0 + 59 * DAY), 100);
  assert.equal(balanceOf(db, A, T0 + 60 * DAY), 0);
});

test('EXP-04: Rule B: hard expiry 365 days from issue, even with regular purchases', () => {
  let db = earn(base(), A, 50, T0).db;
  for (let d = 30; d <= 360; d += 30) db = earn(db, A, 1, T0 + d * DAY).db;
  const first = (at: number) => getLedger(db, A, at).batches.some((b) => b.issuedAt === T0);
  assert.equal(first(T0 + 365 * DAY - 1), true);
  assert.equal(first(T0 + 365 * DAY), false);
});

test('EXP-05: Rule B window is configurable (180 days)', () => {
  let db = updateConfig(earn(base(), A, 50, T0).db, { hardExpiryDays: 180 });
  for (let d = 30; d <= 170; d += 30) db = earn(db, A, 1, T0 + d * DAY).db;
  assert.equal(getLedger(db, A, T0 + 180 * DAY - 1).batches.some((b) => b.issuedAt === T0), true);
  assert.equal(getLedger(db, A, T0 + 180 * DAY).batches.some((b) => b.issuedAt === T0), false);
});

test('EXP-06: whichever rule bites first wins, and the entry names the right reason', () => {
  const ruleA = applyExpiry(withPoints(10), T0 + 46 * DAY).txns.find((t) => t.type === 'expire')!;
  assert.match(ruleA.desc, /no fuel purchase in 45 days/);
  assert.equal(ruleA.ts, T0 + 45 * DAY);
  let db = earn(base(), A, 10, T0).db;
  for (let d = 30; d <= 360; d += 30) db = earn(db, A, 1, T0 + d * DAY).db;
  const ruleB = applyExpiry(db, T0 + 366 * DAY).txns.find((t) => t.type === 'expire' && t.ts === T0 + 365 * DAY)!;
  assert.match(ruleB.desc, /365-day limit/);
});

test('EXP-07: expired points cannot be redeemed', () => {
  const db = withPoints(100);
  assert.equal(code(() => staffRedeem(db, A, 'tyre_air', T0 + 46 * DAY)), 'INSUFFICIENT');
});

test('EXP-08: a late purchase cannot bring lapsed points back (SRS 3.1 retention rule)', () => {
  const db = earn(withPoints(100), A, 5, T0 + 50 * DAY).db;
  assert.equal(balanceOf(db, A, T0 + 50 * DAY), 5);
});

test('EXP-09: running the expiry job twice creates no duplicate entries', () => {
  const once = applyExpiry(withPoints(100), T0 + 100 * DAY);
  const twice = applyExpiry(once, T0 + 100 * DAY);
  assert.equal(once.txns.filter((t) => t.type === 'expire').length, 1);
  assert.equal(twice.txns.filter((t) => t.type === 'expire').length, 1);
  assert.equal(JSON.stringify(applyExpiry(twice, T0 + 200 * DAY).txns), JSON.stringify(twice.txns));
});

test('EXP-10: urgency banner appears from 7 days out, not before (boundary), with days rounded up', () => {
  const db = withPoints(60);
  assert.equal(getLedger(db, A, T0 + 38 * DAY - 1).expiring, null);
  assert.deepEqual(getLedger(db, A, T0 + 38 * DAY).expiring, { points: 60, days: 7 });
  assert.deepEqual(getLedger(db, A, T0 + 44 * DAY).expiring, { points: 60, days: 1 });
  assert.deepEqual(getLedger(db, A, T0 + 44 * DAY + 23 * 60 * MIN).expiring, { points: 60, days: 1 });
});

test('EXP-11: banner counts only the points about to expire', () => {
  let db = earn(base(), A, 40, T0).db;
  db = earn(db, A, 100, T0 + 100 * DAY).db; // first batch lapsed under Rule A
  db = applyExpiry(db, T0 + 100 * DAY);
  const b = getLedger(db, A, T0 + 100 * DAY);
  assert.equal(b.balance, 100);
  assert.equal(b.expiring, null);
});

test('EXP-12: a customer who never earned has no balance, no banner, and no errors', () => {
  const db = applyExpiry(base(), T0 + 1000 * DAY);
  assert.deepEqual(getLedger(db, A, T0 + 1000 * DAY), { balance: 0, batches: [], expiring: null });
});

test('EXP-13: after a long jump everything lapses and the books balance', () => {
  const db = applyExpiry(buildSeed(T0), T0 + 800 * DAY);
  const m = computeMetrics(db, T0 + 800 * DAY);
  assert.equal(m.outstanding, 0);
  assert.equal(m.issued, m.redeemed + m.expired);
});

// ---------------------------------------------------------------- SYN: offline queue and sync (SRS 3.5, 5.1)
const seedNow = Date.UTC(2026, 9, 12);
test('SYN-01: queued transactions replay in the order they were captured', () => {
  const db = withPoints(10);
  const { results } = processQueue(db, [
    { id: 'c', customerId: B, litres: 5, ts: T0 + 90 * MIN },
    { id: 'a', customerId: A, litres: 5, ts: T0 + 40 * MIN },
    { id: 'b', customerId: B, litres: 5, ts: T0 + 50 * MIN },
  ]);
  assert.deepEqual(results.map((r) => r.id), ['a', 'b', 'c']);
});

test('SYN-02: the original capture time is kept for each point batch', () => {
  const { db } = processQueue(base(), [{ id: 'q', customerId: A, litres: 8, ts: T0 + 123 * MIN }]);
  assert.equal(db.batches[0].issuedAt, T0 + 123 * MIN);
  assert.equal(db.txns[0].ts, T0 + 123 * MIN);
});

test('SYN-03: two scans of the same QR within 30 minutes: the first is credited, the second is rejected with a reason', () => {
  const { db, results } = processQueue(base(), [
    { id: '1', customerId: A, litres: 10, ts: T0 },
    { id: '2', customerId: A, litres: 10, ts: T0 + 29 * MIN },
  ]);
  assert.deepEqual(results.map((r) => r.ok), [true, false]);
  assert.match(results[1].reason ?? '', /30 minutes/);
  assert.equal(balanceOf(db, A, T0 + 30 * MIN), 10);
});

test('SYN-04: one bad item never blocks the others', () => {
  const { results } = processQueue(base(), [
    { id: 'x', customerId: 'garbage', litres: 10, ts: T0 },
    { id: 'y', customerId: '33333333-3333-4333-8333-333333333333', litres: 10, ts: T0 + 1 },
    { id: 'z', customerId: A, litres: 0.4, ts: T0 + 2 },
    { id: 'w', customerId: A, litres: 10, ts: T0 + 3 },
  ]);
  assert.deepEqual(results.map((r) => r.ok), [false, false, false, true]);
});

test('SYN-05: replaying the same queue twice cannot double-credit (idempotent sync)', () => {
  const q = [{ id: 'q', customerId: A, litres: 10, ts: T0 }];
  const first = processQueue(base(), q);
  const second = processQueue(first.db, q);
  assert.equal(second.results[0].ok, false);
  assert.equal(balanceOf(second.db, A, T0 + MIN), 10);
});

test('SYN-06: an empty queue changes nothing', () => {
  const db = withPoints(10);
  const r = processQueue(db, []);
  assert.equal(r.results.length, 0);
  assert.equal(JSON.stringify(r.db), JSON.stringify(db));
});

test('SYN-07: the customer sees offline earnings only after sync, with identical figures everywhere', () => {
  const db = buildSeed(seedNow);
  const customer = db.customers[0].uuid;
  const before = buildCustomerCache(db, customer, seedNow)!.balance;
  const { db: synced } = processQueue(db, [{ id: 'q', customerId: customer, litres: 33.9, ts: seedNow + MIN }]);
  const after = buildCustomerCache(synced, customer, seedNow + 2 * MIN)!.balance;
  assert.equal(after, before + 33);
  const m = computeMetrics(synced, seedNow + 2 * MIN);
  assert.equal(m.issued, m.redeemed + m.expired + m.outstanding);
});

// ---------------------------------------------------------------- ADM: admin (SRS 3.4)
test('ADM-01: Total Active Users counts customers who bought fuel within the activity window', () => {
  let db = earn(base(), A, 10, T0).db;
  db = earn(db, B, 10, T0 + 30 * DAY).db;
  assert.equal(computeMetrics(db, T0 + 40 * DAY).activeUsers, 2);
  assert.equal(computeMetrics(db, T0 + 46 * DAY).activeUsers, 1); // A lapsed at day 45
  assert.equal(computeMetrics(db, T0 + 76 * DAY).activeUsers, 0);
  assert.equal(computeMetrics(db, T0 + 40 * DAY).totalCustomers, 2);
});

test('ADM-02: issued = redeemed + expired + outstanding at every point in time (liability reconciles)', () => {
  const db = buildSeed(seedNow);
  for (const d of [0, 1, 6, 7, 30, 44, 45, 46, 90, 180, 364, 365, 366, 500]) {
    const m = computeMetrics(applyExpiry(db, seedNow + d * DAY), seedNow + d * DAY);
    assert.equal(m.issued, m.redeemed + m.expired + m.outstanding, `day ${d}`);
  }
});

test('ADM-03: configuration limits follow the SRS (Rule A 45 to 60, Rule B 180 or 365)', () => {
  const db = base();
  for (const d of [44, 61, 0, -5]) assert.equal(code(() => updateConfig(db, { activityWindowDays: d })), 'BAD_INPUT', String(d));
  for (const d of [45, 50, 60]) assert.equal(updateConfig(db, { activityWindowDays: d }).config.activityWindowDays, d);
  for (const d of [90, 181, 364, 366]) assert.equal(code(() => updateConfig(db, { hardExpiryDays: d })), 'BAD_INPUT', String(d));
  for (const d of [180, 365]) assert.equal(updateConfig(db, { hardExpiryDays: d }).config.hardExpiryDays, d);
});

test('ADM-04: catalogue values are validated (whole positive points, non-negative price)', () => {
  const db = base();
  const set = (patch: Partial<{ points: number; price: number }>) =>
    updateConfig(db, { catalog: db.config.catalog.map((s, i) => (i === 0 ? { ...s, ...patch } : s)) });
  for (const bad of [{ points: 0 }, { points: -1 }, { points: 2.5 }, { points: NaN }, { price: -1 }, { price: Infinity }]) {
    assert.equal(code(() => set(bad)), 'BAD_INPUT', JSON.stringify(bad));
  }
  assert.equal(set({ points: 12, price: 60 }).config.catalog[0].points, 12);
});

test('ADM-05: catalogue changes reach the customer app on the next sync, and the old config is not mutated', () => {
  const db = withPoints(100);
  const changed = updateConfig(db, { catalog: db.config.catalog.map((s) => (s.id === 'tyre_air' ? { ...s, points: 20, price: 80 } : s)) });
  assert.equal(buildCustomerCache(changed, A, T0)!.catalog[0].points, 20);
  assert.equal(db.config.catalog[0].points, 10);
});

test('ADM-06: the liability ledger values points at 1 point = Rs. 1', () => {
  const m = computeMetrics(withPoints(250), T0 + MIN);
  assert.equal(m.outstanding, 250);
});

test('ADM-07: points expiring within 30 days are reported', () => {
  const m = computeMetrics(withPoints(100), T0 + 20 * DAY);
  assert.equal(m.expiringIn30, 100);
  assert.equal(computeMetrics(withPoints(100), T0 + 5 * DAY).expiringIn30, 0); // 40 days left is outside the 30-day view
  assert.equal(computeMetrics(withPoints(100), T0 + 15 * DAY).expiringIn30, 100); // exactly 30 days left is included
});

// ---------------------------------------------------------------- CACHE: customer app data (SRS 3.2, 3.5)
test('CACHE-01: the cached pass holds the QR value, balance, dated ledger and history newest first', () => {
  let db = earn(base(), A, 10, T0).db;
  db = earn(db, A, 20, T0 + DAY).db;
  db = staffRedeem(db, A, 'tyre_air', T0 + 2 * DAY).db;
  const c = buildCustomerCache(db, A, T0 + 2 * DAY)!;
  assert.equal(c.uuid, A);
  assert.equal(c.balance, 20);
  assert.deepEqual(c.txns.map((t) => t.type), ['redeem', 'earn', 'earn']);
  assert.equal(c.ledger.every((b) => b.expiresAt > T0 + 2 * DAY && b.issuedAt <= T0 + 2 * DAY), true);
});

test('CACHE-02: the cache survives a JSON round trip (this is how it is stored on the device)', () => {
  const c = buildCustomerCache(buildSeed(seedNow), buildSeed(seedNow).customers[0].uuid, seedNow)!;
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
});

test('CACHE-03: an unknown customer has no cache', () => {
  assert.equal(buildCustomerCache(base(), '33333333-3333-4333-8333-333333333333', T0), null);
});

test('CACHE-04: a cached pass never reveals another customer’s data', () => {
  let db = earn(base(), A, 10, T0).db;
  db = earn(db, B, 99, T0).db;
  const c = buildCustomerCache(db, A, T0 + MIN)!;
  assert.equal(c.balance, 10);
  assert.equal(c.txns.every((t) => t.customerId === A), true);
});

// ---------------------------------------------------------------- INV: ledger integrity (property based, seeded random)
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('INV-01: 300 random runs of earn / redeem / token / time-jump never break the ledger rules', () => {
  const svc: ServiceId[] = ['tyre_air', 'puncture', 'car_wash'];
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = mulberry32(seed);
    let db = base();
    let t = T0;
    let tok = 0;
    for (let step = 0; step < 60; step++) {
      const who = rnd() < 0.5 ? A : B;
      const pick = rnd();
      t += Math.floor(rnd() * (rnd() < 0.15 ? 90 * DAY : 3 * 60 * MIN));
      try {
        if (pick < 0.45) db = earn(db, who, 1 + rnd() * 80, t).db;
        else if (pick < 0.7) db = staffRedeem(db, who, svc[Math.floor(rnd() * 3)], t).db;
        else if (pick < 0.9) {
          const made = createRewardToken(db, who, svc[Math.floor(rnd() * 3)], TK(++tok), t);
          db = rnd() < 0.5 ? redeemToken(made.db, made.token.token, t + Math.floor(rnd() * 7 * MIN)).db : made.db;
        } else db = applyExpiry(db, t);
      } catch (e) {
        if (!(e instanceof LedgerError)) throw e;
      }
      db = applyExpiry(db, t);
      for (const b of db.batches) assert.ok(b.remaining >= 0 && b.remaining <= b.points, `seed ${seed} batch ${b.id}`);
      for (const x of db.txns) assert.ok(x.points > 0, `seed ${seed} txn ${x.id}`);
      for (const c of [A, B]) assert.ok(balanceOf(db, c, t) >= 0);
      const m = computeMetrics(db, t);
      assert.equal(m.issued, m.redeemed + m.expired + m.outstanding, `seed ${seed} step ${step}`);
      assert.equal(new Set(db.txns.map((x) => x.id)).size, db.txns.length, `seed ${seed} duplicate txn ids`);
    }
  }
});

test('INV-02: seed data is internally consistent', () => {
  const db = buildSeed(seedNow);
  const ids = new Set(db.customers.map((c) => c.uuid));
  assert.equal(db.txns.every((t) => ids.has(t.customerId)), true);
  assert.equal(db.batches.every((b) => ids.has(b.customerId) && b.remaining >= 0 && b.remaining <= b.points), true);
  assert.equal(new Set(db.txns.map((t) => t.id)).size, db.txns.length);
  assert.equal(db.customers.map((c) => normalizeMobile(c.mobile)).every((m) => /^03\d{9}$/.test(m)), true);
  const m = computeMetrics(db, seedNow);
  assert.equal(m.issued, m.redeemed + m.expired + m.outstanding);
});
