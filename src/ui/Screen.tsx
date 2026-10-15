import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './kit';
import { C, F } from './theme';

/** Rounded white header in the MyMcDonald's style: logo left, optional action right. */
export function TopBar({
  back,
  onBack,
  right,
  title,
  dark,
}: {
  back?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  title?: string;
  dark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8, backgroundColor: dark ? C.ink : C.white }]}>
      {back ? (
        <Pressable onPress={() => (onBack ? onBack() : router.back())} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ marginRight: 8 }}>
          <Text style={{ fontSize: 30, fontFamily: F.bold, color: dark ? C.white : C.ink }}>‹</Text>
        </Pressable>
      ) : null}
      {title ? (
        <Text style={{ fontFamily: F.bold, fontSize: 22, color: dark ? C.white : C.ink }}>{title}</Text>
      ) : (
        <Logo light={dark} />
      )}
      <View style={{ marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

export const LinkBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button">
    <Text style={{ fontFamily: F.semi, fontSize: 16, color: C.link, textDecorationLine: 'underline' }}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  bar: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
});
