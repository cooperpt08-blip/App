import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Body, Button, Card, Eyebrow, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { OwnerInvites } from '@/components/OwnerInvites';
import { useAccount } from '@/lib/account';
import { CARD_BUCKET, cardPhotoPath, formatWhen, STATUS_LABEL, type CutCardRow } from '@/lib/cutCards';
import { formatDay, formatTime } from '@/lib/schedule';
import { pickSquarePhoto, profilePhotoUrls, removeProfilePhoto, uploadProfilePhoto } from '@/lib/photos';
import { friendlyError, supabase } from '@/lib/supabase';

// The customer's latest recommendations, to reopen any time.
// Cut cards the customer sent to their barbershop, with the barber's progress.
function SentCards() {
  const [cards, setCards] = useState<CutCardRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('cut_cards')
      .select('*')
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(5);
    setCards((data as CutCardRow[] | null) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function cancel(card: CutCardRow) {
    Alert.alert('Cancel this cut card?', 'Your barbershop will no longer see it, and any photo you shared is deleted now.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel card',
        style: 'destructive',
        onPress: async () => {
          await supabase.storage
            .from(CARD_BUCKET)
            .remove([cardPhotoPath(card, 'front'), cardPhotoPath(card, 'side')]);
          const { error } = await supabase.from('cut_cards').delete().eq('id', card.id);
          setError(error ? friendlyError(error) : null);
          load();
        },
      },
    ]);
  }

  if (cards.length === 0) return null;
  return (
    <Card>
      <Label>Sent to your barber</Label>
      {cards.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700' }}>{c.cut.name}</Text>
            <Body muted>
              {STATUS_LABEL[c.status] === 'New' ? 'Sent' : STATUS_LABEL[c.status]} · {formatWhen(c.appointment_at)}
            </Body>
          </View>
          <View style={{ width: 110 }}>
            <Button title="Cancel" variant="danger" onPress={() => cancel(c)} />
          </View>
        </View>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

function PastRecommendations() {
  const [items, setItems] = useState<{ id: string; created_at: string; is_demo: boolean; result: { cuts?: { name: string }[] } }[]>([]);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('recommendations')
        .select('id, created_at, is_demo, result')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data }) => setItems((data as typeof items | null) ?? []));
    }, []),
  );

  if (items.length === 0) return null;
  return (
    <Card>
      <Label>Your recommendations</Label>
      {items.map((r) => (
        <Button
          key={r.id}
          variant="secondary"
          title={`${new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${r.result?.cuts?.[0]?.name ?? 'Recommendation'}${r.is_demo ? ' (demo)' : ''}`}
          onPress={() => router.push(`/results/${r.id}`)}
        />
      ))}
    </Card>
  );
}

type MyAppointment = {
  appointment_id: string;
  shop_name: string;
  barber_name: string | null;
  starts_at: string;
  status: 'booked' | 'cancelled' | 'done' | 'no_show';
};

