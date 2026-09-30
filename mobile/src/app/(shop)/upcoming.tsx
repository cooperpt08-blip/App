import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Segmented } from '@/components/Segmented';
import { Body, colors, Notice, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { cardPhotoUrls, formatWhen, STATUS_LABEL, type CutCardRow } from '@/lib/cutCards';
import { useShopCards } from '@/lib/useShopCards';

const STATUS_STYLE: Record<CutCardRow['status'], { bg: string; fg: string }> = {
  new: { bg: colors.ink, fg: colors.inkText },
  seen: { bg: colors.soft, fg: colors.text },
  in_chair: { bg: colors.noteSoft, fg: colors.note },
  done: { bg: colors.goodSoft, fg: colors.good },
};

// Soonest appointment first; cards without an appointment after, newest first.
function byAppointment(a: CutCardRow, b: CutCardRow) {
  if (a.appointment_at && b.appointment_at) return a.appointment_at.localeCompare(b.appointment_at);
  if (a.appointment_at) return -1;
  if (b.appointment_at) return 1;
  return b.created_at.localeCompare(a.created_at);
}

// Every cut card clients have sent to the shop.
export default function Upcoming() {
  const { session, membership } = useAccount();
  const myId = session?.user.id;
  const { cards, loading, error, reload } = useShopCards();
  const [filter, setFilter] = useState<'mine' | 'shop'>('mine');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const { active, done } = useMemo(() => {
    const shown = cards.filter((c) => filter === 'shop' || c.barber_id === myId || c.barber_id === null);
    return {
      active: shown.filter((c) => c.status !== 'done').sort(byAppointment),
      done: shown.filter((c) => c.status === 'done').sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
  }, [cards, filter, myId]);

  // Small photos for the list.
  useEffect(() => {
    (async () => {
      const next: Record<string, string> = {};
      for (const c of active.slice(0, 30)) {
        const urls = await cardPhotoUrls(c);
        if (urls.front) next[c.id] = urls.front;
      }
      setThumbs(next);
    })().catch(() => {});
  }, [active]);

  function Row({ card }: { card: CutCardRow }) {
    const s = STATUS_STYLE[card.status];
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/cut-card/${card.id}`)}
        style={({ pressed }) => [styles.row, card.status === 'new' && styles.rowNew, pressed && { opacity: 0.7 }]}>
        {thumbs[card.id] ? (
          <Image source={{ uri: thumbs[card.id] }} style={styles.thumb} contentFit="cover" />
        ) : (
          <Avatar name={card.customer_first_name} size={64} />
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.name}>{card.customer_first_name}</Text>
          <Text style={styles.cut} numberOfLines={1}>
            {card.cut.name}
          </Text>
          <Text style={styles.when}>{formatWhen(card.appointment_at)}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: s.bg }]}>
          <Text style={{ color: s.fg, fontWeight: '700', fontSize: 14 }}>{STATUS_LABEL[card.status]}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
        <View style={styles.inner}>
          <Text style={styles.eyebrow}>{membership?.display_name}</Text>
          <Title>Upcoming cuts</Title>
          <Segmented
            options={[
              { value: 'mine', label: 'Just mine' },
              { value: 'shop', label: 'Whole shop' },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {error && <Notice tone="error">{error}</Notice>}
          {!loading && active.length === 0 && (
            <Body muted>
              No cut cards yet. When a client picks a cut in Shape Up and sends it to your shop, it shows up here right away.
            </Body>
          )}
          <View style={{ gap: 10 }}>
            {active.map((c) => (
              <Row key={c.id} card={c} />
            ))}
          </View>
          {done.length > 0 && (
            <>
              <Text style={styles.section}>Done this week</Text>
              <View style={{ gap: 10 }}>
                {done.map((c) => (
                  <Row key={c.id} card={c} />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24 },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 },
  eyebrow: { fontSize: 13, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 92,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  rowNew: { borderColor: colors.ink, borderWidth: 2 },
  thumb: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.soft },
  name: { fontSize: 19, fontWeight: '700', color: colors.text },
  cut: { fontSize: 16, color: colors.text },
  when: { fontSize: 14, color: colors.muted },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  section: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 8 },
});
