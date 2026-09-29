import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Button, colors, Notice } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type DirectoryShop = {
  shop_id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  barbers: number;
  is_my_shop: boolean;
};
type Point = { latitude: number; longitude: number };

// Straight-line distance in miles, for "0.8 mi away".
function milesBetween(a: Point, b: Point) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

function regionFor(points: Point[]): Region {
  if (points.length === 0) return { latitude: 39.5, longitude: -98.35, latitudeDelta: 40, longitudeDelta: 40 }; // whole US
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.05, (maxLon - minLon) * 1.4),
  };
}

// Every Shape Up barbershop on a map, with a quick way to join one.
export default function ShopMap() {
  const { profile, membership, refresh } = useAccount();
  // welcome=1: a new customer who signed up without a shop, choosing one for the first time.
  const welcome = useLocalSearchParams<{ welcome?: string }>().welcome === '1';
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const [shops, setShops] = useState<DirectoryShop[]>([]);
  const [me, setMe] = useState<Point | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const isCustomer = Boolean(profile) && !membership;

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('shop_directory');
    if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
    setShops((data as DirectoryShop[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    // Show shops near the person, if they allow location. The map still works without it.
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const last = await Location.getLastKnownPositionAsync();
      const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })().catch(() => {});
  }, [load]);

  // Nearest first when we know where they are, otherwise A to Z.
  const sorted = useMemo(() => {
    const list = shops.map((s) => ({ ...s, miles: me ? milesBetween(me, s) : null }));
    return me ? list.sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0)) : list;
  }, [shops, me]);

  // Frame the map around the person and the nearest few shops.
  useEffect(() => {
    const points: Point[] = sorted.slice(0, 5).map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
    if (me) points.push(me);
    if (points.length) map.current?.animateToRegion(regionFor(points), 400);
  }, [sorted, me]);

  const current = sorted.find((s) => s.shop_id === selected) ?? null;

  function select(shop: DirectoryShop) {
    setSelected(shop.shop_id);
    setMessage(null);
    map.current?.animateToRegion({ latitude: shop.latitude, longitude: shop.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
  }

  function call(phone: string) {
    Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
      setMessage({ tone: 'error', text: `Couldn’t start a call. The number is ${phone}.` }),
    );
  }

  function directions(shop: DirectoryShop) {
    const dest = `${shop.latitude},${shop.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(shop.name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    Linking.openURL(url).catch(() => {});
  }

  async function join(shop: DirectoryShop) {
    const doJoin = async () => {
      setJoining(true);
      const { error } = await supabase.rpc('join_listed_shop', { p_shop: shop.shop_id });
      setJoining(false);
      if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
      await refresh();
      await load();
      setJoinedName(shop.name);
      setMessage({ tone: 'success', text: `You’re now linked to ${shop.name}. You get up to 5 recommendations a month and can book with them.` });
    };
    if (profile?.shop_id) {
      Alert.alert(`Switch to ${shop.name}?`, 'You can only be linked to one barbershop at a time.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: doJoin },
      ]);
    } else {
      doJoin();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {welcome ? (
          <>
            <Text style={[styles.title, { flex: 1 }]}>Choose your barbershop</Text>
            <View style={{ width: 132 }}>
              <Button
                title={joinedName ? 'Continue' : 'Skip for now'}
                variant={joinedName ? 'primary' : 'secondary'}
                onPress={() => router.replace('/home')}
              />
            </View>
          </>
        ) : (
          <>
            <View style={{ width: 96 }}>
              <Button title="‹ Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
            </View>
            <Text style={styles.title}>Find a barbershop</Text>
          </>
        )}
      </View>
      {welcome && !joinedName && (
        <Text style={styles.welcome}>
          Pick the shop you go to so you can book and get up to 5 free recommendations a month. At the shop? You can
          also scan their QR code with your camera.
        </Text>
      )}

      <MapView
        ref={map}
        style={styles.map}
        initialRegion={regionFor([])}
        showsUserLocation={Boolean(me)}
        onPress={() => setSelected(null)}>
        {shops.map((s) => (
          <Marker
            key={s.shop_id}
            coordinate={{ latitude: s.latitude, longitude: s.longitude }}
            title={s.name}
            description={s.address}
            pinColor={s.is_my_shop ? '#15803d' : s.shop_id === selected ? colors.ink : '#b91c1c'}
            onPress={() => select(s)}
          />
        ))}
      </MapView>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}

          {current ? (
            <View style={styles.card}>
              <Text style={styles.name}>{current.name}</Text>
              {current.is_my_shop && <Text style={styles.mine}>Your barbershop</Text>}
              {current.address ? <Body>{current.address}</Body> : null}
              <Body muted>
                {[
                  current.miles !== null ? `${current.miles < 10 ? current.miles.toFixed(1) : Math.round(current.miles)} mi away` : null,
                  `${current.barbers} ${current.barbers === 1 ? 'barber' : 'barbers'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Body>
              {current.phone ? <Button title={`Call ${current.phone}`} variant="secondary" onPress={() => call(current.phone)} /> : null}
              <Button title="Get directions" variant="secondary" onPress={() => directions(current)} />
              {isCustomer && !current.is_my_shop && (
                <Button title={`Join ${current.name}`} onPress={() => join(current)} loading={joining} />
              )}
              {isCustomer && current.is_my_shop && welcome && (
                <Button title="Continue" onPress={() => router.replace('/home')} />
              )}
              {isCustomer && current.is_my_shop && !welcome && (
                <Button title="Book an appointment" onPress={() => router.push('/book')} />
              )}
              <Button title="Show all shops" variant="secondary" onPress={() => setSelected(null)} />
            </View>
          ) : (
            <>
              <Body muted>
                {shops.length === 0
                  ? 'No barbershops on the map yet.'
                  : `${shops.length} ${shops.length === 1 ? 'shop' : 'shops'} on Shape Up${me ? ', nearest first' : ''}. Tap one for details.`}
              </Body>
              {sorted.map((s) => (
                <Pressable
                  key={s.shop_id}
                  accessibilityRole="button"
                  onPress={() => select(s)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowName}>
                      {s.name}
                      {s.is_my_shop ? '  ·  Your shop' : ''}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {s.address}
                    </Text>
                  </View>
                  {s.miles !== null && (
                    <Text style={styles.miles}>{s.miles < 10 ? s.miles.toFixed(1) : Math.round(s.miles)} mi</Text>
                  )}
                </Pressable>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1 },
  welcome: { fontSize: 15, lineHeight: 21, color: colors.muted, paddingHorizontal: 16, paddingBottom: 10 },
  map: { height: '42%', width: '100%' },
  list: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 10 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  mine: { fontSize: 14, fontWeight: '700', color: colors.good },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowName: { fontSize: 17, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 14, color: colors.muted },
  miles: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
});
