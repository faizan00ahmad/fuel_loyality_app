# Kaleem Petrol Reward System: QA Report

Build: prototype (React Native / Expo SDK 57), tested against `srs document.pdf` (6 pages).
Tester: Claude. Date of test run: 2026-10-12.

## 1. Summary

| Check | Result |
|---|---|
| Automated tests (all files) | **128 of 128 pass**, 0 fail |
| Formal QA suite (traceable IDs, section 3) | **87 of 87 pass** |
| Browser end-to-end checks (section 4) | **all 21 groups pass** after fixes (see 4.2) |
| TypeScript strict type check | 0 errors |
| Android bundle build | succeeds |
| Expo project health (expo-doctor) | 21 of 21 checks pass |
| Defects found | 6 (1 critical on Android, 1 high, 2 medium, 2 low), **all fixed and re-tested** |
| Not yet tested | real-phone camera scanning, iOS, real SMS and server (see section 7) |

**Verdict:** the functional behaviour in the SRS is verified by automated tests and by running the app in a browser. The app is ready for a client demo on an Android phone via Expo Go. It has **not** been run on a physical phone by me, so the items in section 7 must be checked there before sign-off.

## 2. Scope and approach

- **Static checks:** strict TypeScript, bundle build, dependency health.
- **Unit and rule tests:** the ledger, expiry, sign-in, OTP and sync rules are plain code and are tested directly, with every boundary tested on both sides (for example 29:59 vs 30:00, 4:59 vs 5:00, 44 vs 45 days).
- **Property test:** 300 random runs of 60 operations each (earn, redeem, Reward QR, time jumps) check that no balance goes negative, no ledger entry is empty, ids are unique, and issued = redeemed + expired + outstanding after every step.
- **End-to-end:** the real screens were driven in a browser (phone-sized) through every role, with the browser console watched for errors.
- **Exploratory and layout:** all screens checked at 320 px width (smallest phones) for overflow.

## 3. Automated test cases (traceable to the SRS)

Every case below is in `tests/qa.test.ts`. Run with `npm test`.

### REG: Mobile number, name, optional vehicle; mobile validity and uniqueness; password rules
SRS: 3.1 Account Provisioning

| ID | Test case | Result |
|---|---|---|
| REG-01 | registration stores UUID, name and mobile; vehicle is optional | PASS |
| REG-02 | vehicle number is trimmed and upper-cased | PASS |
| REG-03 | names shorter than 2 characters are rejected | PASS |
| REG-04 | invalid mobile numbers are rejected | PASS |
| REG-05 | every common way of writing the same number normalises identically | PASS |
| REG-06 | a number cannot be registered twice, whatever its format | PASS |
| REG-07 | password rules (6+ chars, letter and number, confirmation matches) | PASS |
| REG-08 | only a salted hash is stored, never the password | PASS |

### AUTH: Existing customers sign in without OTP (mobile and password)
SRS: 3.1, 1.3.4

| ID | Test case | Result |
|---|---|---|
| AUTH-01 | sign-in works with mobile and password in any phone format, no OTP involved | PASS |
| AUTH-02 | wrong password counts tries down | PASS |
| AUTH-03 | 5 wrong passwords lock the number for 60 seconds, then it unlocks (both sides of the boundary) | PASS |
| AUTH-04 | unknown numbers are reported as unknown | PASS |
| AUTH-05 | passwords are case sensitive and a blank password never matches | PASS |
| AUTH-06 | one customer being locked does not lock another | PASS |
| AUTH-07 | a correct sign-in clears earlier failed attempts | PASS |

### OTP: One-time code at sign-up: single use, expiry, attempts, resend limit
SRS: 3.1 Account Provisioning (OTP)

| ID | Test case | Result |
|---|---|---|
| OTP-01 | code is always 6 digits (lowest and highest random values) | PASS |
| OTP-02 | single use, a correct code cannot be replayed | PASS |
| OTP-03 | valid until exactly 2 minutes, expired one millisecond later | PASS |
| OTP-04 | three wrong tries lock the code, even for the right code afterwards | PASS |
| OTP-05 | resend is blocked for 30 seconds, allowed at 30 seconds, and kills the previous code | PASS |
| OTP-06 | a code for one number never verifies another number, and no code means no access | PASS |

### PIN: Staff and admin sign-in
SRS: 3.4 Interfaces (staff and admin access)

