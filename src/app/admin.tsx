import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LedgerError, computeMetrics } from '@/core/logic';
import { adminUpdateConfig, advanceClock, now, resetDemo, useStore } from '@/core/store';
import type { Service } from '@/types';
import { Banner, Btn, Card, Chip, Field } from '@/ui/kit';
import { TopBar } from '@/ui/Screen';
import { StaffGuard, leaveStaff } from '@/ui/StaffGuard';
import { C, F, SERVICE_ICON, formatDate } from '@/ui/theme';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 16, padding: 14 }}>
      <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 30, color: tone ?? C.ink }}>{value}</Text>
    </View>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.ink }}>{label}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{value.toLocaleString()}</Text>
      </View>
      <View style={{ height: 14, backgroundColor: '#eee', borderRadius: 7, overflow: 'hidden' }}>
        <View style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%`, height: '100%', backgroundColor: color, borderRadius: 7 }} />
      </View>
    </View>
  );
}

export default function AdminPage() {
  return (
    <StaffGuard role="admin">
      <Admin />
    </StaffGuard>
  );
}

function Admin() {
  const { db } = useStore();
  const t = now();
  const m = computeMetrics(db, t);
  const cfg = db.config;
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [catalog, setCatalog] = useState<{ id: Service['id']; points: string; price: string }[]>(
    cfg.catalog.map((s) => ({ id: s.id, points: String(s.points), price: String(s.price) })),
  );

  const run = (fn: () => void, ok: string) => {
    try { fn(); setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'error', text: e instanceof LedgerError ? e.message : 'Could not save.' }); }
  };

  const saveCatalog = () =>
    run(() => {
      const next = cfg.catalog.map((s) => {
        const row = catalog.find((c) => c.id === s.id)!;
        return { ...s, points: Number(row.points), price: Number(row.price) };
      });
      adminUpdateConfig({ catalog: next });
    }, 'Catalogue values saved. Customers see them on their next sync.');

  const max = Math.max(m.issued, 1);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar back onBack={leaveStaff} title="Admin Dashboard" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {msg ? <Banner tone={msg.tone}>{msg.text}</Banner> : null}

        <Text style={{ fontFamily: F.black, fontSize: 24, color: C.ink }}>Overview</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="Total Active Users" value={m.activeUsers} tone={C.green} />
          <Stat label="Registered members" value={m.totalCustomers} />
        </View>

        <Card>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.ink, marginBottom: 10 }}>Points Issued vs Redeemed</Text>
          <Bar label="Issued (earned)" value={m.issued} max={max} color={C.green} />
          <Bar label="Redeemed" value={m.redeemed} max={max} color={C.red} />
          <Bar label="Expired" value={m.expired} max={max} color="#9a9a9a" />
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>Redemptions: {m.redemptionsByService.map((r) => `${r.service.name} ${r.count}`).join('  ·  ')}</Text>
        </Card>

        <Card>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.ink, marginBottom: 6 }}>Liability Ledger</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>Outstanding points owed to customers (1 point = Rs. 1)</Text>
          <Text style={{ fontFamily: F.black, fontSize: 38, color: C.red }}>Rs. {m.outstanding.toLocaleString()}</Text>
          <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.ink }}>
            Expiring within 30 days: {m.expiringIn30.toLocaleString()} pts
          </Text>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey, marginTop: 4 }}>
            Check: issued {m.issued} = redeemed {m.redeemed} + expired {m.expired} + outstanding {m.outstanding}
          </Text>
          <View style={{ marginTop: 10 }}>
            {db.customers.map((c) => {
              const pts = computeMetrics({ ...db, customers: [c] }, t).outstanding;
              return (
                <View key={c.uuid} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }}>{c.name}</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{pts} pts</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Text style={{ fontFamily: F.black, fontSize: 24, color: C.ink, marginTop: 6 }}>Configuration</Text>
        <Card>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>Rule A: activity window</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey, marginBottom: 8 }}>Points stay valid if the customer fuels at least once in this many days (45 to 60).</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[45, 50, 55, 60].map((d) => (
              <Chip key={d} label={`${d} days`} on={cfg.activityWindowDays === d} onPress={() => run(() => adminUpdateConfig({ activityWindowDays: d }), `Rule A set to ${d} days.`)} />
            ))}
          </View>
          <View style={{ height: 14 }} />
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>Rule B: aspirational window</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey, marginBottom: 8 }}>Hard expiry from the date points were issued.</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[180, 365].map((d) => (
              <Chip key={d} label={d === 180 ? '180 days (6 months)' : '365 days (1 year)'} on={cfg.hardExpiryDays === d} onPress={() => run(() => adminUpdateConfig({ hardExpiryDays: d }), `Rule B set to ${d} days.`)} />
            ))}
          </View>
        </Card>

        <Card>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink, marginBottom: 8 }}>Service catalogue values</Text>
          {cfg.catalog.map((s) => {
            const row = catalog.find((c) => c.id === s.id)!;
            const upd = (patch: Partial<typeof row>) => setCatalog((cur) => cur.map((c) => (c.id === s.id ? { ...c, ...patch } : c)));
            return (
              <View key={s.id} style={{ marginBottom: 6 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>{SERVICE_ICON[s.id]} {s.name}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Field label="Points" value={row.points} onChangeText={(v) => upd({ points: v.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
                  <View style={{ flex: 1 }}><Field label="Price (Rs.)" value={row.price} onChangeText={(v) => upd({ price: v.replace(/\D/g, '') })} keyboardType="number-pad" /></View>
                </View>
              </View>
            );
          })}
          <Btn title="Save catalogue" onPress={saveCatalog} />
        </Card>

        <Card>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>Demo tools</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey, marginBottom: 8 }}>
            Prototype only. Today in the app: {formatDate(t)}. Move the clock forward to watch points expire under Rule A and Rule B without waiting.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[1, 7, 30, 60].map((d) => (
              <Btn key={d} title={`+${d} day${d > 1 ? 's' : ''}`} variant="outline" onPress={() => { void advanceClock(d); setMsg({ tone: 'ok', text: `Clock moved forward ${d} day(s). Expiry rules re-applied.` }); }} />
            ))}
          </View>
          <View style={{ height: 10 }} />
          <Btn
            title={confirmReset ? 'Tap again to erase everything and restore samples' : 'Reset demo data'}
            variant="danger"
            onPress={() => {
              if (!confirmReset) return setConfirmReset(true);
              setConfirmReset(false);
              void resetDemo().then(() => setMsg({ tone: 'ok', text: 'Demo data restored.' }));
            }}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
