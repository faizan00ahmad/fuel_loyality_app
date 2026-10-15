import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { DEMO_PASSWORD } from '@/core/auth';
import { DEMO_CUSTOMERS, SHOW_DEMO_ACCOUNTS } from '@/core/demo';
import { validateMobile } from '@/core/logic';
import { loginCustomer } from '@/core/store';
import { Banner, Body, Btn, Field, H1, PasswordField } from '@/ui/kit';
import { TopBar } from '@/ui/Screen';
import { C, F } from '@/ui/theme';

export default function CustomerLogin() {
  const params = useLocalSearchParams<{ mobile?: string }>();
  const fromDemo = typeof params.mobile === 'string' && DEMO_CUSTOMERS.some((d) => d.mobile === params.mobile);
  const [mobile, setMobile] = useState(typeof params.mobile === 'string' ? params.mobile : '');
  const [password, setPassword] = useState(SHOW_DEMO_ACCOUNTS && fromDemo ? DEMO_PASSWORD : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!validateMobile(mobile)) return setErr('Enter a valid mobile number.');
    if (!password) return setErr('Enter your password.');
    setBusy(true);
    const r = await loginCustomer(mobile, password);
    setBusy(false);
    if (r.ok) return router.replace('/customer');
    if (r.reason === 'unknown') return setErr('No account found for this number. Join as a New member first.');
    if (r.reason === 'locked') return setErr(`Too many wrong passwords. Try again in ${Math.ceil((r.waitMs ?? 0) / 1000)} seconds.`);
    setErr(`Wrong password. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar back />
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ marginBottom: 6 }}>Welcome back</H1>
        <Body style={{ color: '#6b6b6b', marginBottom: 20 }}>Sign in with your mobile number and password.</Body>
        <Field
          label="Mobile number"
          value={mobile}
          onChangeText={(t) => { setMobile(t); setErr(''); }}
          keyboardType="phone-pad"
          placeholder="03XX-XXXXXXX"
        />
        <PasswordField label="Password" value={password} onChangeText={(t) => { setPassword(t); setErr(''); }} placeholder="Your password" onSubmitEditing={() => void signIn()} />
        {err ? <Banner tone="error">{err}</Banner> : null}
        <View style={{ height: 16 }} />
        <Btn title="Sign in" onPress={() => void signIn()} loading={busy} big />
        {SHOW_DEMO_ACCOUNTS ? (
          <View style={{ marginTop: 18 }}>
            <Banner tone="warn">Demo password for every demo customer: {DEMO_PASSWORD}</Banner>
          </View>
        ) : null}
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey, textAlign: 'center', marginTop: 16 }}>
          New here? Go back and choose New member. A one-time code is only used when you first join.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
