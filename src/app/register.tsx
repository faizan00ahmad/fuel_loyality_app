import { router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { LedgerError, validateMobile } from '@/core/logic';
import { findByMobile, register, setSession } from '@/core/store';
import { validatePassword } from '@/core/auth';
import { Banner, Body, Btn, Field, H1, PasswordField } from '@/ui/kit';
import { OtpStep } from '@/ui/OtpStep';
import { TopBar } from '@/ui/Screen';
import { F } from '@/ui/theme';

export default function Register() {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [stage, setStage] = useState<'form' | 'otp'>('form');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const next = () => {
    if (name.trim().length < 2) return setErr('Please enter your name.');
    if (!validateMobile(mobile)) return setErr('Please enter a valid mobile number.');
    if (findByMobile(mobile)) return setErr('This mobile number is already registered. Please sign in instead.');
    const pwErr = validatePassword(password, confirm);
    if (pwErr) return setErr(pwErr);
    setErr('');
    setStage('otp');
  };

  // The account is created only after the OTP passes, so unverified numbers never reach the ledger.
  const create = async () => {
    setBusy(true);
    try {
      const c = await register({ name, mobile, vehicle, password });
      setSession({ role: 'customer', uuid: c.uuid });
      router.replace('/customer');
    } catch (e) {
      setErr(e instanceof LedgerError ? e.message : 'Something went wrong. Please try again.');
      setStage('form');
    } finally {
      setBusy(false);
    }
  };

  const locked = stage === 'otp';
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar back />
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ marginBottom: 6 }}>Join Kaleem Petrol</H1>
        <Body style={{ color: '#6b6b6b', marginBottom: 20 }}>Earn 1 point for every litre of petrol. Get your personal QR pass in seconds.</Body>
        <Field label="Full name" value={name} onChangeText={(t) => { setName(t); setErr(''); }} placeholder="e.g. Ahmad Khan" editable={!locked} autoCapitalize="words" />
        <Field label="Mobile number" value={mobile} onChangeText={(t) => { setMobile(t); setErr(''); }} keyboardType="phone-pad" placeholder="03XX-XXXXXXX" editable={!locked} />
        <Field label="Vehicle number (optional)" value={vehicle} onChangeText={setVehicle} placeholder="e.g. LEA-1234" autoCapitalize="characters" editable={!locked} />
        <PasswordField label="Create a password" value={password} onChangeText={(t) => { setPassword(t); setErr(''); }} placeholder="At least 6 characters, letters and numbers" editable={!locked} />
        <PasswordField label="Confirm password" value={confirm} onChangeText={(t) => { setConfirm(t); setErr(''); }} placeholder="Type it again" editable={!locked} />
        {locked ? (
          <OtpStep mobile={mobile} onVerified={() => void create()} busy={busy} label="Verify and create my pass" />
        ) : (
          <>
            {err ? <Banner tone="error">{err}</Banner> : null}
            <View style={{ height: 16 }} />
            <Btn title="Send verification code" onPress={next} big />
          </>
        )}
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: '#6b6b6b', textAlign: 'center', marginTop: 14 }}>
          Your QR code holds only a random ID, never your name or number.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
