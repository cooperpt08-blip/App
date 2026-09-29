import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, colors, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Report = {
  new_clients: number;
  total_clients: number;
  cut_cards: number;
  recommendations: number;
  bookings_made: number;
  appointments_done: number;
  no_shows: number;
  cancellations: number;
  by_barber: { name: string; done: number }[];
};

const METRICS: { key: keyof Omit<Report, 'by_barber' | 'total_clients'>; label: string; lowerIsBetter?: boolean }[] = [
  { key: 'new_clients', label: 'New clients' },
  { key: 'appointments_done', label: 'Cuts done' },
  { key: 'bookings_made', label: 'Bookings made' },
  { key: 'cut_cards', label: 'Cut cards received' },
  { key: 'recommendations', label: 'AI recommendations' },
  { key: 'no_shows', label: 'No-shows', lowerIsBetter: true },
  { key: 'cancellations', label: 'Cancellations', lowerIsBetter: true },
];

function monthStart(offset: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// A shop's month at a glance, compared with the month before.
export default function MonthlyReport() {
  const { loading: accountLoading, membership } = useAccount();
  const [offset, setOffset] = useState(0); // 0 = this month, -1 = last month...
  const [current, setCurrent] = useState<Report | null>(null);
  const [previous, setPrevious] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [a, b] = await Promise.all([
      supabase.rpc('shop_report', { p_shop: membership.shop_id, p_month: isoDay(monthStart(offset)) }),
      supabase.rpc('shop_report', { p_shop: membership.shop_id, p_month: isoDay(monthStart(offset - 1)) }),
    ]);
    if (a.error || b.error) return setError(friendlyError(a.error ?? b.error));
    setError(null);
    setCurrent(a.data as Report);
    setPrevious(b.data as Report);
  }, [membership, offset]);

  useEffect(() => {
    setCurrent(null);
    load();
  }, [load]);

  if (accountLoading) return <Loading />;
  if (!membership) return <Redirect href="/" />;

  const monthName = monthStart(offset).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prevName = monthStart(offset - 1).toLocaleDateString(undefined, { month: 'long' });

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => router.back()} />
      <Title>Monthly report</Title>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 64 }}>
          <Button title="‹" variant="secondary" onPress={() => setOffset((o) => o - 1)} />
        </View>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text }}>{monthName}</Text>
        <View style={{ width: 64 }}>
          <Button title="›" variant="secondary" onPress={() => setOffset((o) => o + 1)} disabled={offset >= 0} />
        </View>
      </View>

      {error && <Notice tone="error">{error}</Notice>}
      {!current || !previous ? (
        <Body muted>Loading…</Body>
      ) : (
        <>
          <View style={styles.grid}>
            {METRICS.map((m) => {
              const now = current[m.key];
              const before = previous[m.key];
              const diff = now - before;
              const good = m.lowerIsBetter ? diff < 0 : diff > 0;
              return (
                <View key={m.key} style={styles.tile}>
                  <Text style={styles.number}>{now}</Text>
                  <Text style={styles.label}>{m.label}</Text>
                  <Text style={{ color: diff === 0 ? colors.muted : good ? colors.good : colors.danger, fontSize: 13 }}>
                    {diff === 0 ? `Same as ${prevName}` : `${diff > 0 ? '+' : ''}${diff} vs ${prevName}`}
                  </Text>
                </View>
              );
            })}
          </View>

          <Card>
            <Label>Clients linked to your shop</Label>
            <Text style={styles.number}>{current.total_clients}</Text>
            <Body muted>Everyone who has scanned your QR code, as of today.</Body>
          </Card>

          {current.by_barber.length > 0 && (
            <Card>
              <Label>Cuts done by barber</Label>
              {current.by_barber.map((b) => (
                <View key={b.name} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, alignItems: 'center' }}>
                  <Text style={{ fontSize: 17, color: colors.text }}>{b.name}</Text>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }}>{b.done}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 16,
    gap: 2,
  },
  number: { fontSize: 32, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
});
