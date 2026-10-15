import type {
  Batch,
  Config,
  Customer,
  CustomerCache,
  DB,
  RewardToken,
  Service,
  ServiceId,
  Txn,
} from '../types';

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;
const EXPIRY_WARNING_DAYS = 7;

export type ErrorCode =
  | 'UNKNOWN_CUSTOMER'
  | 'BAD_QR'
  | 'BAD_LITRES'
  | 'VELOCITY'
  | 'INSUFFICIENT'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_USED'
  | 'TOKEN_EXPIRED'
  | 'DUPLICATE'
  | 'BAD_INPUT'
  | 'UNKNOWN_SERVICE';

export class LedgerError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REWARD_PREFIX = 'RWD-';

export const isUuid = (s: string) => UUID_RE.test(s.trim());
export const isRewardToken = (s: string) => s.startsWith(REWARD_PREFIX) && isUuid(s.slice(REWARD_PREFIX.length));

export const DEFAULT_CONFIG: Config = {
  activityWindowDays: 45,
  hardExpiryDays: 365,
  velocityMinutes: 30,
  rewardQrMinutes: 5,
  catalog: [
    { id: 'tyre_air', name: 'Tyre Air Filling', points: 10, price: 50 },
    { id: 'puncture', name: 'Tyre Puncture Service', points: 150, price: 250 },
    { id: 'car_wash', name: 'Car Wash', points: 500, price: 1000 },
  ],
};

