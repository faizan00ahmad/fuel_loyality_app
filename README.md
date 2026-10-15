# Kaleem Petrol Reward System (prototype)

React Native (Expo) prototype built from `srs document.pdf`. One app with four sign-ins:
Customer, New member, Staff (Attendant POS and Redemption Desk), and Admin.

There is no server. A single on-device ledger stands in for the cloud, and everything is saved to
local storage, so data survives restarts.

## Run on your Android phone
1. Install **Expo Go** from the Play Store.
2. In this folder run `npm install --legacy-peer-deps`, then `npx expo start`.
3. Scan the QR code shown in the terminal with Expo Go.

## Demo accounts (sign-in screen lists them)
| Customer | Mobile | Story |
|---|---|---|
| Usman Tariq | 0333-5550101 | Heavy user, 539 pts, can redeem anything |
| Ali Raza | 0300-1234567 | 565 pts, 40 pts expiring in 5 days (365-day limit) |
| Zainab Iqbal | 0345-8899001 | 480 pts, 20 short of a Car Wash (locked state) |
| Sara Khan | 0321-7654321 | 60 pts, lapses in 5 days (45 days without fuelling) |
| Fatima Noor | 0312-4455667 | Lapsed, 0 pts, expiry already in history |
| Ayesha Malik | 0300-7788990 | New member, 35 pts |

Staff and Admin (PIN shown on the card): **Bilal** (Attendant POS) `1111`, **Nadia** (Redemption Desk) `2222`,
**Manager** (Admin) `9999`. Three wrong PINs lock the account for 30 seconds. Hide all demo cards with
`SHOW_DEMO_ACCOUNTS` in `src/core/demo.ts`.

## Sign-in, OTP and SMS cost
- **New members** register with name, mobile, optional vehicle and a password, then verify **one OTP**. The
  account is created only after the OTP passes.
- **Existing customers sign in with mobile number and password only. There is never an OTP at sign-in**, so
  the only SMS a customer ever costs is the one at sign-up.
- Every demo customer's password is `Kaleem@123` (filled in when you tap a demo card).
- Passwords need 6+ characters with a letter and a number, are stored only as a salted SHA-256 hash in this
  prototype (a real server must use bcrypt or argon2), and 5 wrong tries lock that number for 1 minute.
- The sign-up code is random, 6 digits, works **once**, expires in 2 minutes, locks after 3 wrong tries and can
  be resent only every 30 seconds. The prototype has no SMS gateway, so a "Demo SMS" card shows the code on
  screen (`SHOW_DEMO_SMS`). A real gateway plugs in through `OtpSender` in `src/core/otp.ts`.
- Not built (not in the SRS): "forgot password". A real launch needs a reset flow, which would use one OTP.

Scanning: the staff screens use the real camera. With a single phone, open "Demo scan" on a scanner
screen to simulate scanning a customer or Reward QR. Admin has demo tools to move the clock forward
(to watch Rule A and Rule B expiry) and to reset the data.

## Checks
- `npm run typecheck` : TypeScript
- Full QA report with every test case, the defect log and what is still untested: [docs/QA-Report.md](docs/QA-Report.md)
- `npm test` : 128 tests (87 of them traceable QA cases in `tests/qa.test.ts`; the older 41 are regression tests) covering the SRS rules (rounding, 30-minute velocity, Rule A, Rule B,
  Reward QR 5-minute single use, Path A and Path B, offline queue sync, ledger reconciliation),
  the single-use OTP, the staff PIN lockout, and what each demo customer is meant to show

## Where the SRS lives in the code
| SRS | File |
|---|---|
| Points, rounding, Rule A and B, velocity, redemption paths | `src/core/logic.ts` |
| Offline queue and sync | `src/core/sync.ts`, `src/core/store.ts` |
| Customer Digital Pass, ledger, catalogue, history | `src/app/customer.tsx` |
| Attendant POS (scan, litres keypad) | `src/app/staff/pos.tsx` |
| Redemption Desk (Path A and B) | `src/app/staff/desk.tsx` |
| Admin metrics and configuration | `src/app/admin.tsx` |

`react-native-web` is installed only so the screens can be previewed in a browser during development.
The SRS requires a native customer app, so the deliverable is the Android/iOS build.
