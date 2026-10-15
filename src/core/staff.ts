export type StaffRole = 'pos' | 'desk' | 'admin';

export interface StaffAccount {
  id: string;
  name: string;
  title: string;
  role: StaffRole;
  pin: string;
}

/** Demo staff accounts. In production these come from the Admin dashboard and the PIN is stored hashed. */
export const STAFF_ACCOUNTS: StaffAccount[] = [
  { id: 'bilal', name: 'Bilal', title: 'Attendant POS', role: 'pos', pin: '1111' },
  { id: 'nadia', name: 'Nadia', title: 'Redemption Desk', role: 'desk', pin: '2222' },
  { id: 'manager', name: 'Manager', title: 'Admin Dashboard', role: 'admin', pin: '9999' },
];

export const ROUTE_FOR_ROLE: Record<StaffRole, '/staff/pos' | '/staff/desk' | '/admin'> = {
  pos: '/staff/pos',
  desk: '/staff/desk',
  admin: '/admin',
};

export const PIN_MAX_TRIES = 3;
export const PIN_LOCK_MS = 30 * 1000;

const state = new Map<string, { tries: number; lockedUntil: number }>();

export type PinResult = { ok: true } | { ok: false; reason: 'wrong' | 'locked'; triesLeft?: number; waitMs?: number };

export function verifyPin(accountId: string, pin: string, now: number): PinResult {
  const acct = STAFF_ACCOUNTS.find((a) => a.id === accountId);
  const s = state.get(accountId) ?? { tries: 0, lockedUntil: 0 };
  if (now < s.lockedUntil) return { ok: false, reason: 'locked', waitMs: s.lockedUntil - now };
  if (acct && acct.pin === pin) {
    state.delete(accountId);
    return { ok: true };
  }
  s.tries += 1;
  if (s.tries >= PIN_MAX_TRIES) {
    state.set(accountId, { tries: 0, lockedUntil: now + PIN_LOCK_MS });
    return { ok: false, reason: 'locked', waitMs: PIN_LOCK_MS };
  }
  state.set(accountId, s);
  return { ok: false, reason: 'wrong', triesLeft: PIN_MAX_TRIES - s.tries };
}

export function resetPinForTests() {
  state.clear();
}
