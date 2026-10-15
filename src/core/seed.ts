import { DEMO_PASSWORD, hashPassword } from './auth';
import { DAY, applyExpiry, earn, emptyDb, registerCustomer, staffRedeem } from './logic';
import type { DB, ServiceId } from '../types';

export const DEMO_ALI = '5b0c0f3a-8a52-4b47-9a3e-1d2f6c7e9a01';
export const DEMO_SARA = '9c1d7e44-3f6b-4a21-8b5d-2e4a6f8c0b02';
export const DEMO_USMAN = 'a3e5c1d2-4b6f-4c8a-9d0e-3f5a7b9c1d03';
export const DEMO_ZAINAB = 'b4f6d2e3-5c7a-4d9b-8e1f-4a6b8c0d2e04';
export const DEMO_FATIMA = 'c5a7e3f4-6d8b-4eac-9f2a-5b7c9d1e3f05';
export const DEMO_AYESHA = 'd6b8f4a5-7e9c-4fbd-8a3b-6c8d0e2f4a06';
export const DEMO_HAMZA = 'e7c9a5b6-8fad-4acd-9b4c-7d9e1f3a5b07';
export const DEMO_BILAL = 'f8dab6c7-9abe-4bde-8c5d-8e0f2a4b6c08';
export const DEMO_IMRAN = '09ebc7d8-abcf-4cef-9d6e-9f1a3b5c7d09';

interface Plan {
  uuid: string;
  name: string;
  mobile: string;
  vehicle?: string;
  joinedDaysAgo: number;
  earns: [daysAgo: number, litres: number][];
  redeems?: [daysAgo: number, service: ServiceId][];
}

const every = (from: number, to: number, step: number, litres: number[]): [number, number][] => {
  const out: [number, number][] = [];
  let i = 0;
  for (let d = from; d >= to; d -= step) out.push([d, litres[i++ % litres.length]]);
  return out;
};

const PLANS: Plan[] = [
  // Regular commuter. Fuels about monthly, so Rule A never lapses, but his oldest batch nears the 365-day limit.
  {
    uuid: DEMO_ALI, name: 'Ali Raza', mobile: '03001234567', vehicle: 'LEA-2291', joinedDaysAgo: 362,
    earns: [[360, 50], [330, 40], [300, 60], [270, 45], [240, 55], [210, 35], [180, 50], [150, 40], [120, 60], [90, 30], [60, 45], [30, 40], [8, 25]],
    redeems: [[20, 'tyre_air']],
  },
  // Lapsed commuter: last fuel 40 days ago, so Rule A (45 days) is about to wipe her points.
  { uuid: DEMO_SARA, name: 'Sara Khan', mobile: '03217654321', vehicle: 'ICT-4410', joinedDaysAgo: 60, earns: [[40, 60.4]] },
  // Heavy user: weekly fills for six months, three redemptions already.
  {
    uuid: DEMO_USMAN, name: 'Usman Tariq', mobile: '03335550101', vehicle: 'LEB-7788', joinedDaysAgo: 185,
    earns: every(175, 3, 7, [45, 52, 38, 60, 41, 55, 47]),
    redeems: [[90, 'car_wash'], [40, 'puncture'], [12, 'tyre_air'], [2, 'tyre_air']],
  },
  // Exactly 480 points: shows the locked Car Wash ("Need 20 more pts").
  {
    uuid: DEMO_ZAINAB, name: 'Zainab Iqbal', mobile: '03458899001', vehicle: 'KHI-3302', joinedDaysAgo: 120,
    earns: [[112, 60], [98, 55], [84, 50], [70, 58], [56, 52], [42, 48], [28, 62], [14, 45], [3, 50]],
  },
  // Stopped fuelling 150 days ago: Rule A already wiped her points and logged it.
  {
    uuid: DEMO_FATIMA, name: 'Fatima Noor', mobile: '03124455667', vehicle: 'ISB-1203', joinedDaysAgo: 200,
    earns: [[190, 45], [170, 50], [150, 40]], redeems: [[160, 'tyre_air']],
  },
  // New member, one fuel-up yesterday.
  { uuid: DEMO_AYESHA, name: 'Ayesha Malik', mobile: '03007788990', joinedDaysAgo: 2, earns: [[1, 35.7]] },
  // Taxi driver: fills every 5 days all year, so the volume (and the Rule B expiries) are high.
  {
    uuid: DEMO_HAMZA, name: 'Hamza Sheikh', mobile: '03221112223', vehicle: 'LHR-5501', joinedDaysAgo: 361,
    earns: every(358, 2, 5, [40, 44, 36, 48, 42]),
    redeems: [[300, 'car_wash'], [210, 'car_wash'], [120, 'car_wash'], [250, 'puncture'], [160, 'puncture'], [70, 'puncture'], [30, 'tyre_air'], [9, 'tyre_air']],
  },
  { uuid: DEMO_BILAL, name: 'Bilal Ahmed', mobile: '03019090909', vehicle: 'MUX-8801', joinedDaysAgo: 85, earns: [[80, 40], [60, 35], [41, 60], [22, 55], [5, 40]], redeems: [[50, 'tyre_air'], [15, 'tyre_air']] },
  // Fuelled 43 days ago, so Rule A wipes his points in 2 days.
  { uuid: DEMO_IMRAN, name: 'Imran Butt', mobile: '03346677889', vehicle: 'RWP-9921', joinedDaysAgo: 110, earns: [[95, 80], [43, 120]] },
];

/**
 * Demo data is built through the same ledger functions the app uses, replaying every event in
 * date order, so seeded balances obey exactly the same rules as live ones.
 */
export function buildSeed(now: number): DB {
  let db = emptyDb();
  type Ev = { t: number; run: (d: DB) => DB };
  const events: Ev[] = [];
  for (const p of PLANS) {
    events.push({
      t: now - p.joinedDaysAgo * DAY,
      run: (d) =>
        registerCustomer(
          d,
          { uuid: p.uuid, name: p.name, mobile: p.mobile, vehicle: p.vehicle, passHash: hashPassword(p.uuid, DEMO_PASSWORD) },
          now - p.joinedDaysAgo * DAY,
        ).db,
    });
    for (const [ago, litres] of p.earns) events.push({ t: now - ago * DAY, run: (d) => earn(d, p.uuid, litres, now - ago * DAY).db });
    for (const [ago, svc] of p.redeems ?? []) events.push({ t: now - ago * DAY + 1, run: (d) => staffRedeem(d, p.uuid, svc, now - ago * DAY + 1).db });
  }
  events.sort((a, b) => a.t - b.t);
  for (const e of events) db = e.run(db);
  return applyExpiry(db, now);
}