| ID | Test case | Result |
|---|---|---|
| PIN-01 | each demo staff account accepts only its own PIN | PASS |
| PIN-02 | 3 wrong PINs lock the account for 30 seconds (both sides of the boundary) | PASS |
| PIN-03 | unknown accounts and malformed PINs are rejected | PASS |

### QR: QR holds only a UUID or token; POS never accepts a typed mobile number
SRS: 3.7 Privacy, 1.3.4

| ID | Test case | Result |
|---|---|---|
| QR-01 | the customer QR payload is the UUID only, with no personal data | PASS |
| QR-02 | every customer has a different UUID | PASS |
| QR-03 | Reward QR tokens are recognisable and never mistaken for a customer QR | PASS |
| QR-04 | QR validation accepts UUIDs (any case) and rejects everything else | PASS |
| QR-05 | a mobile number can never be used to earn points (anti point-stuffing, SRS 1.3.4) | PASS |

### ERN: 1 L = 1 point, round down, 30-minute velocity check, dated batches
SRS: 1.4, 3.1, 3.5, 3.6, 3.7

| ID | Test case | Result |
|---|---|---|
| ERN-01 | 1 litre = 1 point for whole litres, creating a timestamped batch | PASS |
| ERN-02 | fractional litres always round DOWN (SRS 3.6) | PASS |
| ERN-03 | under one litre earns nothing and is rejected | PASS |
| ERN-04 | zero, negative and non-numeric litres are rejected | PASS |
| ERN-05 | velocity check: blocked at 29:59, allowed at exactly 30:00 (SRS 3.7) | PASS |
| ERN-06 | velocity check applies per QR, so a different customer is not blocked | PASS |
| ERN-07 | a blocked earn changes nothing in the ledger | PASS |
| ERN-08 | unknown customers cannot earn | PASS |
| ERN-09 | separate purchases create separate dated batches (SRS 3.5) | PASS |
| ERN-10 | litres are logged to 2 decimals and the ledger shows an earning entry | PASS |

### CAT: Three services and Available/Locked logic
SRS: 3.1 Service Redemption Catalog, 3.3

| ID | Test case | Result |
|---|---|---|
| CAT-01 | the catalogue is exactly the three SRS services with the SRS values | PASS |
| CAT-02 | a service is unlocked exactly when balance >= its points (boundaries) | PASS |

### RDM: Path A Reward QR (5 min, single use) and Path B staff deduction
SRS: 3.1 Dual-Path Redemption

| ID | Test case | Result |
|---|---|---|
| RDM-A1 | Reward QR lasts exactly 5 minutes (valid at 5:00, expired 1 ms later) | PASS |
| RDM-A2 | Reward QR is single use | PASS |
| RDM-A3 | redemption deducts the right points and logs the service (red entry) | PASS |
| RDM-A4 | locked services cannot generate a Reward QR and nothing is created | PASS |
| RDM-A5 | unknown or malformed tokens are rejected | PASS |
| RDM-A6 | an expired token deducts nothing | PASS |
| RDM-A7 | two Reward QRs cannot spend the same points twice | PASS |
| RDM-A8 | the points shown to the customer are locked in when the QR is created, even if Admin changes the price | PASS |
| RDM-A9 | points that expire before the QR is scanned cannot be spent | PASS |
| RDM-B1 | staff deduction works when funds are sufficient, and to exactly zero | PASS |
| RDM-B2 | insufficient funds are rejected and the ledger is untouched | PASS |
| RDM-B3 | bad QR or unknown customer is rejected | PASS |
| RDM-B4 | deduction takes the soonest-expiring batches first, across batches | PASS |

### EXP: 45-60 day activity validity, 180/365 day hard expiry, urgency data
SRS: 3.1 Rules A and B, 3.3 Urgency UI, 4 Verification

| ID | Test case | Result |
|---|---|---|
| EXP-01 | Rule A: valid until 45 days after the last purchase, expired at exactly 45 days | PASS |
| EXP-02 | Rule A: a new purchase renews validity of ALL existing points | PASS |
| EXP-03 | Rule A window is configurable (60 days) | PASS |
| EXP-04 | Rule B: hard expiry 365 days from issue, even with regular purchases | PASS |
| EXP-05 | Rule B window is configurable (180 days) | PASS |
| EXP-06 | whichever rule bites first wins, and the entry names the right reason | PASS |
| EXP-07 | expired points cannot be redeemed | PASS |
| EXP-08 | a late purchase cannot bring lapsed points back (SRS 3.1 retention rule) | PASS |
| EXP-09 | running the expiry job twice creates no duplicate entries | PASS |
| EXP-10 | urgency banner appears from 7 days out, not before (boundary), with days rounded up | PASS |
| EXP-11 | banner counts only the points about to expire | PASS |
| EXP-12 | a customer who never earned has no balance, no banner, and no errors | PASS |
| EXP-13 | after a long jump everything lapses and the books balance | PASS |

