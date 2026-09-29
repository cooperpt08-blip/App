import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chips } from '@/components/Segmented';
import { Body, Button, Card, colors, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { addDays, dateKey, formatDay, formatShortDay, formatTime, startOfToday } from '@/lib/schedule';
import { friendlyError, supabase } from '@/lib/supabase';

type Slot = { barber_id: string; barber_name: string; starts_at: string; ends_at: string };
const DAYS_AHEAD = 14;
const ANY = 'any';

// A customer books a time with a barber at their shop.
export default function Book() {
  const { loading: accountLoading, profile } = useAccount();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [barber, setBarber] = useState<string>(ANY);
  const [day, setDay] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.shop_id) return;
    const { data, error } = await supabase.rpc('available_slots', {
      p_shop: profile.shop_id,
      p_barber: null,
      p_from: dateKey(startOfToday()),
      p_days: DAYS_AHEAD,
    });
    setLoading(false);
    if (error) return setError(friendlyError(error));
    setSlots((data as Slot[]) ?? []);
  }, [profile?.shop_id]);

  useEffect(() => {
    load();
  }, [load]);

  const barbers = useMemo(() => {
    const seen = new Map<string, string>();
    slots.forEach((s) => seen.set(s.barber_id, s.barber_name));
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [slots]);

  const forBarber = useMemo(() => slots.filter((s) => barber === ANY || s.barber_id === barber), [slots, barber]);

  const dayList = useMemo(
    () =>
      Array.from({ length: DAYS_AHEAD }, (_, i) => {
        const d = addDays(startOfToday(), i);
        const key = dateKey(d);
        return { key, date: d, count: forBarber.filter((s) => dateKey(new Date(s.starts_at)) === key).length };
      }),
    [forBarber],
  );

  // With "Any barber", show each time once (the first barber free then).
  const times = useMemo(() => {
    if (!day) return [];
    const onDay = forBarber.filter((s) => dateKey(new Date(s.starts_at)) === day);
    const unique = new Map<string, Slot>();
    onDay.forEach((s) => {
      if (!unique.has(s.starts_at)) unique.set(s.starts_at, s);
    });
    return [...unique.values()];
  }, [forBarber, day]);

  // Jump to the first day that has openings.
  useEffect(() => {
    const first = dayList.find((d) => d.count > 0);
    setDay((current) => (current && dayList.find((d) => d.key === current)?.count ? current : (first?.key ?? null)));
    setPicked(null);
  }, [dayList]);

  async function confirm() {
    if (!picked) return;
    setBooking(true);
    setError(null);
    const { error } = await supabase.rpc('book_appointment', { p_barber: picked.barber_id, p_starts_at: picked.starts_at });
    setBooking(false);
    if (error) {
      setError(friendlyError(error));
      setPicked(null);
      load();
      return;
    }
    setBooked(picked);
  }

  if (accountLoading) return <Loading />;
  if (!profile?.shop_id) return <Redirect href="/home" />;

  if (booked) {
    return (
      <Screen>
        <Title>You’re booked!</Title>
        <Notice tone="success">
          {formatDay(new Date(booked.starts_at))} at {formatTime(booked.starts_at)} with {booked.barber_name}.
        </Notice>
        <Body muted>You’ll find it on your home screen. You can cancel there if plans change.</Body>
        <Button title="Done" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Book an appointment</Title>
      {error && <Notice tone="error">{error}</Notice>}

      {loading ? (
        <Body muted>Finding open times…</Body>
      ) : slots.length === 0 ? (
        <Notice tone="note">
          No open times in the next 2 weeks. Your barbershop may not have set its hours in Shape Up yet.
        </Notice>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Label>Barber</Label>
            <Chips
              options={[{ value: ANY, label: 'Any barber' }, ...barbers.map((b) => ({ value: b.id, label: b.name }))]}
              value={barber}
              onChange={setBarber}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Label>Day</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dayList.map((d) => {
                const on = d.key === day;
                const label = formatShortDay(d.date);
                return (
                  <Pressable
                    key={d.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: d.count === 0 }}
                    disabled={d.count === 0}
                    onPress={() => {
                      setDay(d.key);
                      setPicked(null);
                    }}
                    style={[styles.day, on && styles.on, d.count === 0 && { opacity: 0.35 }]}>
                    <Text style={[styles.dayTop, on && styles.onText]}>{label.weekday}</Text>
                    <Text style={[styles.dayBottom, on && styles.onText]}>{label.day}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {day && (
            <View style={{ gap: 8 }}>
              <Label>Time</Label>
              <View style={styles.grid}>
                {times.map((s) => {
                  const on = picked?.starts_at === s.starts_at && picked.barber_id === s.barber_id;
                  return (
                    <Pressable
                      key={`${s.barber_id}-${s.starts_at}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setPicked(s)}
                      style={[styles.time, on && styles.on]}>
                      <Text style={[styles.timeText, on && styles.onText]}>{formatTime(s.starts_at)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {picked && (
            <Card>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                {formatDay(new Date(picked.starts_at))} at {formatTime(picked.starts_at)}
              </Text>
              <Body muted>With {picked.barber_name}</Body>
              <Button title="Book this time" onPress={confirm} loading={booking} />
            </Card>
          )}
        </>
      )}

      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  day: {
    width: 76,
    minHeight: 68,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTop: { fontSize: 14, fontWeight: '600', color: colors.muted },
  dayBottom: { fontSize: 15, fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: {
    minWidth: 100,
    minHeight: 52,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: { fontSize: 17, fontWeight: '600', color: colors.text },
  on: { backgroundColor: colors.ink, borderColor: colors.ink },
  onText: { color: colors.inkText },
});
