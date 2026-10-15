/**
 * One-time passcodes for account provisioning (SRS 3.1).
 *  - 6 digits, random, valid for 2 minutes
 *  - single use: a correct code is burned immediately
 *  - 3 wrong tries lock the code, a new one needs a resend
 *  - 30 second resend cooldown (also caps SMS spend per number)
 * Pure functions with an injected clock so the rules are unit tested.
 */
import { normalizeMobile } from './logic';

export const OTP_TTL_MS = 2 * 60 * 1000;
export const OTP_MAX_TRIES = 3;
export const OTP_RESEND_MS = 30 * 1000;

interface Entry {
  code: string;
  expiresAt: number;
  sentAt: number;
  tries: number;
}

const entries = new Map<string, Entry>();
const key = (mobile: string) => normalizeMobile(mobile);

export type IssueResult = { ok: true; code: string; expiresAt: number } | { ok: false; waitMs: number };
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'none' | 'expired' | 'wrong' | 'locked'; triesLeft?: number };

export function issueOtp(mobile: string, now: number, rand: () => number = Math.random): IssueResult {
  const k = key(mobile);
  const prev = entries.get(k);
  if (prev && now - prev.sentAt < OTP_RESEND_MS) return { ok: false, waitMs: OTP_RESEND_MS - (now - prev.sentAt) };
  const code = String(100000 + Math.floor(rand() * 900000));
  const e: Entry = { code, expiresAt: now + OTP_TTL_MS, sentAt: now, tries: 0 };
  entries.set(k, e);
  return { ok: true, code, expiresAt: e.expiresAt };
}

export function verifyOtp(mobile: string, code: string, now: number): VerifyResult {
  const k = key(mobile);
  const e = entries.get(k);
  if (!e) return { ok: false, reason: 'none' };
  if (now > e.expiresAt) {
    entries.delete(k);
    return { ok: false, reason: 'expired' };
  }
  if (e.tries >= OTP_MAX_TRIES) return { ok: false, reason: 'locked' };
  if (code.trim() !== e.code) {
    e.tries += 1;
    return e.tries >= OTP_MAX_TRIES
      ? { ok: false, reason: 'locked' }
      : { ok: false, reason: 'wrong', triesLeft: OTP_MAX_TRIES - e.tries };
  }
  entries.delete(k); // single use
  return { ok: true };
}

export function resendWaitMs(mobile: string, now: number): number {
  const e = entries.get(key(mobile));
  return e ? Math.max(0, OTP_RESEND_MS - (now - e.sentAt)) : 0;
}

export function otpMessage(reason: Extract<VerifyResult, { ok: false }>): string {
  switch (reason.reason) {
    case 'none': return 'Request a new code first.';
    case 'expired': return 'That code has expired. Request a new one.';
    case 'locked': return 'Too many wrong tries. Request a new code.';
    default: return `Wrong code. ${reason.triesLeft} ${reason.triesLeft === 1 ? 'try' : 'tries'} left.`;
  }
}

/** Where the SMS really goes. The prototype has no gateway, so the screen shows the message instead. */
export interface OtpSender {
  send(mobile: string, code: string): Promise<void>;
}
export const previewSender: OtpSender = { send: async () => undefined };

export function resetOtpForTests() {
  entries.clear();
}
