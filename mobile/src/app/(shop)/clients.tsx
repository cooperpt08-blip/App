import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Body, Button, colors, Notice, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { formatDate, type ShopClient } from '@/lib/clients';
import { profilePhotoUrls } from '@/lib/photos';
import { friendlyError, supabase } from '@/lib/supabase';

type Filter = 'shop' | 'mine';

// Every client of the shop: their name, photo, and usual cut.
export default function Clients() {
  const { membership } = useAccount();
  const [clients, setClients] = useState<ShopClient[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('shop');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    setError(null);
    const { data, error } = await supabase.rpc('shop_clients', { p_shop: membership.shop_id });
    setLoading(false);
    if (error) return setError(friendlyError(error));
    const list = (data as ShopClient[]) ?? [];
    setClients(list);
    setPhotos(await profilePhotoUrls(list.filter((c) => c.avatar_updated_at).map((c) => c.customer_id)));
  }, [membership]);

  // Reload whenever the tab is opened, so new clients and edited notes show up.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter(
      (c) => (filter === 'shop' || c.mine) && (!term || c.first_name.toLowerCase().includes(term)),
    );
  }, [clients, filter, search]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
        <View style={styles.inner}>
          <Title>Clients</Title>

          <Button title="Scan a new client’s code" onPress={() => router.push('/scan-client')} />

          <View style={styles.segment}>
            {(['shop', 'mine'] as const).map((f) => (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === f }}
                onPress={() => setFilter(f)}
                style={[styles.segmentItem, filter === f && styles.segmentOn]}>
                <Text style={[styles.segmentText, filter === f && { color: colors.inkText }]}>
                  {f === 'shop' ? 'Whole shop' : 'Just mine'}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name"
            placeholderTextColor={colors.muted}
            style={styles.search}
            autoCorrect={false}
          />

          {error && <Notice tone="error">{error}</Notice>}

          {!loading && shown.length === 0 && (
            <Body muted>
              {clients.length === 0
                ? 'No clients yet. Clients appear here when they scan your shop’s QR code, send you a cut card, or show you their code.'
                : filter === 'mine'
                  ? 'No clients have picked you as their barber yet.'
                  : 'No clients match that name.'}
            </Body>
          )}

          <View style={{ gap: 10 }}>
            {shown.map((c) => (
              <Pressable
                key={c.customer_id}
                accessibilityRole="button"
                onPress={() => router.push(`/client/${c.customer_id}`)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <Avatar name={c.first_name} url={photos[c.customer_id]} size={64} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.name}>{c.first_name}</Text>
                  <Text style={styles.cut} numberOfLines={2}>
                    {c.usual_cut ?? 'No usual cut yet'}
                  </Text>
                  <Text style={styles.meta}>
                    {[
                      c.last_cut_at ? `Last cut card ${formatDate(c.last_cut_at)}` : null,
                      c.shared && !c.linked ? 'Shared their code' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24 },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 },
  segment: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: 16, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.ink },
  segmentText: { fontSize: 16, fontWeight: '600', color: colors.text },
  search: {
    minHeight: 52,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 14,
    minHeight: 92,
  },
  name: { fontSize: 19, fontWeight: '700', color: colors.text },
  cut: { fontSize: 15, color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  chevron: { fontSize: 28, color: colors.muted },
});
