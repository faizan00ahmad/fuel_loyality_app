import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Btn } from './kit';
import { C, F } from './theme';

export interface DemoScan {
  label: string;
  sub?: string;
  value: string;
}

/**
 * Live QR scanner for staff devices. One phone cannot scan its own screen, so a
 * "Demo scan" list stands in for a second device (clearly labelled as demo only).
 */
export function Scanner({
  onScan,
  hint,
  demo,
  demoTitle,
}: {
  onScan: (data: string) => void;
  hint: string;
  demo: DemoScan[];
  demoTitle: string;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const lock = useRef(0);
  const [showDemo, setShowDemo] = useState(false);

  const handle = (data: string) => {
    const t = Date.now();
    if (t - lock.current < 1500) return; // debounce repeated frames
    lock.current = t;
    onScan(data.trim());
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={s.camWrap}>
        {perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => handle(data)}
          />
        ) : (
          <View style={s.noCam}>
            <Text style={s.noCamText}>
              {perm && !perm.canAskAgain ? 'Camera access is blocked. Use Demo scan below.' : 'Camera permission needed to scan QR codes.'}
            </Text>
            {perm?.canAskAgain !== false ? <Btn title="Allow camera" onPress={() => void requestPerm()} /> : null}
          </View>
        )}
        <View pointerEvents="none" style={s.frame} />
        <Text style={s.hint}>{hint}</Text>
      </View>

      <Pressable onPress={() => setShowDemo((v) => !v)} style={s.demoToggle} accessibilityRole="button">
        <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>
          {showDemo ? '▾' : '▸'} Demo scan (no second phone needed)
        </Text>
      </Pressable>
      {showDemo ? (
        <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>{demoTitle}</Text>
          {demo.length === 0 ? <Text style={{ fontFamily: F.medium, color: C.grey }}>Nothing to scan yet.</Text> : null}
          {demo.map((d) => (
            <Pressable key={d.value} onPress={() => onScan(d.value)} style={s.demoRow} accessibilityRole="button">
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.ink }}>{d.label}</Text>
              {d.sub ? <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>{d.sub}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  camWrap: { flex: 1, backgroundColor: '#000', minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  noCam: { padding: 24, alignItems: 'center', gap: 14 },
  noCamText: { fontFamily: F.semi, fontSize: 17, color: '#fff', textAlign: 'center' },
  frame: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderWidth: 4,
    borderColor: C.yellow,
    borderRadius: 24,
  },
  hint: {
    position: 'absolute',
    bottom: 14,
    fontFamily: F.bold,
    fontSize: 18,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 999,
  },
  demoToggle: { padding: 14, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line },
  demoRow: { backgroundColor: C.white, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: C.line },
});
