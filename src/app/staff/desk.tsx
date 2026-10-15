import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LedgerError, balanceOf, findCustomer, isRewardToken, isUuid } from '@/core/logic';
import { deskRedeemService, deskRedeemToken, now, peek, useStore } from '@/core/store';
import type { ServiceId } from '@/types';
import { Banner, Btn, Chip } from '@/ui/kit';
import { Scanner } from '@/ui/Scanner';
import { StaffGuard, leaveStaff } from '@/ui/StaffGuard';
import { TopBar } from '@/ui/Screen';
import { C, F, SERVICE_ICON } from '@/ui/theme';

type Mode = 'A' | 'B';
interface Done { customer: string; service: string; points: number; balance: number }

export default function DeskPage() {
  return (
    <StaffGuard role="desk">
      <DeskScreen />
    </StaffGuard>
  );
}

function DeskScreen() {
  const { db } = useStore();
  const [mode, setMode] = useState<Mode>('A');
  const [err, setErr] = useState('');
  const [pathBId, setPathBId] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  const reset = () => { setErr(''); setPathBId(''); setDone(null); };
  const switchMode = (m: Mode) => { reset(); setMode(m); };
  const fail = (e: unknown) => setErr(e instanceof LedgerError ? e.message : 'Could not complete the redemption.');

  // Read the ledger after the deduction, not the render-time snapshot.
  const finish = (customerId: string, service: string, points: number) => {
    const fresh = peek().db;
    setDone({
      customer: findCustomer(fresh, customerId)?.name ?? 'Customer',
      service,
      points,
      balance: balanceOf(fresh, customerId, now()),
    });
  };

  const scanA = (data: string) => {
    if (isUuid(data)) return setErr('That is a customer pass. Switch to "Customer pass" to deduct points for a service.');
    if (!isRewardToken(data)) return setErr('Not a Kaleem Petrol Reward QR.');
    try {
      const r = deskRedeemToken(data);
      setErr('');
      finish(r.customer.uuid, r.service.name, r.points);
    } catch (e) { fail(e); }
  };

  const scanB = (data: string) => {
    if (isRewardToken(data)) return setErr('That is a Reward QR. Switch to "Reward QR" to redeem it.');
    if (!isUuid(data)) return setErr('Not a Kaleem Petrol customer QR.');
    if (!findCustomer(db, data)) return setErr('Customer not found.');
    setErr('');
    setPathBId(data.toLowerCase());
  };

  const pick = (id: ServiceId) => {
    try {
      const svc = deskRedeemService(pathBId, id);
      setErr('');
      finish(pathBId, svc.name, svc.points);
    } catch (e) { fail(e); }
  };

  const t = now();
  const openTokens = db.tokens.filter((x) => !x.used && x.expiresAt > t);
  const cust = pathBId ? findCustomer(db, pathBId) : undefined;
  const bal = pathBId ? balanceOf(db, pathBId, t) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      <TopBar back onBack={leaveStaff} dark title="Redemption Desk" />
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#fff' }}>
        <Chip label="Reward QR" on={mode === 'A'} onPress={() => switchMode('A')} />
        <Chip label="Customer pass" on={mode === 'B'} onPress={() => switchMode('B')} />
      </View>

      {done ? (
        <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={{ padding: 24, alignItems: 'center', gap: 10, flexGrow: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 72 }}>✅</Text>
          <Text style={{ fontFamily: F.black, fontSize: 30, color: C.green }}>Redeemed</Text>
          <Text style={{ fontFamily: F.black, fontSize: 24, color: C.ink, textAlign: 'center' }}>{done.service}</Text>
          <Text style={{ fontFamily: F.semi, fontSize: 18, color: C.ink, textAlign: 'center' }}>
            {done.customer}: -{done.points} points{'\n'}Remaining balance: {done.balance} points
          </Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>Serve the customer, then scan the next one.</Text>
          <Btn title="Next customer" onPress={reset} big style={{ alignSelf: 'stretch', marginTop: 12 }} />
        </ScrollView>
      ) : mode === 'A' ? (
        <View style={{ flex: 1 }}>
          {err ? <View style={{ padding: 12, backgroundColor: '#fff' }}><Banner tone="error">{err}</Banner></View> : null}
          <Scanner
            hint="Scan the customer's Reward QR"
            demoTitle="Open Reward QR codes (customers create these in their app)"
            demo={openTokens.map((x) => ({
              label: `${db.config.catalog.find((s) => s.id === x.serviceId)?.name} for ${findCustomer(db, x.customerId)?.name}`,
              sub: `Valid for ${Math.max(0, Math.ceil((x.expiresAt - t) / 1000))} more seconds`,
              value: x.token,
            }))}
            onScan={scanA}
          />
        </View>
      ) : !pathBId ? (
        <View style={{ flex: 1 }}>
          {err ? <View style={{ padding: 12, backgroundColor: '#fff' }}><Banner tone="error">{err}</Banner></View> : null}
          <Scanner
            hint="Scan the customer's pass"
            demoTitle="Tap a customer to simulate scanning their QR"
            demo={db.customers.map((c) => ({ label: c.name, sub: `ID ${c.uuid.slice(0, 8)}`, value: c.uuid }))}
            onScan={scanB}
          />
        </View>
      ) : (
        <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: F.black, fontSize: 24, color: C.ink }}>{cust?.name}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.grey }}>Balance: {bal} points</Text>
          {err ? <Banner tone="error">{err}</Banner> : null}
          {db.config.catalog.map((svc) => {
            const ok = bal >= svc.points;
            return (
              <View key={svc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: ok ? C.yellow : C.line, borderRadius: 16, padding: 12, opacity: ok ? 1 : 0.5 }}>
                <Text style={{ fontSize: 34 }}>{SERVICE_ICON[svc.id]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>{svc.name}</Text>
                  <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>{svc.points} pts{ok ? '' : `  ·  needs ${svc.points - bal} more`}</Text>
                </View>
                <Btn title="Deduct" onPress={() => pick(svc.id)} disabled={!ok} />
              </View>
            );
          })}
          <Btn title="Scan a different customer" variant="outline" onPress={reset} />
        </ScrollView>
      )}
    </View>
  );
}