### SYN: Offline POS queue and sync
SRS: 3.5 Offline Queueing, 5.1

| ID | Test case | Result |
|---|---|---|
| SYN-01 | queued transactions replay in the order they were captured | PASS |
| SYN-02 | the original capture time is kept for each point batch | PASS |
| SYN-03 | two scans of the same QR within 30 minutes: the first is credited, the second is rejected with a reason | PASS |
| SYN-04 | one bad item never blocks the others | PASS |
| SYN-05 | replaying the same queue twice cannot double-credit (idempotent sync) | PASS |
| SYN-06 | an empty queue changes nothing | PASS |
| SYN-07 | the customer sees offline earnings only after sync, with identical figures everywhere | PASS |

### ADM: Metrics, liability, configuration
SRS: 3.4 Admin Dashboard

| ID | Test case | Result |
|---|---|---|
| ADM-01 | Total Active Users counts customers who bought fuel within the activity window | PASS |
| ADM-02 | issued = redeemed + expired + outstanding at every point in time (liability reconciles) | PASS |
| ADM-03 | configuration limits follow the SRS (Rule A 45 to 60, Rule B 180 or 365) | PASS |
| ADM-04 | catalogue values are validated (whole positive points, non-negative price) | PASS |
| ADM-05 | catalogue changes reach the customer app on the next sync, and the old config is not mutated | PASS |
| ADM-06 | the liability ledger values points at 1 point = Rs. 1 | PASS |
| ADM-07 | points expiring within 30 days are reported | PASS |

### CACHE: Customer app cached pass and ledger
SRS: 3.2, 3.5 Local Device Storage

| ID | Test case | Result |
|---|---|---|
| CACHE-01 | the cached pass holds the QR value, balance, dated ledger and history newest first | PASS |
| CACHE-02 | the cache survives a JSON round trip (this is how it is stored on the device) | PASS |
| CACHE-03 | an unknown customer has no cache | PASS |
| CACHE-04 | a cached pass never reveals another customer’s data | PASS |

### INV: Ledger integrity under 300 random operation runs
SRS: 3.5 Transaction Metadata, 4 Verification

| ID | Test case | Result |
|---|---|---|
| INV-01 | 300 random runs of earn / redeem / token / time-jump never break the ledger rules | PASS |
| INV-02 | seed data is internally consistent | PASS |

### Earlier regression tests (kept)

`tests/logic.test.ts`, `tests/sync.test.ts`, `tests/otp.test.ts`, `tests/auth.test.ts`: 41 cases covering the same rules from the build phase, plus the SHA-256 test vectors, the demo seed data and the cross-role end-to-end flow.

## 4. End-to-end UI test cases (browser, phone size)

### 4.1 Cases and expected results