// Upcoming bookings, and the button to make one.
function AppointmentsCard() {
  const [items, setItems] = useState<MyAppointment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_appointments');
    setItems(((data as MyAppointment[] | null) ?? []).filter((a) => a.status === 'booked'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function cancel(a: MyAppointment) {
    Alert.alert('Cancel this appointment?', `${formatDay(new Date(a.starts_at))} at ${formatTime(a.starts_at)}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel appointment',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('cancel_appointment', { p_appointment: a.appointment_id });
          setError(error ? friendlyError(error) : null);
          load();
        },
      },
    ]);
  }

  return (
    <Card>
      <Label>Appointments</Label>
      {items.length === 0 && <Body muted>No upcoming appointments.</Body>}
      {items.map((a) => (
        <View key={a.appointment_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700' }}>
              {formatDay(new Date(a.starts_at))}, {formatTime(a.starts_at)}
            </Text>
            <Body muted>{a.barber_name ? `With ${a.barber_name}` : a.shop_name}</Body>
          </View>
          <View style={{ width: 110 }}>
            <Button title="Cancel" variant="danger" onPress={() => cancel(a)} />
          </View>
        </View>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <Button title="Book an appointment" onPress={() => router.push('/book')} />
    </Card>
  );
}

// Optional photo so barbers recognize the customer. Only shops they use can see it.
function ProfilePhotoCard() {
  const { profile, refresh } = useAccount();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPhoto = Boolean(profile?.avatar_updated_at);

  useEffect(() => {
    if (!profile || !hasPhoto) return setUrl(null);
    profilePhotoUrls([profile.id]).then((urls) => setUrl(urls[profile.id] ?? null));
  }, [profile, hasPhoto]);

  async function choose(source: 'camera' | 'library') {
    setError(null);
    try {
      const uri = await pickSquarePhoto(source);
      if (!uri || !profile) return;
      setBusy(true);
      await uploadProfilePhoto(profile.id, uri);
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      await removeProfilePhoto(profile.id);
      await refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;
  return (
    <Card>
      <Label>Profile photo (optional)</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Avatar name={profile.first_name} url={url} size={80} />
        <View style={{ flex: 1 }}>
          <Body muted>
            Helps your barber recognize you. Only barbershops you use can see it. Remove it anytime.
          </Body>
        </View>
      </View>
      {error && <Notice tone="error">{error}</Notice>}
      <Button title={hasPhoto ? 'Take a new photo' : 'Take a photo'} onPress={() => choose('camera')} loading={busy} />
      <Button title="Choose from my photos" variant="secondary" onPress={() => choose('library')} disabled={busy} />
      {hasPhoto && <Button title="Remove photo" variant="danger" onPress={remove} disabled={busy} />}
    </Card>
  );
}

type Shop = { id: string; name: string; address: string };

// The customer's home screen.
export default function CustomerHome() {
  const { profile, signOut, refresh } = useAccount();
  const [shop, setShop] = useState<Shop | null>(null);
  const [invites, setInvites] = useState<{ invite_id: string; shop_name: string }[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (profile?.shop_id) {
      const { data } = await supabase.from('shops').select('id, name, address').eq('id', profile.shop_id).maybeSingle();
      setShop(data as Shop | null);
    } else {
      setShop(null);
    }
    const { data: inv } = await supabase.rpc('my_invites');
    setInvites((inv as { invite_id: string; shop_name: string }[] | null) ?? []);
  }, [profile?.shop_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function joinWithCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('join_shop', { p_code: code });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setCode('');
    await refresh();
  }

  if (!profile) return null;

  return (
    <Screen>
      <Eyebrow>Shape Up</Eyebrow>
      <Title>Hi {profile.first_name}</Title>
      <OwnerInvites />

      {invites.length > 0 && (
        <Notice tone="note">
          {invites[0].shop_name} invited you to join as a barber. Go to setup to accept.
        </Notice>
      )}
      {invites.length > 0 && <Button title="Accept barber invite" variant="secondary" onPress={() => router.push('/setup')} />}

      <Button title="✨ Get my haircut recommendations" onPress={() => router.push('/recommend')} />
      <SentCards />
      <PastRecommendations />

      <Card>
        <Label>Your barbershop</Label>
        {shop ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>{shop.name}</Text>
            {shop.address ? <Body muted>{shop.address}</Body> : null}
            <Body muted>You get up to 5 haircut recommendations a month.</Body>
          </>
        ) : (
          <>
            <Body>Not linked to a shop yet. Scan the QR code at your barbershop, or type the code below.</Body>
            <Body muted>Without a shop you get 1 free recommendation.</Body>
            <Button title="Find a shop on the map" onPress={() => router.push('/shops')} />
            <Field
              label="Shop code"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              placeholder="ABC123"
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button title="Join shop" onPress={joinWithCode} loading={busy} disabled={code.trim().length !== 6} />
          </>
        )}
      </Card>

      {shop && <AppointmentsCard />}

      {shop && (
        <Button title="Find other barbershops near me" variant="secondary" onPress={() => router.push('/shops')} />
      )}

      <ProfilePhotoCard />

      <Card>
        <Label>Going to a different barbershop?</Label>
        <Body>If they use Shape Up too, show them your code so your new barber can see your usual cut.</Body>
        <Button title="Show my cut card code" variant="secondary" onPress={() => router.push('/share-card')} />
      </Card>


      <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
