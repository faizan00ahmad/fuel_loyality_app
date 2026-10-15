import { sha256 } from './hash';
import { normalizeMobile } from './logic';
import type { Customer, DB } from '../types';

export const PASSWORD_MIN = 6;
export const LOGIN_MAX_TRIES = 5;
export const LOGIN_LOCK_MS = 60 * 1000;
/** Every demo customer uses this password (shown on the demo cards). */
export const DEMO_PASSWORD = 'Kaleem@123';

/** Salted with the customer's UUID so equal passwords never share a hash. */
export const hashPassword = (uuid: string, password: string) => sha256(`${uuid.toLowerCase()}:${password}`);

export function validatePassword(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Use at least one letter and one number.';
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.';
  return null;
}

const attempts = new Map<string, { tries: number; lockedUntil: number }>();

export type LoginResult =
  | { ok: true; customer: Customer }
  | { ok: false; reason: 'unknown' | 'wrong' | 'locked'; triesLeft?: number; waitMs?: number };

/**
 * Existing customers sign in with mobile number and password only, never an OTP.
 * Five wrong passwords lock that number for a minute. The message for an unknown number and a wrong
 * password is kept distinct on purpose here for the demo; a live system would use one generic message.
 */
export function checkLogin(db: DB, mobile: string, password: string, now: number): LoginResult {
  const m = normalizeMobile(mobile);
  const customer = db.customers.find((c) => normalizeMobile(c.mobile) === m);
  if (!customer) return { ok: false, reason: 'unknown' };
  const s = attempts.get(m) ?? { tries: 0, lockedUntil: 0 };
  if (now < s.lockedUntil) return { ok: false, reason: 'locked', waitMs: s.lockedUntil - now };
  if (customer.passHash && customer.passHash === hashPassword(customer.uuid, password)) {
    attempts.delete(m);
    return { ok: true, customer };
  }
  s.tries += 1;
  if (s.tries >= LOGIN_MAX_TRIES) {
    attempts.set(m, { tries: 0, lockedUntil: now + LOGIN_LOCK_MS });
    return { ok: false, reason: 'locked', waitMs: LOGIN_LOCK_MS };
  }
  attempts.set(m, s);
  return { ok: false, reason: 'wrong', triesLeft: LOGIN_MAX_TRIES - s.tries };
}

export const resetAuthForTests = () => attempts.clear();
