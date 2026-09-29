import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Chips, Segmented } from '@/components/Segmented';
import { TimePicker } from '@/components/TimePicker';
import { Body, Button, Card, colors, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { profilePhotoUrls } from '@/lib/photos';
import {
  addDays,
  dateKey,
  formatClock,
  formatDay,
  formatShortDay,
  formatTime,
  startOfToday,
  WEEKDAYS,
} from '@/lib/schedule';
import { friendlyError, supabase } from '@/lib/supabase';

type Appointment = {
  appointment_id: string;
  barber_id: string;
  barber_name: string | null;
  customer_id: string;
  customer_name: string;
  customer_has_photo: boolean;
  starts_at: string;
  ends_at: string;
  status: 'booked' | 'cancelled' | 'done' | 'no_show';
  cancelled_by: 'customer' | 'shop' | null;
};
type Hours = { id: string; weekday: number; start_time: string; end_time: string };
type Member = { user_id: string; display_name: string; role: 'owner' | 'barber' };

const STATUS: Record<Appointment['status'], { label: string; bg: string; fg: string }> = {
  booked: { label: 'Booked', bg: colors.soft, fg: colors.text },
  done: { label: 'Done', bg: colors.goodSoft, fg: colors.good },
  no_show: { label: 'No-show', bg: colors.noteSoft, fg: colors.note },
  cancelled: { label: 'Cancelled', bg: colors.dangerSoft, fg: colors.danger },
};

export default function Schedule() {
  const [view, setView] = useState<'appointments' | 'hours'>('appointments');
  return (
    <Screen>
      <Title>Schedule</Title>
      <Segmented
        options={[
          { value: 'appointments', label: 'Appointments' },
          { value: 'hours', label: 'Hours' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'appointments' ? <AppointmentsView /> : <HoursView />}
    </Screen>
  );
}

// ============ Appointments ============

function AppointmentsView() {
  const { session, membership } = useAccount();
  const myId = session?.user.id ?? '';
  const [filter, setFilter] = useState<'mine' | 'shop'>('mine');
  const [items, setItems] = useState<Appointment[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const from = startOfToday();
    const { data, error } = await supabase.rpc('shop_appointments', {
      p_shop: membership.shop_id,
      p_from: from.toISOString(),
      p_to: addDays(from, 15).toISOString(),
    });
    if (error) return setError(friendlyError(error));
    setError(null);
    const list = (data as Appointment[]) ?? [];
    setItems(list);
    const withPhoto = [...new Set(list.filter((a) => a.customer_has_photo).map((a) => a.customer_id))];
    setPhotos(await profilePhotoUrls(withPhoto));
  }, [membership]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // New bookings and cancellations show up without refreshing.
  useEffect(() => {
    if (!membership) return;
    const channel = supabase
      .channel(`appointments-${membership.shop_id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `shop_id=eq.${membership.shop_id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  const days = useMemo(() => {
    const shown = items.filter((a) => filter === 'shop' || a.barber_id === myId);
    const groups = new Map<string, Appointment[]>();
    for (const a of shown) {
      const key = dateKey(new Date(a.starts_at));
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    return [...groups.entries()];
  }, [items, filter, myId]);

  function setStatus(a: Appointment, status: Appointment['status']) {
    const apply = async () => {
      const { error } = await supabase
        .from('appointments')
        .update({ status, cancelled_by: status === 'cancelled' ? 'shop' : null })
        .eq('id', a.appointment_id);
      if (error) setError(friendlyError(error));
      load();
    };
    if (status === 'cancelled') {
      Alert.alert(`Cancel ${a.customer_name}’s appointment?`, 'The time opens up for someone else to book. Let the client know.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel appointment', style: 'destructive', onPress: apply },
      ]);
    } else {
      apply();
    }
  }

  return (
    <>
      <Segmented
        options={[
          { value: 'mine', label: 'Just mine' },
          { value: 'shop', label: 'Whole shop' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {days.length === 0 && (
        <Body muted>No appointments in the next 2 weeks. Set your hours in the “Hours” tab so clients can book.</Body>
      )}
      {days.map(([key, list]) => (
        <View key={key} style={{ gap: 10 }}>
          <Text style={styles.dayHeading}>{formatDay(new Date(list[0].starts_at))}</Text>
          {list.map((a) => {
            const s = STATUS[a.status];
            return (
              <Card key={a.appointment_id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 84 }}>
                    <Text style={styles.time}>{formatTime(a.starts_at)}</Text>
                    <Text style={{ color: colors.muted }}>to {formatTime(a.ends_at)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/client/${a.customer_id}`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <Avatar name={a.customer_name} url={photos[a.customer_id]} size={48} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name}>{a.customer_name}</Text>
                      {filter === 'shop' && a.barber_name ? (
                        <Text style={{ color: colors.muted }}>with {a.barber_name}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <View style={[styles.pill, { backgroundColor: s.bg }]}>
                    <Text style={{ color: s.fg, fontWeight: '600' }}>
                      {a.status === 'cancelled' && a.cancelled_by === 'customer' ? 'Client cancelled' : s.label}
                    </Text>
                  </View>
                </View>
                {a.status === 'booked' && (
                  <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                      <Button title="Done" onPress={() => setStatus(a, 'done')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="No-show" variant="secondary" onPress={() => setStatus(a, 'no_show')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Cancel" variant="danger" onPress={() => setStatus(a, 'cancelled')} />
                    </View>
                  </View>
                )}
                {(a.status === 'done' || a.status === 'no_show') && (
                  <Button title="Undo" variant="secondary" onPress={() => setStatus(a, 'booked')} />
                )}
              </Card>
            );
          })}
        </View>
      ))}
    </>
  );
}

// ============ Hours ============

function HoursView() {
  const { session, membership } = useAccount();
  const isOwner = membership?.role === 'owner';
  const [team, setTeam] = useState<Member[]>([]);
  const [barberId, setBarberId] = useState<string>(session?.user.id ?? '');
  const [hours, setHours] = useState<Hours[]>([]);
  const [daysOff, setDaysOff] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ weekday: number; start?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!membership) return;
    supabase
      .from('shop_members')
      .select('user_id, display_name, role')
      .eq('shop_id', membership.shop_id)
      .order('joined_at')
      .then(({ data }) => setTeam((data as Member[]) ?? []));
  }, [membership]);

  const load = useCallback(async () => {
    if (!barberId) return;
    const [{ data: h, error: e1 }, { data: off, error: e2 }] = await Promise.all([
      supabase.from('barber_hours').select('id, weekday, start_time, end_time').eq('barber_id', barberId).order('start_time'),
      supabase.from('barber_days_off').select('day').eq('barber_id', barberId).gte('day', dateKey(startOfToday())),
    ]);
    if (e1 || e2) return setError(friendlyError(e1 ?? e2));
    setError(null);
    setHours((h as Hours[]) ?? []);
    setDaysOff(new Set(((off as { day: string }[]) ?? []).map((d) => d.day)));
  }, [barberId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addBlock(weekday: number, start: string, end: string) {
    setAdding(null);
    const { error } = await supabase
      .from('barber_hours')
      .insert({ shop_id: membership!.shop_id, barber_id: barberId, weekday, start_time: start, end_time: end });
    if (error) setError(friendlyError(error));
    load();
  }

  async function removeBlock(id: string) {
    const { error } = await supabase.from('barber_hours').delete().eq('id', id);
    if (error) setError(friendlyError(error));
    load();
  }

  async function toggleDayOff(day: string) {
    const off = daysOff.has(day);
    const { error } = off
      ? await supabase.from('barber_days_off').delete().eq('barber_id', barberId).eq('day', day)
      : await supabase.from('barber_days_off').insert({ shop_id: membership!.shop_id, barber_id: barberId, day });
    if (error) setError(friendlyError(error));
    load();
  }

  const next30 = Array.from({ length: 30 }, (_, i) => addDays(startOfToday(), i));

  return (
    <>
      {isOwner && team.length > 1 && (
        <View style={{ gap: 8 }}>
          <Label>Whose hours</Label>
          <Chips
            options={team.map((m) => ({ value: m.user_id, label: m.user_id === session?.user.id ? 'Mine' : m.display_name }))}
            value={barberId}
            onChange={setBarberId}
          />
        </View>
      )}
      <Body muted>Clients can book any open time inside these hours. Changes apply right away.</Body>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <Label>Weekly hours</Label>
        {WEEKDAYS.map(({ day, name }) => {
          const blocks = hours.filter((h) => h.weekday === day);
          return (
            <View key={day} style={styles.weekRow}>
              <Text style={styles.weekday}>{name}</Text>
              <View style={{ flex: 1, gap: 8 }}>
                {blocks.length === 0 && <Text style={{ color: colors.muted, fontSize: 16 }}>Not working</Text>}
                {blocks.map((b) => (
                  <View key={b.id} style={styles.block}>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>
                      {formatClock(b.start_time)} – {formatClock(b.end_time)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${name} hours`}
                      onPress={() => removeBlock(b.id)}
                      style={styles.remove}>
                      <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 15 }}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable accessibilityRole="button" onPress={() => setAdding({ weekday: day })} style={styles.add}>
                  <Text style={{ fontWeight: '600', fontSize: 15 }}>+ Add hours</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </Card>

      <Card>
        <Label>Days off (next 30 days)</Label>
        <Body muted>Tap a day to take it off. Tap again to work it. Existing bookings stay; cancel them in Appointments.</Body>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {next30.map((d) => {
            const key = dateKey(d);
            const off = daysOff.has(key);
            const label = formatShortDay(d);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: off }}
                onPress={() => toggleDayOff(key)}
                style={[styles.dayChip, off && { backgroundColor: colors.danger, borderColor: colors.danger }]}>
                <Text style={[styles.dayChipTop, off && { color: '#fff' }]}>{label.weekday}</Text>
                <Text style={[styles.dayChipBottom, off && { color: '#fff' }]}>{label.day}</Text>
                {off && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>OFF</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      </Card>

      <TimePicker
        visible={adding !== null && !adding.start}
        title="Start time"
        onPick={(t) => setAdding((a) => (a ? { ...a, start: t } : a))}
        onClose={() => setAdding(null)}
      />
      <TimePicker
        visible={adding !== null && Boolean(adding.start)}
        title={adding?.start ? `End time (starts ${formatClock(adding.start)})` : 'End time'}
        after={adding?.start}
        onPick={(t) => adding?.start && addBlock(adding.weekday, adding.start, t)}
        onClose={() => setAdding(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  dayHeading: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 6 },
  time: { fontSize: 18, fontWeight: '700', color: colors.text },
  name: { fontSize: 18, fontWeight: '600', color: colors.text },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  actions: { flexDirection: 'row', gap: 8 },
  weekRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line },
  weekday: { width: 100, fontSize: 16, fontWeight: '700', color: colors.text, paddingTop: 12 },
  block: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soft, borderRadius: 12, paddingLeft: 14, minHeight: 48 },
  remove: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center' },
  add: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  dayChip: {
    width: 76,
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayChipTop: { fontSize: 14, fontWeight: '600', color: colors.muted },
  dayChipBottom: { fontSize: 15, fontWeight: '700', color: colors.text },
});