export const emptyDb = (): DB => ({
  v: 2,
  seq: 0,
  clockOffset: 0,
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as Config,
  customers: [],
  batches: [],
  txns: [],
  tokens: [],
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nextId = (db: DB, prefix: string) => `${prefix}${++db.seq}`;

/** 1 Litre = 1 Point. Fractions round DOWN to a whole integer (SRS 3.6). */
export function litresToPoints(litres: number): number {
  if (!Number.isFinite(litres) || litres <= 0) return 0;
  return Math.floor(litres);
}

export const findCustomer = (db: DB, uuid: string): Customer | undefined =>
  db.customers.find((c) => c.uuid === uuid.trim().toLowerCase());

export function findService(db: DB, id: ServiceId): Service {
  const s = db.config.catalog.find((x) => x.id === id);
  if (!s) throw new LedgerError('UNKNOWN_SERVICE', 'Unknown service');
  return s;
}

export function lastEarnAt(db: DB, customerId: string): number | null {
  let last: number | null = null;
  for (const t of db.txns) {
    if (t.customerId === customerId && t.type === 'earn' && (last === null || t.ts > last)) last = t.ts;
  }
  return last;
}

/** Rule A and Rule B combined: the earlier of the two deadlines wins. */
export function effectiveExpiry(
  batch: Batch,
  lastEarn: number,
  cfg: Config,
): { at: number; rule: 'A' | 'B' } {
  const ruleB = batch.issuedAt + cfg.hardExpiryDays * DAY;
  const ruleA = lastEarn + cfg.activityWindowDays * DAY;
  return ruleA < ruleB ? { at: ruleA, rule: 'A' } : { at: ruleB, rule: 'B' };
}

/** Apply expiry (the SRS "cron job"): wipes lapsed batches and writes ledger entries. */
export function applyExpiry(db: DB, now: number): DB {
  const lastByCustomer = new Map<string, number>();
  for (const t of db.txns) {
    if (t.type !== 'earn') continue;
    const cur = lastByCustomer.get(t.customerId);
    if (cur === undefined || t.ts > cur) lastByCustomer.set(t.customerId, t.ts);
  }
  const due: { b: Batch; at: number; rule: 'A' | 'B' }[] = [];
  for (const b of db.batches) {
    if (b.remaining <= 0) continue;
    const last = lastByCustomer.get(b.customerId) ?? b.issuedAt;
    const e = effectiveExpiry(b, last, db.config);
    if (e.at <= now) due.push({ b, at: e.at, rule: e.rule });
  }
  if (due.length === 0) return db;
  const next = clone(db);
  // One ledger entry per customer, rule and expiry moment, so a lapse reads as a single event.
  const grouped = new Map<string, { customerId: string; at: number; rule: 'A' | 'B'; points: number }>();
  for (const d of due) {
    const b = next.batches.find((x) => x.id === d.b.id)!;
    const key = `${b.customerId}|${d.rule}|${d.at}`;
    const g = grouped.get(key) ?? { customerId: b.customerId, at: d.at, rule: d.rule, points: 0 };
    g.points += b.remaining;
    grouped.set(key, g);
    b.remaining = 0;
  }
  for (const g of [...grouped.values()].sort((a, b) => a.at - b.at)) {
    next.txns.push({
      id: nextId(next, 't'),
      customerId: g.customerId,
      type: 'expire',
      points: g.points,
      ts: g.at,
      desc:
        g.rule === 'A'
          ? `Points expired (no fuel purchase in ${db.config.activityWindowDays} days)`
          : `Points expired (${db.config.hardExpiryDays}-day limit reached)`,
    });
  }
  return next;
}

export interface LedgerView {
  balance: number;
  batches: { id: string; remaining: number; issuedAt: number; expiresAt: number; rule: 'A' | 'B' }[];
  expiring: { points: number; days: number } | null;
}

/** Read-only view of what is currently spendable. Assumes applyExpiry(now) was run. */
export function getLedger(db: DB, customerId: string, now: number): LedgerView {
  const last = lastEarnAt(db, customerId);
  const batches = db.batches
    .filter((b) => b.customerId === customerId && b.remaining > 0)
    .map((b) => {
      const e = effectiveExpiry(b, last ?? b.issuedAt, db.config);
      return { id: b.id, remaining: b.remaining, issuedAt: b.issuedAt, expiresAt: e.at, rule: e.rule };
    })
    .filter((b) => b.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt || a.issuedAt - b.issuedAt);
  const balance = batches.reduce((s, b) => s + b.remaining, 0);
  const soon = batches.filter((b) => b.expiresAt - now <= EXPIRY_WARNING_DAYS * DAY);
  const expiring = soon.length
    ? {
        points: soon.reduce((s, b) => s + b.remaining, 0),
        days: Math.max(0, Math.ceil((Math.min(...soon.map((b) => b.expiresAt)) - now) / DAY)),
      }
    : null;
  return { balance, batches, expiring };
}

export function balanceOf(db: DB, customerId: string, now: number): number {
  return getLedger(db, customerId, now).balance;
}

/** FIFO by earliest expiry. Caller must have checked sufficient balance. */
function deduct(db: DB, customerId: string, points: number, now: number) {
  const view = getLedger(db, customerId, now);
  let left = points;
  for (const v of view.batches) {
    if (left <= 0) break;
    const b = db.batches.find((x) => x.id === v.id)!;
    const take = Math.min(b.remaining, left);
    b.remaining -= take;
    left -= take;
  }
}

export interface RegisterInput {
  uuid: string;
  name: string;
  mobile: string;
  vehicle?: string;
  passHash: string;
}

/** One canonical form (03XXXXXXXXX) for 0300-1234567, +92 300 1234567, 923001234567 and 00923001234567. */
export function normalizeMobile(m: string): string {
  const d = m.replace(/[^0-9]/g, '');
  if (d.startsWith('0092') && d.length === 14) return '0' + d.slice(4);
  if (d.startsWith('92') && d.length === 12) return '0' + d.slice(2);
  return d;
}

/** Pakistani mobile numbers: 03 followed by 9 digits. */
export const validateMobile = (m: string): boolean => /^03\d{9}$/.test(normalizeMobile(m));

export function registerCustomer(db: DB, input: RegisterInput, ts: number): { db: DB; customer: Customer } {
  const name = input.name.trim();
  const mobile = normalizeMobile(input.mobile);
  if (name.length < 2) throw new LedgerError('BAD_INPUT', 'Please enter your name.');
  if (!validateMobile(mobile)) throw new LedgerError('BAD_INPUT', 'Please enter a valid mobile number.');
  if (db.customers.some((c) => normalizeMobile(c.mobile) === mobile))
    throw new LedgerError('DUPLICATE', 'This mobile number is already registered.');
  const next = clone(db);
  const customer: Customer = {
    uuid: input.uuid.toLowerCase(),
    name,
    mobile,
    vehicle: input.vehicle?.trim() ? input.vehicle.trim().toUpperCase() : undefined,
    createdAt: ts,
    passHash: input.passHash,
  };
  next.customers.push(customer);
  return { db: next, customer };
}

/** Attendant POS earning event. Applies expiry first so lapsed points cannot be revived. */
export function earn(db: DB, customerId: string, litres: number, ts: number): { db: DB; points: number } {
  if (!isUuid(customerId)) throw new LedgerError('BAD_QR', 'Not a valid customer QR code.');
  const id = customerId.toLowerCase();
  if (!findCustomer(db, id)) throw new LedgerError('UNKNOWN_CUSTOMER', 'Customer not found.');
  const points = litresToPoints(litres);
  if (points < 1) throw new LedgerError('BAD_LITRES', 'Enter at least 1 litre.');
  const windowMs = db.config.velocityMinutes * MIN;
  const recent = db.txns
    .filter((t) => t.customerId === id && t.type === 'earn' && Math.abs(ts - t.ts) < windowMs)
    .sort((a, b) => b.ts - a.ts)[0];
  if (recent) {
    const waitMin = Math.max(1, Math.ceil((recent.ts + windowMs - ts) / MIN));
    throw new LedgerError(
      'VELOCITY',
      `Blocked: this QR already earned points in the last ${db.config.velocityMinutes} minutes. Try again in ${waitMin} min.`,
    );
  }
  const next = clone(applyExpiry(db, ts));
  const litresRounded = Math.round(litres * 100) / 100;
  next.batches.push({ id: nextId(next, 'b'), customerId: id, points, remaining: points, issuedAt: ts });
  next.txns.push({
    id: nextId(next, 't'),
    customerId: id,
    type: 'earn',
    points,
    ts,
    litres: litresRounded,
    desc: `Fuel purchase, ${litresRounded} L`,
  });
  return { db: next, points };
}

/** Path A, step 1: customer selects an unlocked service and gets a single-use 5-minute Reward QR. */
export function createRewardToken(
  db: DB,
  customerId: string,
  serviceId: ServiceId,
  tokenUuid: string,
  ts: number,
): { db: DB; token: RewardToken } {
  const svc = findService(db, serviceId);
  const next = clone(applyExpiry(db, ts));
  if (balanceOf(next, customerId, ts) < svc.points)
    throw new LedgerError('INSUFFICIENT', 'Not enough points for this service yet.');
  const token: RewardToken = {
    token: REWARD_PREFIX + tokenUuid.toLowerCase(),
    customerId,
    serviceId,
    points: svc.points, // locked in: the customer is shown this amount, so a later price change must not alter it
    createdAt: ts,
    expiresAt: ts + next.config.rewardQrMinutes * MIN,
    used: false,
  };
  next.tokens.push(token);
  return { db: next, token };
}

/** Path A, step 2: Redemption Desk scans the Reward QR. */
export function redeemToken(
  db: DB,
  tokenStr: string,
  ts: number,
): { db: DB; customer: Customer; service: Service; points: number } {
  const found = db.tokens.find((t) => t.token === tokenStr.trim());
  if (!found) throw new LedgerError('TOKEN_NOT_FOUND', 'Reward code not recognised.');
  if (found.used) throw new LedgerError('TOKEN_USED', 'This reward code has already been used.');
  if (ts > found.expiresAt) throw new LedgerError('TOKEN_EXPIRED', 'This reward code has expired (5-minute limit).');
  const svc = findService(db, found.serviceId);
  const customer = findCustomer(db, found.customerId);
  if (!customer) throw new LedgerError('UNKNOWN_CUSTOMER', 'Customer not found.');
  const next = clone(applyExpiry(db, ts));
  const points = found.points ?? svc.points; // price shown to the customer when the QR was made
  if (balanceOf(next, found.customerId, ts) < points)
    throw new LedgerError('INSUFFICIENT', 'Customer no longer has enough points.');
  deduct(next, found.customerId, points, ts);
  const t = next.tokens.find((x) => x.token === found.token)!;
  t.used = true;
  t.usedAt = ts;
  next.txns.push({
    id: nextId(next, 't'),
    customerId: found.customerId,
    type: 'redeem',
    points,
    ts,
    serviceId: svc.id,
    desc: `Redeemed: ${svc.name}`,
  });
  return { db: next, customer, service: svc, points };
}

/** Path B: staff scans the primary QR, picks a service, funds are validated, points deducted. */
export function staffRedeem(
  db: DB,
  customerId: string,
  serviceId: ServiceId,
  ts: number,
): { db: DB; service: Service } {
  if (!isUuid(customerId)) throw new LedgerError('BAD_QR', 'Not a valid customer QR code.');
  const id = customerId.toLowerCase();
  if (!findCustomer(db, id)) throw new LedgerError('UNKNOWN_CUSTOMER', 'Customer not found.');
  const svc = findService(db, serviceId);
  const next = clone(applyExpiry(db, ts));
  if (balanceOf(next, id, ts) < svc.points)
    throw new LedgerError('INSUFFICIENT', 'Insufficient points for this service.');
  deduct(next, id, svc.points, ts);
  next.txns.push({
    id: nextId(next, 't'),
    customerId: id,
    type: 'redeem',
    points: svc.points,
    ts,
    serviceId: svc.id,
    desc: `Redeemed: ${svc.name}`,
  });
  return { db: next, service: svc };
}

export function buildCustomerCache(db: DB, customerId: string, now: number): CustomerCache | null {
  const c = findCustomer(db, customerId);
  if (!c) return null;
  const ledger = getLedger(db, customerId, now);
  return {
    uuid: c.uuid,
    name: c.name,
    mobile: c.mobile,
    vehicle: c.vehicle,
    balance: ledger.balance,
    ledger: ledger.batches,
    expiring: ledger.expiring,
    txns: db.txns.filter((t) => t.customerId === customerId).sort((a, b) => b.ts - a.ts),
    catalog: db.config.catalog,
    activityWindowDays: db.config.activityWindowDays,
    syncedAt: now,
  };
}

export interface Metrics {
  totalCustomers: number;
  activeUsers: number;
  issued: number;
  redeemed: number;
  expired: number;
  outstanding: number; // liability in points == rupees
  expiringIn30: number;
  redemptionsByService: { service: Service; count: number }[];
}

export function computeMetrics(db: DB, now: number): Metrics {
  const windowMs = db.config.activityWindowDays * DAY;
  const lastBy = new Map<string, number>();
  for (const t of db.txns) {
    if (t.type !== 'earn') continue;
    const cur = lastBy.get(t.customerId);
    if (cur === undefined || t.ts > cur) lastBy.set(t.customerId, t.ts);
  }
  const activeUsers = db.customers.filter((c) => {
    const l = lastBy.get(c.uuid);
    return l !== undefined && now - l <= windowMs;
  }).length;
  let outstanding = 0;
  let expiringIn30 = 0;
  for (const c of db.customers) {
    const view = getLedger(db, c.uuid, now);
    outstanding += view.balance;
    expiringIn30 += view.batches.filter((b) => b.expiresAt - now <= 30 * DAY).reduce((s, b) => s + b.remaining, 0);
  }
  const sum = (type: Txn['type']) => db.txns.filter((t) => t.type === type).reduce((s, t) => s + t.points, 0);
  return {
    totalCustomers: db.customers.length,
    activeUsers,
    issued: sum('earn'),
    redeemed: sum('redeem'),
    expired: sum('expire'),
    outstanding,
    expiringIn30,
    redemptionsByService: db.config.catalog.map((service) => ({
      service,
      count: db.txns.filter((t) => t.type === 'redeem' && t.serviceId === service.id).length,
    })),
  };
}

export function updateConfig(db: DB, patch: Partial<Config>): DB {
  const next = clone(db);
  if (patch.activityWindowDays !== undefined) {
    if (patch.activityWindowDays < 45 || patch.activityWindowDays > 60)
      throw new LedgerError('BAD_INPUT', 'Activity window must be between 45 and 60 days.');
    next.config.activityWindowDays = patch.activityWindowDays;
  }
  if (patch.hardExpiryDays !== undefined) {
    if (patch.hardExpiryDays !== 180 && patch.hardExpiryDays !== 365)
      throw new LedgerError('BAD_INPUT', 'Hard expiry must be 180 or 365 days.');
    next.config.hardExpiryDays = patch.hardExpiryDays;
  }
  if (patch.catalog) {
    for (const s of patch.catalog) {
      if (!Number.isInteger(s.points) || s.points < 1 || !Number.isFinite(s.price) || s.price < 0)
        throw new LedgerError('BAD_INPUT', 'Catalogue values must be positive numbers.');
    }
    next.config.catalog = clone(patch.catalog);
  }
  return next;
}
