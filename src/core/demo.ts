/** Presentation helpers. Switch both off for a real deployment. */
export const SHOW_DEMO_ACCOUNTS = true; // demo cards on the sign-in screens
export const SHOW_DEMO_SMS = true; // show the sign-up OTP text on screen because no SMS gateway is connected

export interface DemoCustomer {
  name: string;
  mobile: string;
  tag: string;
}

export const DEMO_CUSTOMERS: DemoCustomer[] = [
  { name: 'Usman Tariq', mobile: '03335550101', tag: 'Heavy user, can redeem everything' },
  { name: 'Ali Raza', mobile: '03001234567', tag: 'Points expiring soon (1 year limit)' },
  { name: 'Zainab Iqbal', mobile: '03458899001', tag: '20 points short of a Car Wash' },
  { name: 'Sara Khan', mobile: '03217654321', tag: 'About to lapse (45 days idle)' },
  { name: 'Fatima Noor', mobile: '03124455667', tag: 'Lapsed, zero points' },
  { name: 'Ayesha Malik', mobile: '03007788990', tag: 'Just joined' },
];