| ID | Area | What was done | Expected | Result |
|---|---|---|---|---|
| UI-01 | Role screen | Open the app fresh | Customer, New member, Staff, Admin and the six demo customers are shown | PASS |
| UI-02 | Customer sign-in | Tap a demo card, Sign in | Mobile and demo password pre-filled; pass opens with QR and balance; no OTP asked | PASS |
| UI-03 | Urgency UI | Sign in as Ali Raza | "40 points expiring in 5 days" directly under the pass | PASS |
| UI-04 | Catalogue | Open Rewards for rich and poor balances | Unlocked services show Redeem; locked show greyed with "Need N more pts"; names, points and Rs. values match the SRS | PASS |
| UI-05 | Reward QR | Tap Redeem on Tyre Air | Sheet with QR, 5-minute countdown starting at 04:59 and "10 points will be deducted" | PASS |
| UI-06 | Path A | Desk (Nadia) scans the open Reward QR | Success screen, -10 points, new balance shown, ledger updated | PASS |
| UI-07 | Single use | Re-open the desk scan list | The used Reward QR is no longer offered | PASS |
| UI-08 | Path B | Desk scans a customer pass; try all three services | Balance shown; unaffordable service disabled with shortfall; tapping it does nothing; affordable one deducts | PASS |
| UI-09 | POS earning | Bilal scans a customer and keys litres | Keypad accepts one decimal point, max 2 decimals; live "= N points" rounds down; Award disabled until 1 L; 12.9 L gives 12 | PASS |
| UI-09g | Velocity | Scan the same customer again at once | Blocked with a clear message and no points added | PASS |
| UI-10 | Offline queue | Switch POS offline, earn for three scans (one duplicate), switch online | Items saved locally with a counter; no live name lookup offline; auto-sync on reconnect; report shows 2 credited and 1 rejected with the reason; banner clears | PASS |
| UI-11 | Staff access | Wrong and right PIN; try to open other roles' pages | Wrong PIN shows tries left; right PIN opens the role's screen; POS user is redirected away from Desk and Admin | PASS |
| UI-12 | Admin | Dashboard, config, catalogue, clock, reset | Figures include live transactions and reconcile; Rule A/B and catalogue edits apply and reach the customer app; invalid catalogue values (0, blank) refused; +60 days expires points and still reconciles; reset needs two taps | PASS |
| UI-13 | Sign-up | Empty form, bad mobile, duplicate (+92 format), weak/mismatched passwords, then OTP: wrong x3, lock, wait, resend, old code, new code | Each error shown; form locks at OTP; wrong codes count down and lock; resend after the cooldown gives a new code; old code dead; new code creates the account | PASS |
| UI-14 | Sign-in errors | Empty fields, unknown number, wrong password x5, correct password while locked, other customer | Specific messages; counter shared across phone formats; locks on the 5th; stays locked with the right password; other customers unaffected | PASS |
| UI-15 | Persistence | Reload the page while signed in | Same customer stays signed in with the same data | PASS |
| UI-16 | Password field | Tap Show/Hide | Password toggles between masked and visible | PASS |
| UI-17 | Layout 320 px | Walk 14 screens at 320 wide | No horizontal overflow (1 failure found and fixed, DEF-06) | PASS |
| UI-18 | Instant pass | Cold reload on /customer | Pass and QR visible in about 0.36 s in a development build, with no API call (the app has none) | PASS |
| UI-19 | Console | Run every screen, read console errors | 2 error types found and fixed (DEF-04, DEF-05); error count unchanged during the clean re-run | PASS |
| UI-20 | History | Open History for a heavy user | Earnings green, redemptions red, newest first | PASS |

### 4.2 Run notes

Each group in 4.1 holds several individual checks (for example UI-13 has 18). A few checks failed on their first run, and every one of those was a mistake in my test script, not in the app: a selector that did not match a button label, a regex that picked up the wrong "Rs." figure, a lock test that sent 4 wrong passwords instead of 5, and an SVG count taken on the wrong tab. They were corrected and re-run. The real defects (section 5) were found by the unit tests, the browser console and the 320 px layout check, not by those script failures.

## 5. Defect log

| ID | Severity | Found by | Problem | Fix | Re-test |
|---|---|---|---|---|---|
| DEF-01 | Medium | REG-04 | Any 10 to 13 digit string was accepted as a mobile number (for example 1234567890). | Mobile must be a Pakistani mobile number (03 plus 9 digits). | PASS |
| DEF-02 | High | REG-05, REG-06, AUTH-01 | Numbers written as +92 300..., 92300... or 0092300... were treated as different numbers, so the same person could register twice and could not sign in using that format. | One canonical form is used for registration, duplicates, sign-in, lockout counting and OTP. | PASS |
| DEF-03 | Medium | RDM-A8 | If Admin changed a service's points after a customer made a Reward QR, the desk deducted a different amount from the one the customer was shown. | The points are locked into the Reward QR when it is created. | PASS |
| DEF-04 | **Critical on Android** | Browser console | The demo-password banner put raw text inside a View. Browsers only log this, but **Android crashes with "Text strings must be rendered within a Text component"**, which would have broken the sign-in screen on the phone. Other banners with mixed text had the same weakness. | The shared Banner now wraps any plain text in a Text component. | PASS (console error count unchanged on re-run) |
| DEF-05 | Low | Browser console | Duplicate React key "9" on the PIN keypad. | Unique keys. | PASS |
| DEF-06 | Low | Layout check at 320 px | Admin Rule B buttons ran off the right edge on the smallest phones. | Buttons wrap. | PASS |

## 6. SRS requirement coverage

