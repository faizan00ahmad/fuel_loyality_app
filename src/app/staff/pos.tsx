import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LedgerError, findCustomer, isRewardToken, isUuid, litresToPoints } from '@/core/logic';
import { dismissSyncReport, posEarn, setOnline, syncQueue, useStore, type EarnOutcome } from '@/core/store';
import { Banner, Btn } from '@/ui/kit';
import { Scanner } from '@/ui/Scanner';
import { StaffGuard, leaveStaff } from '@/ui/StaffGuard';
import { TopBar } from '@/ui/Screen';
import { C, F, formatMobile } from '@/ui/theme';

type Step = 'scan' | 'keypad' | 'result';

export default function PosPage() {
  return (
    <StaffGuard role="pos">
      <PosScreen />
    </StaffGuard>
  );
}

function PosScreen() {
  const { db, online, queue, lastSync } = useStore();
  const [step, setStep] = useState<Step>('scan');
  const [customerId, setCustomerId] = useState('');
  const [litres, setLitres] = useState('');
  const [err, setErr] = useState('');
  const [outcome, setOutcome] = useState<EarnOutcome | null>(null);

  // Offline, the POS has no live customer lookup; it only knows the scanned ID until sync.
  const customer = online && customerId ? findCustomer(db, customerId) : undefined;
  const reset = () => { setStep('scan'); setCustomerId(''); setLitres(''); setOutcome(null); };

  const onScan = (data: string) => {
    if (isRewardToken(data)) return setErr('That is a Reward QR. Use the Redemption Desk for it.');
    if (!isUuid(data)) return setErr('Not a Kaleem Petrol customer QR. Ask the customer to open their Digital Pass.');
    // Online the POS validates against the central ledger immediately; offline it accepts and validates on sync.
    if (online && !findCustomer(db, data)) return setErr('Customer not found in the system.');
    setErr('');
    setCustomerId(data.toLowerCase());
    setStep('keypad');
  };

  const press = (k: string) => {
    setErr('');
    if (k === '<') return setLitres((v) => v.slice(0, -1));
    if (k === '.') return setLitres((v) => (v.includes('.') ? v : (v === '' ? '0.' : v + '.')));
    setLitres((v) => {
      const next = v === '0' ? k : v + k;
      const [i, d] = next.split('.');
      if ((d?.length ?? 0) > 2 || i.length > 3) return v;
      return next;
    });
  };

  const litresNum = parseFloat(litres);
  const pts = litresToPoints(litresNum);

  const award = () => {
    try {
      setOutcome(posEarn(customerId, litresNum));
      setStep('result');
    } catch (e) {
      setErr(e instanceof LedgerError ? e.message : 'Could not complete the transaction.');
      setStep('scan');
      setCustomerId('');
      setLitres('');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      <TopBar
        back
        onBack={leaveStaff}
        dark
        title="Attendant POS"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: online ? '#7be495' : C.yellow }}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
            <Switch value={online} onValueChange={setOnline} trackColor={{ true: '#2e7d32', false: '#777' }} thumbColor="#fff" accessibilityLabel="POS network connection" />
          </View>
        }
      />
      {queue.length > 0 ? (
        <View style={s.queue}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink, flex: 1 }}>
            {queue.length} transaction{queue.length > 1 ? 's' : ''} saved on this device, waiting to sync
          </Text>
          {online ? <Pressable onPress={syncQueue} accessibilityRole="button"><Text style={s.syncBtn}>Sync now</Text></Pressable> : null}
        </View>
      ) : null}
      {lastSync ? (
        <View style={{ backgroundColor: '#fff', padding: 12, gap: 6 }}>
          <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>
            Synced {lastSync.results.filter((r) => r.ok).length} of {lastSync.results.length} queued transactions
          </Text>
          {lastSync.results.map((r) => (
            <Text key={r.id} style={{ fontFamily: F.medium, fontSize: 14, color: r.ok ? C.green : C.red }}>
              {r.ok ? `✓ ${r.customerName ?? 'Customer'}: +${r.points} pts (${r.litres} L)` : `✗ ${r.customerName ?? 'Unknown QR'} (${r.litres} L): ${r.reason}`}
            </Text>
          ))}
          <Pressable onPress={dismissSyncReport} accessibilityRole="button"><Text style={s.syncBtn}>Dismiss</Text></Pressable>
        </View>
      ) : null}

      {step === 'scan' && (
        <View style={{ flex: 1 }}>
          {err ? <View style={{ padding: 12, backgroundColor: '#fff' }}><Banner tone="error">{err}</Banner></View> : null}
          <Scanner
            hint="Scan customer QR"
            demoTitle="Tap a customer to simulate scanning their QR"
            demo={db.customers.map((c) => ({ label: c.name, sub: `${formatMobile(c.mobile)}  ·  ID ${c.uuid.slice(0, 8)}`, value: c.uuid }))}
            onScan={onScan}
          />
        </View>
      )}

      {step === 'keypad' && (
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.grey }}>
            Customer: <Text style={{ fontFamily: F.black, color: C.ink }}>{customer ? customer.name : `QR ...${customerId.slice(-4)} (checked on sync)`}</Text>
          </Text>
          <View style={s.display}>
            <Text style={{ fontFamily: F.black, fontSize: 60, color: C.ink }}>{litres === '' ? '0' : litres}<Text style={{ fontSize: 26, color: C.grey }}> L</Text></Text>
            <Text style={{ fontFamily: F.bold, fontSize: 20, color: pts >= 1 ? C.green : C.grey }}>
              {pts >= 1 ? `= ${pts} point${pts > 1 ? 's' : ''}` : 'Enter at least 1 litre'}
            </Text>
          </View>
          {err ? <Banner tone="error">{err}</Banner> : null}
          <View style={s.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '<'].map((k) => (
              <Pressable key={k} onPress={() => press(k)} style={({ pressed }) => [s.key, pressed && { backgroundColor: C.yellow }]} accessibilityRole="button" accessibilityLabel={k === '<' ? 'Delete' : k}>
                <Text style={{ fontFamily: F.black, fontSize: 34, color: C.ink }}>{k === '<' ? '⌫' : k}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
            <Btn title="Cancel" variant="outline" onPress={reset} style={{ flex: 1 }} big />
            <Btn title="Award points" onPress={award} disabled={pts < 1} style={{ flex: 2 }} big />
          </View>
        </View>
      )}

      {step === 'result' && outcome ? (
        <ScrollView style={{ backgroundColor: '#fff' }} contentContainerStyle={{ padding: 24, alignItems: 'center', gap: 12, flexGrow: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 72 }}>{outcome.status === 'done' ? '✅' : '📥'}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 34, color: outcome.status === 'done' ? C.green : C.ink }}>+{outcome.points} points</Text>
          {outcome.status === 'done' ? (
            <Text style={{ fontFamily: F.semi, fontSize: 18, color: C.ink, textAlign: 'center' }}>
              Added to {outcome.name}. New balance: {outcome.balance} points.
            </Text>
          ) : queue.length === 0 ? (
            <Banner tone="ok">Connection restored. This transaction has been synced to the central ledger.</Banner>
          ) : (
            <Banner tone="warn">
              No connection. Saved securely on this device ({outcome.queued} waiting). It will sync automatically when the POS is back online.
            </Banner>
          )}
          <Btn title="Next customer" onPress={reset} big style={{ alignSelf: 'stretch', marginTop: 16 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  queue: { backgroundColor: C.yellow, padding: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncBtn: { fontFamily: F.bold, fontSize: 15, color: C.link, textDecorationLine: 'underline' },
  display: { alignItems: 'center', paddingVertical: 12 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginVertical: 8 },
  key: { width: '30%', height: 70, borderRadius: 18, backgroundColor: '#F1F1F1', alignItems: 'center', justifyContent: 'center' },
});
