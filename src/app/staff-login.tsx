import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SHOW_DEMO_ACCOUNTS } from '@/core/demo';
import { PIN_LOCK_MS, ROUTE_FOR_ROLE, STAFF_ACCOUNTS, verifyPin, type StaffAccount } from '@/core/staff';
import { now, signInStaff } from '@/core/store';
import { Banner } from '@/ui/kit';
import { TopBar } from '@/ui/Screen';
import { C, F, shadow } from '@/ui/theme';

const ICON = { pos: '⛽', desk: '🎁', admin: '📊' } as const;

export default function StaffLogin() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const accounts = STAFF_ACCOUNTS.filter((a) => (kind === 'admin' ? a.role === 'admin' : a.role !== 'admin'));
  const [acct, setAcct] = useState<StaffAccount | null>(accounts.length === 1 ? accounts[0] : null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (pin.length !== 4 || !acct) return;
    const r = verifyPin(acct.id, pin, now());
    if (r.ok) {
      signInStaff(acct.id);
      router.replace(ROUTE_FOR_ROLE[acct.role]);
      return;
    }
    setPin('');
    setErr(
      r.reason === 'locked'
        ? `Too many wrong PINs. Try again in ${Math.ceil((r.waitMs ?? PIN_LOCK_MS) / 1000)} seconds.`
        : `Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`,
    );
  }, [pin, acct]);

  const press = (k: string) => {
    setErr('');
    setPin((p) => (k === '<' ? p.slice(0, -1) : p.length < 4 ? p + k : p));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back title={kind === 'admin' ? 'Admin sign in' : 'Staff sign in'} />
      {!acct ? (
        <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 16, color: C.grey }}>Who is signing in?</Text>
          {accounts.map((a) => (
            <Pressable key={a.id} onPress={() => { setAcct(a); setPin(''); setErr(''); }} accessibilityRole="button" accessibilityLabel={`${a.name}, ${a.title}`} style={s.card}>
              <Text style={{ fontSize: 38 }}>{ICON[a.role]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>{a.name}</Text>
                <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey }}>{a.title}</Text>
                {SHOW_DEMO_ACCOUNTS ? <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.red }}>Demo PIN {a.pin}</Text> : null}
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: 28, color: C.red }}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: 20, alignItems: 'center' }}>
          <Text style={{ fontSize: 44 }}>{ICON[acct.role]}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 26, color: C.ink }}>{acct.name}</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey, marginBottom: 14 }}>{acct.title}. Enter your 4-digit PIN.</Text>
          <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.dot, pin.length > i && { backgroundColor: C.ink }]} />
            ))}
          </View>
          {SHOW_DEMO_ACCOUNTS ? <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.red, marginBottom: 6 }}>Demo PIN {acct.pin}</Text> : null}
          {err ? <View style={{ alignSelf: 'stretch' }}><Banner tone="error">{err}</Banner></View> : null}
          <View style={s.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'].map((k, i) =>
              k === '' ? (
                <View key={`gap${i}`} style={s.keyGap} />
              ) : (
                <Pressable key={`key${k}`} onPress={() => press(k)} style={({ pressed }) => [s.key, pressed && { backgroundColor: C.yellow }]} accessibilityRole="button" accessibilityLabel={k === '<' ? 'Delete' : k}>
                  <Text style={{ fontFamily: F.black, fontSize: 30, color: C.ink }}>{k === '<' ? '⌫' : k}</Text>
                </Pressable>
              ),
            )}
          </View>
          {accounts.length > 1 ? (
            <Pressable onPress={() => { setAcct(null); setPin(''); setErr(''); }} accessibilityRole="button">
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.link, textDecorationLine: 'underline' }}>Not you? Choose another account</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...shadow },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.ink },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', width: 280, marginBottom: 12 },
  key: { width: 84, height: 62, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  keyGap: { width: 84, height: 62 },
});