| SRS requirement | Covered by | Status |
|---|---|---|
| 3.1 Account provisioning: mobile, name, optional vehicle, OTP | REG-01..08, OTP-01..06, UI-13 | Verified |
| 3.1 QR allocation: UUID, dynamic, offline-capable QR | QR-01..04, CACHE-01..04, UI-02, UI-18 | Verified (QR drawn from the cached pass; real offline airplane-mode test pending on a phone) |
| 3.1 Catalogue: Tyre Air 10, Puncture 150, Car Wash 500 | CAT-01, CAT-02, UI-04 | Verified |
| 3.1 Path A: Reward QR, 5 minutes, single use, auto-deduct and log | RDM-A1..A9, UI-05..07 | Verified |
| 3.1 Path B: staff scans pass, picks service, funds validated | RDM-B1..B4, UI-08 | Verified |
| 3.1 Rule A: valid while fuelling every 45 to 60 days | EXP-01..03, EXP-08 | Verified |
| 3.1 Rule B: hard expiry 180 or 365 days | EXP-04..06 | Verified |
| 1.4 / 3.6 earning rate and rounding down | ERN-01..04, UI-09 | Verified |
| 3.7 velocity: 1 earn per QR per 30 minutes | ERN-05..07, SYN-03, UI-09g | Verified |
| 3.7 privacy: QR has no personal data | QR-01 | Verified |
| 1.3.4 POS must scan; no manual mobile entry | QR-05; POS has no text entry for numbers | Verified |
| 3.3 Greyscale locked vs saturated unlocked | UI-04 (locked cards are greyed, unlocked are coloured) | Verified visually in the browser |
| 3.3 Urgency banner beside the pass | EXP-10, EXP-11, UI-03 | Verified |
| 3.3 POS: at most two actions (scan, input litres) | UI-09 (scan, keypad, Award) | Verified. Award is a third tap that commits the entry, as on any till |
| 3.4 Admin: Active Users, Issued vs Redeemed, Liability Ledger, thresholds and catalogue config | ADM-01..07, UI-12 | Verified |
| 3.4 Customer UI: Digital Pass, ledger, catalogue, history green/red | CACHE-01, UI-02..04, UI-20 | Verified |
| 3.5 Batches with timestamps | ERN-09, EXP-*, INV-01 | Verified |
| 3.5 Offline POS queue and sync | SYN-01..07, UI-10 | Verified |
| 3.2 Instant QR, native cache, no cloud call at launch | CACHE-02, UI-15, UI-18 | Verified in the browser; native timing pending on a phone |
| 4 Verification of Rule A and B jobs | EXP-01..13, INV-01, UI-12j (time travel) | Verified |

## 7. Not tested, limits and risks

**Not tested (needs a real phone or real services):**
1. Camera scanning of real QR codes on Android (the scan screens work in "Demo scan" mode; the camera code path is built but was blocked in the browser).
2. Running inside Expo Go on a real Android phone: touch behaviour, keyboard, safe areas, speed, airplane-mode launch.
3. iOS (the SRS lists it; not built or tested here).
4. Real SMS delivery. The prototype shows the code on screen. A real gateway and its delivery failures are untested.
5. Anything involving a server: the prototype keeps one on-device ledger, so cross-device behaviour (customer on one phone, staff on another) is simulated. The live "Redeemed" screen on the customer's Reward QR sheet is built to update by polling but could not be shown across two devices here.
6. Load and concurrency, penetration testing, accessibility with a screen reader.

**Risks and recommendations for the real build:**
- **Fraud and typos at the till:** the keypad allows up to 999 litres per entry. The SRS has no upper limit; consider a sanity cap (for example 200 L) or a confirmation above it.
- **Rules must be enforced on the server.** Velocity, expiry, balances and Reward QR single-use are enforced in the app's code here. In production they must live on the server, with the app only showing results.
- **Passwords and PINs:** hashed with SHA-256 for the demo only. Use bcrypt or argon2 on a server. Staff PINs are plain text in the demo build.
- **Forgot password:** not in the SRS and not built; real users will need it (one OTP).
- **SRS ambiguities I resolved (please confirm with the client):** Rule A uses 45 days by default (SRS says 45 to 60); Rule B uses 365 days by default (SRS says 180 or 365); "Active user" means bought fuel within the Rule A window; expiry is applied at the exact second it falls due; mobile numbers are Pakistani (03XXXXXXXXX).
- **Time travel and demo accounts** exist only to demonstrate expiry. Switch them off with `SHOW_DEMO_ACCOUNTS` and `SHOW_DEMO_SMS` and remove the Admin demo tools before release.

## 8. How to re-run

```
npm run typecheck
npm test
npx expo export --platform android --output-dir ./out
npx expo-doctor
```
For the screens: `npx expo start`, then scan the QR with Expo Go. Demo logins are in README.md.
