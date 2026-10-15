import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import {
  DAY,
  applyExpiry,
  buildCustomerCache,
  createRewardToken as ledgerCreateToken,
  earn as ledgerEarn,
  findCustomer,
  litresToPoints,
  normalizeMobile,
  redeemToken as ledgerRedeemToken,
  registerCustomer as ledgerRegister,
  staffRedeem as ledgerStaffRedeem,
  updateConfig as ledgerUpdateConfig,
  type RegisterInput,
} from './logic';
import { checkLogin, hashPassword, type LoginResult } from './auth';
import { buildSeed } from './seed';
import { processQueue } from './sync';
import type { Config, CustomerCache, DB, QueuedEarn, ServiceId, Session, SyncResult } from '../types';

/**
 * One central ledger (`db`) stands in for the cloud server. Everything else mirrors the SRS:
 *  - `cache`  : the customer app's local copy (QR + ledger) so the pass opens instantly, offline.
 *  - `queue`  : transactions the Attendant POS captured while offline, awaiting sync.
 * All state is persisted to on-device storage, so a restart keeps everything.
 */
export interface StoreState {
  ready: boolean;
  db: DB;
  online: boolean; // Attendant POS connectivity (demo toggle)
  queue: QueuedEarn[];
  lastSync: { at: number; results: SyncResult[] } | null;
  cache: Record<string, CustomerCache>;
  session: Session;
  /** Signed-in staff account id. Memory only: staff sign in again whenever the app restarts. */
  staff: string | null;
}

const K = {
  db: 'kps.db',
  online: 'kps.online',
  queue: 'kps.queue',
  lastSync: 'kps.lastSync',
  cache: 'kps.cache',
  session: 'kps.session',
};

let state: StoreState = {
  ready: false,
  db: buildSeed(Date.now()),
  online: true,
  queue: [],
  lastSync: null,
  cache: {},
  session: null,
  staff: null,
};
const listeners = new Set<() => void>();

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getState = () => state;
export const useStore = (): StoreState => useSyncExternalStore(subscribe, getState, getState);
export const peek = getState;

export const now = () => Date.now() + state.db.clockOffset;
const newUuid = () => Crypto.randomUUID();

async function persist(keys: (keyof typeof K)[]) {
  const s = state;
  const map: Record<keyof typeof K, unknown> = {
    db: s.db, online: s.online, queue: s.queue, lastSync: s.lastSync, cache: s.cache, session: s.session,
  };
  try {
    await AsyncStorage.multiSet(keys.map((k) => [K[k], JSON.stringify(map[k])] as [string, string]));
  } catch {
    // Storage failure must never crash a till; in-memory state stays authoritative for the session.
  }
}

function set(patch: Partial<StoreState>, keys: (keyof typeof K)[] = []) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (keys.length) void persist(keys);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Load everything from device storage. The cache and session load first so the QR is instant. */
export async function initStore() {
  const [session, cache, storedDb, online, queue, lastSync] = await Promise.all([
    readJson<Session>(K.session),
    readJson<Record<string, CustomerCache>>(K.cache),
    readJson<DB>(K.db),
    readJson<boolean>(K.online),
    readJson<QueuedEarn[]>(K.queue),
    readJson<StoreState['lastSync']>(K.lastSync),
  ]);
  // A ledger saved by an older build (before passwords existed) cannot be used, so start from fresh demo data.
  const db = storedDb?.v === 2 ? storedDb : null;
  const baseDb = db ?? buildSeed(Date.now());
  const fresh = applyExpiry(baseDb, Date.now() + baseDb.clockOffset);
  const stale = !db;
  set(
    {
      ready: true,
      db: fresh,
      online: stale ? true : online ?? true,
      queue: stale ? [] : queue ?? [],
      lastSync: stale ? null : lastSync,
      cache: stale ? {} : cache ?? {},
      session: stale ? null : session,
    },
    stale ? ['db', 'queue', 'lastSync', 'cache', 'session', 'online'] : [],
  );
  if (fresh !== baseDb) void persist(['db']);
  if (!stale && session?.role === 'customer') await refreshCache(session.uuid);
}

