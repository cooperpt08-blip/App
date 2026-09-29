import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, Card, colors, Label, Loading, Notice, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Overview = {
  totals: {
    shops: number;
    barbers: number;
    customers: number;
    customers_linked: number;
    new_accounts_month: number;
    recommendations_month: number;
    ai_cost_month: number;
    ai_cost_all_time: number;
    cut_cards_month: number;
    bookings_month: number;
  };
  shops: {
    id: string;
    name: string;
    address: string;
    created_at: string;
    owner_email: string | null;
    pending_owner_email?: string | null;
    team: number;
    clients: number;
    recommendations_month: number;
    ai_cost_month: number;
    cut_cards_month: number;
    bookings_month: number;
  }[];
};

const money = (n: number) => `$${Number(n).toFixed(2)}`;

// Your view of the whole business: every shop, usage, and AI spending this month.
export default function Admin() {
  const { loading, isAdmin } = useAccount();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const { data, error } = await supabase.rpc('admin_overview', { p_month: month });
    if (error) return setError(friendlyError(error));
    setError(null);
    setData(data as Overview);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  if (loading) return <Loading />;
  if (!isAdmin) return <Redirect href="/" />;

  const t = data?.totals;
  const tiles = t
    ? [
        { label: 'Shops', value: t.shops },
        { label: 'Barbers', value: t.barbers },
        { label: 'Customers', value: `${t.customers}`, sub: `${t.customers_linked} linked to a shop` },
        { label: 'New accounts', value: t.new_accounts_month, sub: 'this month' },
        { label: 'Recommendations', value: t.recommendations_month, sub: 'this month' },
        { label: 'AI cost', value: money(t.ai_cost_month), sub: `this month · ${money(t.ai_cost_all_time)} all time` },
        { label: 'Cut cards', value: t.cut_cards_month, sub: 'this month' },
        { label: 'Bookings', value: t.bookings_month, sub: 'this month' },
      ]
    : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <View style={styles.inner}>
          <Button title="‹ Back" variant="secondary" onPress={() => router.back()} />
          <Title>Shape Up admin</Title>
          <Body muted>Pull down to refresh. AI cost counts real recommendations only (not demo results).</Body>
          {error && <Notice tone="error">{error}</Notice>}

          <View style={styles.grid}>
            {tiles.map((tile) => (
              <View key={tile.label} style={styles.tile}>
                <Text style={styles.number}>{tile.value}</Text>
                <Text style={styles.label}>{tile.label}</Text>
                {tile.sub ? <Text style={styles.sub}>{tile.sub}</Text> : null}
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Shops</Text>
          {data?.shops.length === 0 && <Body muted>No shops yet.</Body>}
          {data?.shops.map((s) => (
            <Card key={s.id}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text }}>{s.name}</Text>
                {s.address ? <Body muted>{s.address}</Body> : null}
                <Body muted>
                  {s.owner_email ?? (s.pending_owner_email ? `No owner yet: waiting for ${s.pending_owner_email}` : 'No owner')} · joined {new Date(s.created_at).toLocaleDateString()}
                </Body>
              </View>
              <View style={styles.statRow}>
                {[
                  ['Team', s.team],
                  ['Clients', s.clients],
                  ['Recs', s.recommendations_month],
                  ['AI cost', money(s.ai_cost_month)],
                  ['Cut cards', s.cut_cards_month],
                  ['Bookings', s.bookings_month],
                ].map(([label, value]) => (
                  <View key={String(label)} style={styles.stat}>
                    <Text style={styles.statValue}>{value}</Text>
                    <Label>{String(label)}</Label>
                  </View>
                ))}
              </View>
              <Body muted>Recs, AI cost, cut cards and bookings are for this month.</Body>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24 },
  inner: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 160, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16, gap: 2 },
  number: { fontSize: 28, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 90, backgroundColor: colors.soft, borderRadius: 12, padding: 10, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
