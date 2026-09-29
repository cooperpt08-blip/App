import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Switch, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Body, Button, Card, colors, Eyebrow, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { OwnerInvites } from '@/components/OwnerInvites';
import { Chips } from '@/components/Segmented';
import { useAccount } from '@/lib/account';
import { findOnMap } from '@/lib/geo';
import { APPOINTMENT_LENGTHS, deviceTimeZone } from '@/lib/schedule';
import { friendlyError, supabase } from '@/lib/supabase';

type Shop = {
  id: string;
  name: string;
  address: string;
  join_code: string;
  // These two arrive with the scheduling database update.
  appointment_minutes?: number;
  timezone?: string | null;
  // These arrive with the shop map database update.
  phone?: string;
  latitude?: number | null;
  longitude?: number | null;
  listed?: boolean;
};
type Member = { user_id: string; role: 'owner' | 'barber'; display_name: string };
type Invite = { id: string; email: string; accepted_at: string | null };

export default function ShopScreen() {
  const { membership, signOut } = useAccount();
  const isOwner = membership?.role === 'owner';
  const shopId = membership?.shop_id;

  const [shop, setShop] = useState<Shop | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [listed, setListed] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    const [{ data: s }, { data: m }, { data: i }] = await Promise.all([
      supabase.from('shops').select('*').eq('id', shopId).single(),
      supabase.from('shop_members').select('user_id, role, display_name').eq('shop_id', shopId).order('joined_at'),
      isOwner
        ? supabase.from('barber_invites').select('id, email, accepted_at').eq('shop_id', shopId).is('accepted_at', null)
        : Promise.resolve({ data: [] }),
    ]);
    if (s) {
      // Bookings use the shop's time zone; set it from the owner's phone the first time.
      if (isOwner && 'timezone' in s && !s.timezone) {
        const timezone = deviceTimeZone();
        await supabase.from('shops').update({ timezone }).eq('id', s.id);
        s.timezone = timezone;
      }
      setShop(s as Shop);
      setName(s.name);
      setAddress(s.address);
      setPhone(s.phone ?? '');
      setListed(s.listed ?? true);
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

  async function setLength(minutes: number) {
    const { error } = await supabase.from('shops').update({ appointment_minutes: minutes }).eq('id', shop!.id);
    if (error) setMessage({ tone: 'error', text: friendlyError(error) });
    load();
  }

  async function saveDetails() {
    setBusy('details');
    const hasMap = shop!.listed !== undefined; // the shop map database update has been run
    const changes: Record<string, unknown> = { name: name.trim(), address: address.trim() };
    let place: { latitude: number; longitude: number } | null = null;
    if (hasMap) {
      changes.phone = phone.trim();
      changes.listed = listed;
      // Put the shop on the map from its address (only look it up again if it changed).
      place =
        address.trim() === shop!.address && shop!.latitude != null && shop!.longitude != null
          ? { latitude: shop!.latitude, longitude: shop!.longitude }
          : await findOnMap(address.trim());
      changes.latitude = place?.latitude ?? null;
      changes.longitude = place?.longitude ?? null;
    }
    const { error } = await supabase.from('shops').update(changes).eq('id', shop!.id);
    setBusy(null);
    if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
    setMessage(
      !hasMap
        ? { tone: 'success', text: 'Shop details saved.' }
        : place
          ? { tone: 'success', text: listed ? 'Saved. Your shop is on the Shape Up map.' : 'Saved. Your shop is hidden from the map.' }
          : { tone: 'error', text: 'Saved, but we couldn’t find that address on the map. Include the street, city and state.' },
    );
    load();
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
    setMessage({
      tone: 'success',
      text: `Invite saved. ${email} joins your shop as soon as they create a Shape Up account with that email.`,
    });
    load();
    shareInvite(email);
  }

  // Opens the phone's share menu (Messages, Gmail, WhatsApp…) with a ready-made invite.
  function shareInvite(email: string) {
    Share.share({
      message:
        `You're invited to join ${shop!.name} on Shape Up as a barber, so you'll see the cut cards our clients send.\n\n` +
        `1. Download the Shape Up app\n` +
        `2. Tap "Create a new account" and use this email: ${email}\n` +
        `3. Tap "Join as a barber"`,
    }).catch(() => {});
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
      <OwnerInvites />
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
          <Field
            label="Address"
            hint="Street, city and state, so clients can find you on the map."
            value={address}
            onChangeText={setAddress}
            maxLength={200}
          />
          {shop.listed !== undefined && (
            <>
              <Field
                label="Phone number"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={30}
                placeholder="(214) 555-0100"
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Show my shop on the map</Text>
                  <Body muted>New clients can find you and join with one tap.</Body>
                </View>
                <Switch value={listed} onValueChange={setListed} />
              </View>
              {shop.latitude == null && address.trim() !== '' && (
                <Body muted>Not on the map yet. Tap Save details to place it.</Body>
              )}
            </>
          )}
          <Button title="Save details" onPress={saveDetails} loading={busy === 'details'} disabled={!name.trim()} />
        </Card>
      )}

      {isOwner && shop.appointment_minutes !== undefined && (
        <Card>
          <Label>Appointment length</Label>
          <Body muted>How long each booking slot is. Applies to new bookings.</Body>
          <Chips
            options={APPOINTMENT_LENGTHS.map((m) => ({ value: m, label: m < 60 ? `${m} min` : m === 60 ? '1 hour' : '1½ hours' }))}
            value={shop.appointment_minutes}
            onChange={setLength}
          />
          {shop.timezone ? <Body muted>Time zone: {shop.timezone}</Body> : null}
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
          <Body muted>They’ll join your shop when they create a Shape Up account with this email. You can send them the invite by text or email next.</Body>
          <Button title="Invite" onPress={invite} loading={busy === 'invite'} disabled={!inviteEmail.includes('@')} />
          {invites.length > 0 && <Label>Waiting to join</Label>}
          {invites.map((inv) => (
            <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <Text style={{ flex: 1, fontSize: 16 }}>{inv.email}</Text>
              <View style={{ width: 96 }}>
                <Button title="Share" variant="secondary" onPress={() => shareInvite(inv.email)} />
              </View>
              <View style={{ width: 96 }}>
                <Button title="Cancel" variant="secondary" onPress={() => cancelInvite(inv)} />
              </View>
            </View>
          ))}
        </Card>
      )}

      <Button title="Monthly report" onPress={() => router.push('/report')} />
      <Button title="See the shop map" variant="secondary" onPress={() => router.push('/shops')} />
      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