/** Central ledger transaction. Throws LedgerError untouched so screens can show the message. */
function commit<T extends { db: DB }>(result: T): T {
  set({ db: result.db }, ['db']);
  return result;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Customer-app sync: pull the latest ledger for this customer into the local cache. */
export async function refreshCache(uuid: string, simulateLatency = false) {
  if (simulateLatency) await sleep(450);
  const t = now();
  const db = applyExpiry(state.db, t);
  if (db !== state.db) set({ db }, ['db']);
  const c = buildCustomerCache(state.db, uuid, t);
  if (!c) return null;
  set({ cache: { ...state.cache, [uuid]: c } }, ['cache']);
  return c;
}

export const setSession = (session: Session) => set({ session }, ['session']);

/** Existing customers: mobile number and password. No OTP, so no SMS cost after sign-up. */
export async function loginCustomer(mobile: string, password: string): Promise<LoginResult> {
  const r = checkLogin(state.db, mobile, password, now());
  if (r.ok) {
    await refreshCache(r.customer.uuid);
    setSession({ role: 'customer', uuid: r.customer.uuid });
  }
  return r;
}

export const signInStaff = (id: string) => set({ staff: id });
export const signOutStaff = () => set({ staff: null });

/** Sign-up: called only after the one OTP has been verified. The password is hashed before it is stored. */
export async function register(input: Omit<RegisterInput, 'uuid' | 'passHash'> & { password: string }) {
  const { password, ...rest } = input;
  const uuid = newUuid();
  const r = ledgerRegister(state.db, { ...rest, uuid, passHash: hashPassword(uuid, password) }, now());
  commit(r);
  await refreshCache(r.customer.uuid);
  return r.customer;
}

export function findByMobile(mobile: string) {
  const d = normalizeMobile(mobile);
  return state.db.customers.find((c) => normalizeMobile(c.mobile) === d);
}

// ---------- Attendant POS ----------
export type EarnOutcome =
  | { status: 'done'; points: number; name: string; balance: number }
  | { status: 'queued'; points: number; queued: number };

export function posEarn(customerId: string, litres: number): EarnOutcome {
  const ts = now();
  if (!state.online) {
    const q: QueuedEarn = { id: newUuid(), customerId: customerId.trim().toLowerCase(), litres, ts };
    set({ queue: [...state.queue, q] }, ['queue']);
    return { status: 'queued', points: litresToPoints(litres), queued: state.queue.length };
  }
  const r = commit(ledgerEarn(state.db, customerId.trim().toLowerCase(), litres, ts));
  const view = buildCustomerCache(r.db, customerId.trim().toLowerCase(), ts)!;
  return { status: 'done', points: r.points, name: view.name, balance: view.balance };
}

export function syncQueue(): SyncResult[] {
  if (state.queue.length === 0) return [];
  const { db, results } = processQueue(state.db, state.queue);
  set({ db, queue: [], lastSync: { at: now(), results } }, ['db', 'queue', 'lastSync']);
  return results;
}

export function setOnline(online: boolean) {
  set({ online }, ['online']);
  if (online) syncQueue();
}

export const dismissSyncReport = () => set({ lastSync: null }, ['lastSync']);

// ---------- Customer: Path A ----------
export function createRewardQr(uuid: string, serviceId: ServiceId) {
  const r = commit(ledgerCreateToken(state.db, uuid, serviceId, newUuid(), now()));
  return r.token;
}

// ---------- Redemption Desk ----------
export function deskRedeemToken(token: string) {
  const r = commit(ledgerRedeemToken(state.db, token, now()));
  return { customer: r.customer, service: r.service, points: r.points };
}
export function deskRedeemService(customerId: string, serviceId: ServiceId) {
  const r = commit(ledgerStaffRedeem(state.db, customerId, serviceId, now()));
  return r.service;
}

export function customerSummary(uuid: string) {
  const c = findCustomer(state.db, uuid);
  if (!c) return null;
  return buildCustomerCache(applyExpiry(state.db, now()), uuid, now());
}

// ---------- Admin ----------
export function adminUpdateConfig(patch: Partial<Config>) {
  set({ db: ledgerUpdateConfig(state.db, patch) }, ['db']);
}

/** Demo helper: shift the app clock so expiry rules can be shown without waiting weeks. */
export async function advanceClock(days: number) {
  const moved = { ...state.db, clockOffset: state.db.clockOffset + days * DAY };
  const db = applyExpiry(moved, Date.now() + moved.clockOffset);
  set({ db }, ['db']);
  const s = state.session;
  if (s?.role === 'customer') await refreshCache(s.uuid);
}

export async function resetDemo() {
  const db = buildSeed(Date.now());
  set(
    { db, queue: [], lastSync: null, cache: {}, session: null, online: true },
    ['db', 'queue', 'lastSync', 'cache', 'session', 'online'],
  );
}
