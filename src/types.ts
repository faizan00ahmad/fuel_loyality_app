export type ServiceId = 'tyre_air' | 'puncture' | 'car_wash';

export interface Service {
  id: ServiceId;
  name: string;
  points: number;
  price: number; // standard price in Rupees
}

export interface Config {
  activityWindowDays: number; // Rule A: 45-60
  hardExpiryDays: number; // Rule B: 180 or 365
  velocityMinutes: number; // max 1 earn per QR per window
  rewardQrMinutes: number; // single-use Reward QR lifetime
  catalog: Service[];
}

export interface Customer {
  uuid: string;
  name: string;
  mobile: string;
  vehicle?: string;
  createdAt: number;
  /** SHA-256 of "uuid:password". Never the password itself. */
  passHash: string;
}

/** Points are stored as individual transactional batches (SRS 3.5). */
export interface Batch {
  id: string;
  customerId: string;
  points: number; // originally issued
  remaining: number;
  issuedAt: number;
}

export type TxnType = 'earn' | 'redeem' | 'expire';

export interface Txn {
  id: string;
  customerId: string;
  type: TxnType;
  points: number; // always positive; sign comes from type
  ts: number;
  desc: string;
  litres?: number;
  serviceId?: ServiceId;
}

export interface RewardToken {
  token: string;
  customerId: string;
  serviceId: ServiceId;
  /** Points the customer was shown when the code was made. */
  points: number;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
}

export interface DB {
  v: 2;
  seq: number;
  clockOffset: number; // demo clock shift in ms
  config: Config;
  customers: Customer[];
  batches: Batch[];
  txns: Txn[];
  tokens: RewardToken[];
}

export interface QueuedEarn {
  id: string;
  customerId: string;
  litres: number;
  ts: number; // when the attendant captured it
}

export interface SyncResult {
  id: string;
  customerId: string;
  customerName?: string;
  litres: number;
  ok: boolean;
  points?: number;
  reason?: string;
}

export interface CustomerCache {
  uuid: string;
  name: string;
  mobile: string;
  vehicle?: string;
  balance: number;
  ledger: { id: string; remaining: number; issuedAt: number; expiresAt: number; rule: 'A' | 'B' }[];
  expiring: { points: number; days: number } | null;
  txns: Txn[];
  catalog: Service[];
  activityWindowDays: number;
  syncedAt: number;
}

export type Session = { role: 'customer'; uuid: string } | null;
