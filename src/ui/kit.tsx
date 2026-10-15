import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { C, F, shadow } from './theme';

export function Logo({ light = false, size = 28 }: { light?: boolean; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ fontFamily: F.black, fontSize: size, color: light ? C.white : C.red, letterSpacing: -0.5 }}>Kaleem</Text>
      <Text style={{ fontFamily: F.black, fontSize: size, color: C.yellow, letterSpacing: -0.5 }}> Petrol</Text>
    </View>
  );
}

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'dark' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const bg = variant === 'primary' ? C.yellow : variant === 'dark' ? C.ink : variant === 'danger' ? C.red : C.white;
  const fg = variant === 'dark' || variant === 'danger' ? C.white : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        {
          backgroundColor: bg,
          borderColor: variant === 'outline' ? '#555' : bg,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          paddingVertical: big ? 16 : 10,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ fontFamily: F.bold, fontSize: big ? 22 : 18, color: fg }}>{title}</Text>
      )}
    </Pressable>
  );
}

export const Card = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, style]}>{children}</View>
);

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[s.chip, on && { backgroundColor: C.yellow, borderColor: C.yellow }]}
    >
      <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.ink }}>{label}</Text>
    </Pressable>
  );
}

export const H1 = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <Text style={[{ fontFamily: F.black, fontSize: 30, color: C.ink, letterSpacing: -0.5 }, style as object]}>{children}</Text>
);

export const Body = ({ children, style }: { children: React.ReactNode; style?: object }) => (
  <Text style={[{ fontFamily: F.medium, fontSize: 16, color: C.ink }, style]}>{children}</Text>
);

export function Field({
  label,
  error,
  ...rest
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.grey, marginBottom: 4 }}>{label}</Text>
      <TextInput
        placeholderTextColor="#9a9a9a"
        accessibilityLabel={label}
        {...rest}
        style={[s.input, error ? { borderColor: C.red } : null]}
      />
      {error ? <Text style={{ fontFamily: F.medium, color: C.red, fontSize: 14, marginTop: 2 }}>{error}</Text> : null}
    </View>
  );
}

export function PasswordField(props: TextInputProps & { label: string; error?: string }) {
  const [show, setShow] = React.useState(false);
  return (
    <View>
      <Field {...props} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} />
      <Pressable
        onPress={() => setShow((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        hitSlop={8}
        style={{ position: 'absolute', right: 14, top: 33 }}
      >
        <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.link }}>{show ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  );
}

export function Banner({ tone = 'warn', children }: { tone?: 'warn' | 'error' | 'ok' | 'info'; children: React.ReactNode }) {
  const bg = { warn: '#FFF3CC', error: '#FDE3E0', ok: '#DFF3E4', info: '#E4EEF9' }[tone];
  const bd = { warn: C.yellow, error: C.red, ok: C.green, info: C.link }[tone];
  // Plain text (even when JSX splits it into several pieces) must live inside a <Text>, or Android throws.
  const plain = React.Children.toArray(children).every((c) => typeof c === 'string' || typeof c === 'number');
  return (
    <View style={{ backgroundColor: bg, borderLeftWidth: 5, borderLeftColor: bd, borderRadius: 12, padding: 12 }}>
      {plain ? <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.ink }}>{children}</Text> : children}
    </View>
  );
}

export const Divider = () => <View style={{ height: 1, backgroundColor: C.line }} />;

const s = StyleSheet.create({
  btn: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 14, ...shadow },
  chip: {
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 2,
    backgroundColor: C.white,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#bdbdbd',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontFamily: F.medium,
    color: C.ink,
    backgroundColor: C.white,
  },
});
