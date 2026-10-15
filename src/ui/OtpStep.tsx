import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SHOW_DEMO_SMS } from '@/core/demo';
import { issueOtp, otpMessage, previewSender, resendWaitMs, verifyOtp } from '@/core/otp';
import { now } from '@/core/store';
import { Banner, Btn, Field } from './kit';
import { C, F } from './theme';

/** Single-use OTP entry. Shared by sign-up and sign-in so both follow the same rules. */
export function OtpStep({
  mobile,
  onVerified,
  busy,
  label = 'Verify',
}: {
  mobile: string;
  onVerified: () => void;
  busy?: boolean;
  label?: string;
}) {
  const [code, setCode] = useState('');
  const [sms, setSms] = useState<{ code: string; expiresAt: number } | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(now());
  const started = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(id);
  }, []);

  const send = () => {
    const r = issueOtp(mobile, now());
    if (r.ok) {
      setSms({ code: r.code, expiresAt: r.expiresAt });
      setErr('');
      setCode('');
      void previewSender.send(mobile, r.code);
    } else {
      setErr(`Please wait ${Math.ceil(r.waitMs / 1000)} seconds before asking for another code.`);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = () => {
    const r = verifyOtp(mobile, code, now());
    if (r.ok) return onVerified();
    setErr(otpMessage(r));
  };

  const wait = Math.ceil(resendWaitMs(mobile, tick) / 1000);
  const left = sms ? Math.max(0, Math.ceil((sms.expiresAt - tick) / 1000)) : 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return (
    <View>
      {SHOW_DEMO_SMS && sms ? (
        <View style={{ backgroundColor: '#1b1b1b', borderRadius: 16, padding: 14, marginBottom: 14 }}>
          <Text style={{ fontFamily: F.semi, fontSize: 12, color: '#9a9a9a' }}>📱 DEMO SMS (a real SMS would arrive here)</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 16, color: '#fff', marginTop: 4 }}>
            Kaleem Petrol: your verification code is{' '}
            <Text style={{ fontFamily: F.black, color: C.yellow, letterSpacing: 2 }}>{sms.code}</Text>. It works once and expires in 2 minutes. Do not share it.
          </Text>
        </View>
      ) : (
        <Banner tone="info">We sent a 6-digit code to {mobile}.</Banner>
      )}
      <View style={{ height: 8 }} />
      <Field
        label={left > 0 ? `One-time code (valid ${mm}:${ss})` : 'One-time code'}
        value={code}
        onChangeText={(t) => { setCode(t.replace(/\D/g, '')); setErr(''); }}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="______"
      />
      {err ? <Banner tone="error">{err}</Banner> : null}
      <View style={{ height: 14 }} />
      <Btn title={label} onPress={verify} disabled={code.length !== 6} loading={busy} big />
      <View style={{ height: 10 }} />
      <Btn title={wait > 0 ? `Resend code in ${wait}s` : 'Resend code'} onPress={send} disabled={wait > 0} variant="outline" />
    </View>
  );
}
