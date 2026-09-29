import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Body, Button, Card, colors, Eyebrow, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Shop = { id: string; name: string; address: string; join_code: string };
type Member = { user_id: string; role: 'owner' | 'barber'; display_name: string };
type Invite = { id: string; email: string; accepted_at: string | null };

export default function ShopScreen() {
  const { membership, signOut } = useAccount();
  const isOwner = membership?.role === 'owner';
  const shopId = membership?.shop_id;

  const [shop, setShop] = useState<Shop | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    const [{ data: s }, { data: m }, { data: i }] = await Promise.all([
      supabase.from('shops').select('id, name, address, join_code').eq('id', shopId).single(),
      supabase.from('shop_members').select('user_id, role, display_name').eq('shop_id', shopId).order('joined_at'),
      isOwner
        ? supabase.from('barber_invites').select('id, email, accepted_at').eq('shop_id', shopId).is('accepted_at', null)
        : Promise.resolve({ data: [] }),
    ]);
    if (s) {
      setShop(s as Shop);
      setName(s.name);
      setAddress(s.address);
    }
    setMembers((m as Member[] | null) ?? []);
    setInvites((i as Invite[] | null) ?? []);
  }, [shopId, isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  if (!membership || !shop) return <Screen><Title>Loading…</Title></Screen>;

  // In the App Store build this is shapeup://join/CODE. While testing in Expo Go
  // it's an exp:// link so the phone camera can still open it.
  const joinLink = Linking.createURL(`join/${shop.join_code}`);

  async function saveDetails() {
    setBusy('details');
    const { error } = await supabase.from('shops').update({ name: name.trim(), address: address.trim() }).eq('id', shop!.id);
    setBusy(null);
    setMessage(error ? { tone: 'error', text: friendlyError(error) } : { tone: 'success', text: 'Shop details saved.' });
    if (!error) load();
  }

  function newCode() {
    Alert.alert('Make a new QR code?', 'The old QR code and shop code will stop working. Clients already linked stay linked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make new code',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('regenerate_join_code', { p_shop: shop!.id });
          if (error) setMessage({ tone: 'error', text: friendlyError(error) });
          else load();
        },
      },
    ]);
  }

  async function invite() {
    const email = inviteEmail.trim().toLowerCase();
    setBusy('invite');
    const { error } = await supabase.from('barber_invites').insert({ shop_id: shop!.id, email });
    setBusy(null);
    if (error) {
      const duplicate = error.code === '23505';
      return setMessage({ tone: 'error', text: duplicate ? 'You already invited that email.' : friendlyError(error) });
    }
    setInviteEmail('');
    setMessage({ tone: 'success', text: `Invite saved. ${email} can now sign in to Shape Up and join as a barber.` });
    load();
    // Open the phone's email app with a ready-to-send message.
    const subject = encodeURIComponent(`Join ${shop!.name} on Shape Up`);
    const body = encodeURIComponent(
      `Hi! I've added you as a barber at ${shop!.name} on Shape Up, so you'll see the cut cards our clients send.\n\n` +
        `1. Download the Shape Up app\n2. Sign in with this email address: ${email}\n3. Tap "Join as a barber"`,
    );
    Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`).catch(() => {});
  }

  function cancelInvite(inv: Invite) {
    supabase.from('barber_invites').delete().eq('id', inv.id).then(() => load());
  }

  function removeBarber(m: Member) {
    Alert.alert(`Remove ${m.display_name}?`, 'They will no longer see your shop’s cut cards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('shop_members').delete().eq('shop_id', shop!.id).eq('user_id', m.user_id);
          if (error) setMessage({ tone: 'error', text: friendlyError(error) });
          load();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Eyebrow>{isOwner ? 'Owner' : 'Barber'}</Eyebrow>
      <Title>{shop.name}</Title>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card style={{ alignItems: 'center' }}>
        <Label>Clients scan this to link to your shop</Label>
        <View style={{ padding: 12, backgroundColor: '#fff', borderRadius: 12 }}>
          <QRCode value={joinLink} size={220} />
        </View>
        <Body muted center>Or they can type this code in the app:</Body>
        <Text style={{ fontSize: 36, fontWeight: '700', letterSpacing: 6, color: colors.text }}>{shop.join_code}</Text>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button
            title="Share code"
            variant="secondary"
            onPress={() =>
              Share.share({ message: `Get free haircut recommendations from ${shop.name}: download Shape Up and enter code ${shop.join_code}` })
            }
          />
          {isOwner && <Button title="Make a new code" variant="secondary" onPress={newCode} />}
        </View>
      </Card>

      {isOwner && (
        <Card>
          <Label>Shop details</Label>
          <Field label="Shop name" value={name} onChangeText={setName} maxLength={80} />
          <Field label="Address" value={address} onChangeText={setAddress} maxLength={200} />
          <Button title="Save details" onPress={saveDetails} loading={busy === 'details'} disabled={!name.trim()} />
        </Card>
      )}

      <Card>
        <Label>Team</Label>
        {members.map((m) => (
          <View key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '600' }}>{m.display_name}</Text>
              <Text style={{ color: colors.muted }}>{m.role === 'owner' ? 'Owner' : 'Barber'}</Text>
            </View>
            {isOwner && m.role === 'barber' && (
              <View style={{ width: 120 }}>
                <Button title="Remove" variant="danger" onPress={() => removeBarber(m)} />
              </View>
            )}
          </View>
        ))}
      </Card>

      {isOwner && (
        <Card>
          <Label>Invite a barber</Label>
          <Field
            label="Their email"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="barber@example.com"
          />
          <Button title="Send invite" onPress={invite} loading={busy === 'invite'} disabled={!inviteEmail.includes('@')} />
          {invites.length > 0 && <Label>Waiting to join</Label>}
          {invites.map((inv) => (
            <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <Text style={{ flex: 1, fontSize: 16 }}>{inv.email}</Text>
              <View style={{ width: 120 }}>
                <Button title="Cancel" variant="secondary" onPress={() => cancelInvite(inv)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
