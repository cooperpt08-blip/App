import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Body, Button, Card, colors, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { CLIENT_CODE_PREFIX } from '@/lib/clients';
import { friendlyError, supabase } from '@/lib/supabase';

type SharedShop = { shop_id: string; shop_name: string; granted_at: string };

// Customer shows this at a new barbershop. When a barber there scans it, their
// shop can see the customer's name, photo and cut cards.
export default function ShareCard() {
  const { session } = useAccount();
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [shops, setShops] = useState<SharedShop[]>([]);
  const [error, setError] = useState<string | null>(null);

  const newCode = useCallback(async () => {
    setError(null);
    const { data, error } = await supabase.rpc('create_share_code');
    if (error) return setError(friendlyError(error));
    setCode((data as { code: string; expires_at: string }[])[0]);
  }, []);

  const loadShops = useCallback(async () => {
    const { data } = await supabase.rpc('my_shared_shops');
    setShops((data as SharedShop[] | null) ?? []);
  }, []);

  useEffect(() => {
    newCode();
    loadShops();
  }, [newCode, loadShops]);

  // Tick every second for the countdown, and check every few seconds whether it got scanned.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(loadShops, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [loadShops]);

  function removeShop(shop: SharedShop) {
    Alert.alert(`Remove ${shop.shop_name}?`, 'They will no longer see your name, photo, or cut cards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('shop_client_access')
            .delete()
            .eq('shop_id', shop.shop_id)
            .eq('customer_id', session!.user.id);
          if (error) setError(friendlyError(error));
          loadShops();
        },
      },
    ]);
  }

  const secondsLeft = code ? Math.max(0, Math.floor((new Date(code.expires_at).getTime() - now) / 1000)) : 0;
  const expired = code !== null && secondsLeft === 0;

  return (
    <Screen>
      <Title>Show this to your new barber</Title>
      <Body muted>
        They scan it in the Shape Up app. Their shop will then see your first name, profile photo, and the cuts on your
        cut cards. They won’t see your appointment photos or other shops’ notes.
      </Body>

      {error && <Notice tone="error">{error}</Notice>}

      <Card style={{ alignItems: 'center' }}>
        {code && !expired ? (
          <>
            <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
              <QRCode value={`${CLIENT_CODE_PREFIX}${code.code}`} size={240} />
            </View>
            <Body muted center>Or they can type:</Body>
            <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: 5, color: colors.text }}>
              {code.code.slice(0, 4)}-{code.code.slice(4)}
            </Text>
            <Body muted center>
              Works once. Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
            </Body>
          </>
        ) : (
          <Body center>{expired ? 'This code expired.' : 'Making your code…'}</Body>
        )}
        <View style={{ alignSelf: 'stretch' }}>
          <Button title="Make a new code" variant="secondary" onPress={newCode} />
        </View>
      </Card>

      <Card>
        <Label>Shops you’ve shared with</Label>
        {shops.length === 0 && <Body muted>None yet.</Body>}
        {shops.map((shop) => (
          <View key={shop.shop_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '600' }}>{shop.shop_name}</Text>
            <View style={{ width: 120 }}>
              <Button title="Remove" variant="danger" onPress={() => removeShop(shop)} />
            </View>
          </View>
        ))}
      </Card>

      <Button title="Done" onPress={() => router.back()} />
    </Screen>
  );
}
