import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_CUSTOMERS, SHOW_DEMO_ACCOUNTS } from '@/core/demo';
import { useStore } from '@/core/store';
import { Logo } from '@/ui/kit';
import { C, F, shadow } from '@/ui/theme';

const ROLES = [
  { icon: '👤', title: 'Customer', sub: 'Sign in to your Digital Pass', href: '/customer-login' },
  { icon: '🎉', title: 'New member', sub: 'Join and get your QR pass', href: '/register' },
  { icon: '⛽', title: 'Staff', sub: 'Attendant POS and Redemption Desk', href: '/staff-login?kind=staff' },
  { icon: '📊', title: 'Admin', sub: 'Dashboard and configuration', href: '/staff-login?kind=admin' },
] as const;

export default function RoleSelect() {
  const { session } = useStore();
  const insets = useSafeAreaInsets();
  // A signed-in customer goes straight to the pass: it loads from the local cache, no network wait.
  if (session?.role === 'customer') return <Redirect href="/customer" />;

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <LinearGradient colors={[C.red, C.redDark]} style={[s.hero, { paddingTop: insets.top + 28 }]}>
        <Logo light size={40} />
        <Text style={s.tag}>Petrol Reward System</Text>
        <Text style={s.sub}>1 litre = 1 point = 1 rupee.{'\n'}Spend your points on tyre air, puncture repair and car wash.</Text>
        <View style={s.coin}><Text style={{ fontSize: 40 }}>⛽</Text></View>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ fontFamily: F.black, fontSize: 26, color: C.ink }}>Who is signing in?</Text>
        {ROLES.map((r) => (
          <Pressable
            key={r.title}
            onPress={() => router.push(r.href)}
            accessibilityRole="button"
            accessibilityLabel={r.title}
            style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
          >
            <Text style={{ fontSize: 34 }}>{r.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>{r.title}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey }}>{r.sub}</Text>
            </View>
            <Text style={{ fontFamily: F.bold, fontSize: 28, color: C.red }}>›</Text>
          </Pressable>
        ))}
        {SHOW_DEMO_ACCOUNTS ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: 20, color: C.ink }}>Demo customers</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>
              For presentations. Tap one, then Sign in. The demo password is filled in for you.
            </Text>
            {DEMO_CUSTOMERS.map((d) => (
              <Pressable
                key={d.mobile}
                onPress={() => router.push({ pathname: '/customer-login', params: { mobile: d.mobile } })}
                accessibilityRole="button"
                accessibilityLabel={`Demo customer ${d.name}`}
                style={({ pressed }) => [s.demo, pressed && { opacity: 0.85 }]}
              >
                <View style={s.avatar}><Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>{d.name[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.ink }}>{d.name}</Text>
                  <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>{d.tag}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey, textAlign: 'center', marginTop: 8 }}>
          Prototype build. Data is stored on this device only.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 22, paddingBottom: 30, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  tag: { fontFamily: F.bold, fontSize: 22, color: C.yellow, marginTop: -4 },
  sub: { fontFamily: F.medium, fontSize: 16, color: '#fff', marginTop: 10, maxWidth: 215 },
  coin: {
    position: 'absolute',
    right: 22,
    bottom: 26,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: C.yellow,
    borderWidth: 4,
    borderColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demo: { backgroundColor: C.bg, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...shadow,
  },
});
