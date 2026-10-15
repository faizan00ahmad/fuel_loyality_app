import { Redirect, router } from 'expo-router';
import React from 'react';
import { STAFF_ACCOUNTS, type StaffRole } from '@/core/staff';
import { signOutStaff, useStore } from '@/core/store';

/** Renders children only for a staff member signed in with the matching role; otherwise sends them to the PIN screen. */
export function StaffGuard({ role, children }: { role: StaffRole; children: React.ReactNode }) {
  const { staff } = useStore();
  const acct = STAFF_ACCOUNTS.find((a) => a.id === staff);
  if (!acct || acct.role !== role) {
    return <Redirect href={role === 'admin' ? '/staff-login?kind=admin' : '/staff-login?kind=staff'} />;
  }
  return <>{children}</>;
}

export const leaveStaff = () => {
  signOutStaff();
  router.replace('/');
};
