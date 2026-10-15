import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LedgerError } from '@/core/logic';
import { createRewardQr, now, refreshCache, setSession, useStore } from '@/core/store';
import type { CustomerCache, RewardToken, Service, Txn } from '@/types';
import { Banner, Btn, Card, H1 } from '@/ui/kit';
import { TopBar } from '@/ui/Screen';
import { C, F, SERVICE_ICON, formatDate, formatDateTime, formatMobile, shadow } from '@/ui/theme';

type Tab = 'home' | 'rewards' | 'history';

export default function CustomerScreen() {
  const { session, cache } = useStore();
  const uuid = session?.role === 'customer' ? session.uuid : null;
  const data = uuid ? cache[uuid] : undefined;
  const [tab, setTab] = useState<Tab>('home');
  const [token, setToken] = useState<RewardToken | null>(null);
  const insets = useSafeAreaInsets();

  // Background sync: pulls the central ledger into the local cache. The pass renders from cache first.
  useEffect(() => {
    if (!uuid) return;
    void refreshCache(uuid);
    const id = setInterval(() => void refreshCache(uuid), 3000);
    return () => clearInterval(id);
  }, [uuid]);

  if (!uuid) return <Redirect href="/" />;
  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.red} size="large" />
      </View>
    );
  }

  const signOut = () => {
    setSession(null);
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar
        right={
          <View style={s.pill}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>★ {data.balance} pts</Text>
          </View>
        }
      />
      {tab === 'home' && (
        <HomeTab data={data} goRewards={() => setTab('rewards')} goHistory={() => setTab('history')} signOut={signOut} />
      )}
      {tab === 'rewards' && <RewardsTab data={data} onToken={setToken} />}
      {tab === 'history' && <HistoryTab data={data} />}

      <View style={[s.nav, { paddingBottom: insets.bottom + 6 }]}>
        {(
          [
            ['home', '🏠', 'Pass'],
            ['rewards', '🎁', 'Rewards'],
            ['history', '🧾', 'History'],
          ] as [Tab, string, string][]
        ).map(([k, icon, label]) => (
          <Pressable key={k} style={s.navItem} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityLabel={label}>
            <Text style={{ fontSize: 24, opacity: tab === k ? 1 : 0.45 }}>{icon}</Text>
            <Text style={{ fontFamily: tab === k ? F.black : F.semi, fontSize: 13, color: tab === k ? C.red : C.grey }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {token ? <RewardQrModal token={token} data={data} onClose={() => setToken(null)} /> : null}
    </View>
  );
}

function expiryLine(days: number) {
  return days <= 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`;
}

function HomeTab({
  data,
  goRewards,
  goHistory,
  signOut,
}: {
  data: CustomerCache;
  goRewards: () => void;
  goHistory: () => void;
  signOut: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? data.ledger : data.ledger.slice(0, 3);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
      {/* Top-anchored Digital Pass */}
      <LinearGradient colors={[C.red, C.redDark]} style={s.pass}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.yellow }}>DIGITAL PASS</Text>
            <Text style={{ fontFamily: F.black, fontSize: 26, color: '#fff' }} numberOfLines={1}>{data.name}</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 14, color: '#fff' }}>
              {formatMobile(data.mobile)}{data.vehicle ? `  |  ${data.vehicle}` : ''}
            </Text>
          </View>
        </View>
        <View style={s.qrBox} accessible accessibilityLabel="Your membership QR code">
          <QRCode value={data.uuid} size={176} color="#111" backgroundColor="#fff" />
        </View>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: '#fff', textAlign: 'center' }}>Show this QR to the attendant when you fuel</Text>
        <View style={s.balRow}>
          <Text style={{ fontFamily: F.black, fontSize: 44, color: C.yellow, lineHeight: 48 }}>{data.balance}</Text>
          <Text style={{ fontFamily: F.bold, fontSize: 18, color: '#fff', marginLeft: 6, marginBottom: 6 }}>points  =  Rs. {data.balance}</Text>
        </View>
      </LinearGradient>

      {/* Urgency UI directly adjacent to the pass */}
      {data.expiring ? (
        <Banner tone="warn">
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ink }}>
            ⏰ {data.expiring.points} points expiring {expiryLine(data.expiring.days)}
          </Text>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.ink }}>Redeem them, or fuel up to refresh your validity.</Text>
        </Banner>
      ) : data.balance === 0 ? (
        <Banner tone="info">Fuel up and show your QR to start earning. 1 litre = 1 point.</Banner>
      ) : (
        <Banner tone="ok">{`✅ All your points are valid. Fuel up within ${data.activityWindowDays} days to keep them that way.`}</Banner>
      )}

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.ink }}>Rewards Ledger</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 12, color: C.grey }}>Synced {formatDateTime(data.syncedAt)}</Text>
        </View>
        {data.ledger.length === 0 ? (
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey, marginTop: 8 }}>
            No points yet. Fuel up and show your QR to start earning.
          </Text>
        ) : (
          rows.map((b) => (
            <View key={b.id} style={s.ledgerRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.ink }}>{b.remaining} pts</Text>
                <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>Earned {formatDate(b.issuedAt)}</Text>
              </View>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: b.expiresAt - data.syncedAt <= 7 * 86400000 ? C.red : C.grey }}>
                Expires {formatDate(b.expiresAt)}
              </Text>
            </View>
          ))
        )}
        {data.ledger.length > 3 ? (
          <Pressable onPress={() => setShowAll((v) => !v)} style={{ paddingTop: 10 }} accessibilityRole="button">
            <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.link, textDecorationLine: 'underline' }}>
              {showAll ? 'Show fewer' : `Show all ${data.ledger.length} point batches`}
            </Text>
          </Pressable>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Btn title="Redeem rewards" onPress={goRewards} style={{ flex: 1 }} />
        <Btn title="History" onPress={goHistory} variant="outline" style={{ flex: 1 }} />
      </View>
      <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out" style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.link }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function RewardsTab({ data, onToken }: { data: CustomerCache; onToken: (t: RewardToken) => void }) {
  const [err, setErr] = useState('');
  const pick = (svc: Service) => {
    try {
      onToken(createRewardQr(data.uuid, svc.id));
      setErr('');
    } catch (e) {
      setErr(e instanceof LedgerError ? e.message : 'Could not create the reward code.');
    }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
      <H1>Redeem for points</H1>
      <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey, marginBottom: 12 }}>
        You have {data.balance} points. Tap an unlocked reward to get a 5-minute QR for the redemption desk.
      </Text>
      {err ? <View style={{ marginBottom: 10 }}><Banner tone="error">{err}</Banner></View> : null}
      <View style={s.grid}>
        {data.catalog.map((svc) => {
          const unlocked = data.balance >= svc.points;
          return (
            <View key={svc.id} style={[s.reward, !unlocked && { backgroundColor: '#F7F7F7' }]}>
              <View style={[s.ring, unlocked ? { borderColor: C.yellow } : { borderColor: '#D5D5D5' }]}>
                <Text style={{ fontSize: 46, opacity: unlocked ? 1 : 0.28 }}>{SERVICE_ICON[svc.id]}</Text>
              </View>
              {!unlocked ? <View style={s.tag}><Text style={s.tagText}>Locked</Text></View> : null}
              <View style={[s.ptsPill, !unlocked && { borderColor: '#B0B0B0' }]}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: unlocked ? C.ink : '#8a8a8a' }}>{svc.points} pts</Text>
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: 16, textAlign: 'center', color: unlocked ? C.ink : '#8a8a8a', minHeight: 40 }}>{svc.name}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>Worth Rs. {svc.price}</Text>
              {unlocked ? (
                <Btn title="Redeem" onPress={() => pick(svc)} style={{ marginTop: 8, alignSelf: 'stretch' }} />
              ) : (
                <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.red, marginTop: 8 }}>
                  Need {svc.points - data.balance} more pts
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function HistoryTab({ data }: { data: CustomerCache }) {
  return (
    <FlatList
      data={data.txns}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ marginBottom: 4 }}>
          <H1>History</H1>
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.grey }}>Green = earned. Red = redeemed. Grey = expired.</Text>
        </View>
      }
      ListEmptyComponent={<Text style={{ fontFamily: F.medium, color: C.grey, marginTop: 12 }}>No transactions yet.</Text>}
      renderItem={({ item }) => <TxnRow t={item} />}
    />
  );
}

function TxnRow({ t }: { t: Txn }) {
  const color = t.type === 'earn' ? C.green : t.type === 'redeem' ? C.red : C.grey;
  const sign = t.type === 'earn' ? '+' : '-';
  return (
    <View style={s.txn}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.ink }}>{t.desc}</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.grey }}>{formatDateTime(t.ts)}</Text>
      </View>
      <Text style={{ fontFamily: F.black, fontSize: 20, color }}>{sign}{t.points}</Text>
    </View>
  );
}

function RewardQrModal({ token, data, onClose }: { token: RewardToken; data: CustomerCache; onClose: () => void }) {
  const { db } = useStore();
  const [tick, setTick] = useState(now());
  useEffect(() => {
    const id = setInterval(() => setTick(now()), 500);
    return () => clearInterval(id);
  }, []);
  const live = db.tokens.find((t) => t.token === token.token) ?? token;
  const svc = data.catalog.find((x) => x.id === token.serviceId);
  const left = Math.max(0, live.expiresAt - tick);
  const expired = !live.used && left <= 0;
  const mm = String(Math.floor(left / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.sheet}>
          <Text style={{ fontFamily: F.black, fontSize: 24, color: C.ink, textAlign: 'center' }}>{svc?.name}</Text>
          {live.used ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
              <Text style={{ fontSize: 64 }}>✅</Text>
              <Text style={{ fontFamily: F.black, fontSize: 26, color: C.green }}>Redeemed</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 16, color: C.grey, textAlign: 'center' }}>
                {live.points} points were used. Enjoy your service!
              </Text>
            </View>
          ) : expired ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
              <Text style={{ fontSize: 56 }}>⌛</Text>
              <Text style={{ fontFamily: F.black, fontSize: 24, color: C.red }}>Code expired</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 16, color: C.grey, textAlign: 'center' }}>
                Reward codes last 5 minutes. Your points were not used. Generate a new one when you are at the desk.
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 14 }}>
              <View style={s.qrFrame}>
                <QRCode value={token.token} size={200} color="#111" backgroundColor="#fff" />
              </View>
              <Text style={{ fontFamily: F.black, fontSize: 34, color: left < 60000 ? C.red : C.ink }}>{mm}:{ss}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.grey, textAlign: 'center' }}>
                Show this single-use code at the Redemption Desk.{'\n'}{live.points} points will be deducted when it is scanned.
              </Text>
            </View>
          )}
          <Btn title={live.used || expired ? 'Done' : 'Close'} onPress={onClose} variant={live.used || expired ? 'primary' : 'outline'} big />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  pill: { backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 1 },
  pass: { borderRadius: 24, padding: 18, gap: 12, ...shadow },
  qrBox: { alignSelf: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 20, borderWidth: 4, borderColor: C.yellow },
  balRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 },
  nav: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
  navItem: { flex: 1, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  reward: { width: '47.5%', backgroundColor: '#fff', borderRadius: 16, padding: 12, alignItems: 'center', gap: 4, ...shadow },
  ring: { width: 104, height: 104, borderRadius: 52, borderWidth: 4, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ptsPill: { borderWidth: 2.5, borderColor: '#555', borderRadius: 999, paddingHorizontal: 12, marginTop: 6, backgroundColor: '#fff' },
  tag: { position: 'absolute', top: 54, backgroundColor: '#222', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 1 },
  tagText: { color: '#fff', fontFamily: F.bold, fontSize: 13 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 12, ...shadow },
  dot: { width: 10, height: 44, borderRadius: 5 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 8 },
  qrFrame: { padding: 14, borderWidth: 4, borderColor: C.yellow, borderRadius: 20 },
});
