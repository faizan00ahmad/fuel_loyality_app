import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PASSWORD, LOGIN_LOCK_MS, LOGIN_MAX_TRIES, checkLogin, hashPassword, resetAuthForTests, validatePassword,
} from '../src/core/auth';
import { sha256 } from '../src/core/hash';
import { registerCustomer, emptyDb } from '../src/core/logic';
import { DEMO_ALI, buildSeed } from '../src/core/seed';
import { DEMO_CUSTOMERS } from '../src/core/demo';

const NOW = Date.UTC(2026, 9, 12);
beforeEach(() => resetAuthForTests());

test('sha256 matches the published test vectors', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('passwords are salted per customer and never stored in plain text', () => {
  const a = hashPassword('11111111-1111-4111-8111-111111111111', 'Secret1');
  const b = hashPassword('22222222-2222-4222-8222-222222222222', 'Secret1');
  assert.notEqual(a, b);
  assert.equal(a.includes('Secret1'), false);
  const db = buildSeed(NOW);
  assert.ok(db.customers.every((c) => c.passHash.length === 64 && !c.passHash.includes(DEMO_PASSWORD)));
});

test('password rules: 6+ characters, a letter and a number, and the confirmation must match', () => {
  assert.match(validatePassword('ab1') ?? '', /at least 6/);
  assert.match(validatePassword('abcdefgh') ?? '', /letter and one number/);
  assert.match(validatePassword('12345678') ?? '', /letter and one number/);
  assert.match(validatePassword('Secret1', 'Secret2') ?? '', /do not match/);
  assert.equal(validatePassword('Secret1', 'Secret1'), null);
});

test('existing customers sign in with mobile and password only (every demo card works, any phone format)', () => {
  const db = buildSeed(NOW);
  for (const d of DEMO_CUSTOMERS) {
    const r = checkLogin(db, d.mobile, DEMO_PASSWORD, NOW);
    assert.equal(r.ok, true, d.name);
  }
  assert.equal(checkLogin(db, '0300-1234567', DEMO_PASSWORD, NOW).ok, true);
  const ok = checkLogin(db, '03001234567', DEMO_PASSWORD, NOW);
  assert.equal(ok.ok && ok.customer.uuid, DEMO_ALI);
});

test('wrong password, unknown number, and lockout after 5 tries', () => {
  const db = buildSeed(NOW);
  assert.deepEqual(checkLogin(db, '03009999999', DEMO_PASSWORD, NOW), { ok: false, reason: 'unknown' });
  assert.deepEqual(checkLogin(db, '03001234567', 'nope1234', NOW), { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - 1 });
  for (let i = 2; i < LOGIN_MAX_TRIES; i++) checkLogin(db, '03001234567', 'nope1234', NOW + i);
  assert.deepEqual(checkLogin(db, '03001234567', 'nope1234', NOW + 9), { ok: false, reason: 'locked', waitMs: LOGIN_LOCK_MS });
  assert.equal(checkLogin(db, '03001234567', DEMO_PASSWORD, NOW + 10).ok, false); // locked even with the right password
  assert.equal(checkLogin(db, '03001234567', DEMO_PASSWORD, NOW + 9 + LOGIN_LOCK_MS + 1).ok, true);
});

test('a correct password clears earlier wrong attempts', () => {
  const db = buildSeed(NOW);
  checkLogin(db, '03001234567', 'bad11111', NOW);
  checkLogin(db, '03001234567', 'bad11111', NOW + 1);
  assert.equal(checkLogin(db, '03001234567', DEMO_PASSWORD, NOW + 2).ok, true);
  assert.deepEqual(checkLogin(db, '03001234567', 'bad11111', NOW + 3), { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - 1 });
});

test('a new member signs in right after sign-up with the password they chose', () => {
  const uuid = '77777777-7777-4777-8777-777777777777';
  const { db } = registerCustomer(emptyDb(), { uuid, name: 'New Person', mobile: '03451112233', passHash: hashPassword(uuid, 'MyPass99') }, NOW);
  assert.equal(checkLogin(db, '0345-1112233', 'MyPass99', NOW).ok, true);
  assert.equal(checkLogin(db, '0345-1112233', 'mypass99', NOW).ok, false); // case sensitive
});
