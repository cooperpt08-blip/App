import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';

import { Chips } from '@/components/Segmented';
import { Body, Button, Card, colors, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { cardPhotoPath, CARD_BUCKET, newId, uploadCardPhoto } from '@/lib/cutCards';
import { photoSession, type Cut } from '@/lib/recommendation';
import { formatDay, formatTime } from '@/lib/schedule';
import { friendlyError, supabase } from '@/lib/supabase';

type Member = { user_id: string; display_name: string };
type Appt = { id: string; starts_at: string; barber_id: string };
const ANYONE = 'anyone';
const NONE = 'none';

// A customer sends one recommended cut to their barbershop, with optional barber,
// appointment, note, and (only with permission) their photos.
export default function SendCard() {
  const { rec, cut: cutIndex } = useLocalSearchParams<{ rec: string; cut: string }>();
  const { loading, session, profile } = useAccount();
  const [cut, setCut] = useState<Cut | null>(null);
  const [hair, setHair] = useState<Record<string, unknown>>({});
  const [shopName, setShopName] = useState('');
  const [barbers, setBarbers] = useState<Member[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [barber, setBarber] = useState(ANYONE);
  const [appt, setAppt] = useState(NONE);
  const [note, setNote] = useState('');
  const [sharePhotos, setSharePhotos] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The photos are only still in memory if this is the recommendation they just made.
  const photos = photoSession.recommendationId === rec ? photoSession : null;
  const hasPhotos = Boolean(photos?.front);

  useEffect(() => {
    if (!profile?.shop_id || !rec) return;
    (async () => {
      const [{ data: r }, { data: shop }, { data: team }, { data: bookings }] = await Promise.all([
        supabase.from('recommendations').select('result, answers').eq('id', rec).single(),
        supabase.from('shops').select('name').eq('id', profile.shop_id!).single(),
        supabase.from('shop_members').select('user_id, display_name').eq('shop_id', profile.shop_id!).order('joined_at'),
        supabase
          .from('appointments')
          .select('id, starts_at, barber_id')
          .eq('shop_id', profile.shop_id!)
          .eq('status', 'booked')
          .gt('starts_at', new Date().toISOString())
          .order('starts_at'),
      ]);
      const result = r?.result as { cuts?: Cut[] } | undefined;
      setCut(result?.cuts?.[Number(cutIndex)] ?? null);
      setHair((r?.answers as Record<string, unknown>) ?? {});
      setShopName(shop?.name ?? 'your barbershop');
      setBarbers((team as Member[]) ?? []);
      const list = (bookings as Appt[]) ?? [];
      setAppts(list);
      if (list[0]) setAppt(list[0].id); // their next booking, by default
    })().catch((e) => setError(friendlyError(e)));
  }, [profile?.shop_id, rec, cutIndex]);

  if (loading) return <Loading />;
  if (!profile?.shop_id) return <Redirect href="/home" />;
  if (!cut) return error ? <Screen><Notice tone="error">{error}</Notice></Screen> : <Loading />;

  async function send() {
    if (!session || !profile?.shop_id || !cut) return;
    setSending(true);
    setError(null);
    const id = newId();
    const card = { id, shop_id: profile.shop_id, customer_id: session.user.id };
    const uploaded: string[] = [];
    try {
      const withPhotos = sharePhotos && hasPhotos;
      if (withPhotos && photos?.front) {
        await uploadCardPhoto(cardPhotoPath(card, 'front'), photos.front.base64);
        uploaded.push(cardPhotoPath(card, 'front'));
        if (photos.side) {
          await uploadCardPhoto(cardPhotoPath(card, 'side'), photos.side.base64);
          uploaded.push(cardPhotoPath(card, 'side'));
        }
      }
      const { error } = await supabase.from('cut_cards').insert({
        ...card,
        recommendation_id: rec,
        cut,
        hair,
        customer_note: note.trim(),
        barber_id: barber === ANYONE ? null : barber,
        appointment_id: appt === NONE ? null : appt,
        has_front_photo: withPhotos,
        has_side_photo: withPhotos && Boolean(photos?.side),
        photo_consent_at: withPhotos ? new Date().toISOString() : null,
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      // Don't leave photos behind if the card didn't go through.
      if (uploaded.length) await supabase.storage.from(CARD_BUCKET).remove(uploaded);
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Screen>
        <Title>Sent to {shopName}!</Title>
        <Notice tone="success">
          Your barber will see “{cut.name}” with the exact instructions{sharePhotos && hasPhotos ? ' and your photo' : ''}.
        </Notice>
        {sharePhotos && hasPhotos && (
          <Body muted>
            Your photo will be deleted automatically{' '}
            {appt !== NONE ? '7 days after your appointment' : '30 days from now'}. You can cancel the card anytime from
            your home screen.
          </Body>
        )}
        <Button title="Done" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }

  const selectedAppt = appts.find((a) => a.id === appt);

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => router.back()} />
      <Title>Send to {shopName}</Title>

      <Card>
        <Label>Your cut</Label>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{cut.name}</Text>
        {cut.tellYourBarber ? <Body muted>“{cut.tellYourBarber}”</Body> : null}
      </Card>

      <View style={{ gap: 8 }}>
        <Label>Appointment</Label>
        {appts.length > 0 ? (
          <Chips
            options={[
              ...appts.map((a) => ({ value: a.id, label: `${formatDay(new Date(a.starts_at))}, ${formatTime(a.starts_at)}` })),
              { value: NONE, label: 'Not for a booking' },
            ]}
            value={appt}
            onChange={setAppt}
          />
        ) : (
          <>
            <Body muted>You don’t have an upcoming booking. You can still send the card, or book first.</Body>
            <Button title="Book an appointment" variant="secondary" onPress={() => router.push('/book')} />
          </>
        )}
      </View>

      {!selectedAppt && barbers.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>Barber</Label>
          <Chips
            options={[{ value: ANYONE, label: 'Anyone' }, ...barbers.map((b) => ({ value: b.user_id, label: b.display_name }))]}
            value={barber}
            onChange={setBarber}
          />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Label>Note for your barber (optional)</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="e.g. Wedding on Saturday, keep it a little longer on top"
          placeholderTextColor={colors.muted}
          style={{ minHeight: 90, borderWidth: 2, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.card, padding: 14, fontSize: 16, color: colors.text, textAlignVertical: 'top' }}
        />
      </View>

      <Card>
        <Label>Share your photo?</Label>
        {hasPhotos ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {photos?.front && <Image source={{ uri: photos.front.uri }} style={{ width: 72, height: 96, borderRadius: 12 }} />}
              <View style={{ flex: 1 }}>
                <Body>Helps your barber see your hair before you sit down.</Body>
              </View>
              <Switch value={sharePhotos} onValueChange={setSharePhotos} accessibilityLabel="Share my photo with the shop" />
            </View>
            <Body muted>
              Only {shopName}’s barbers can see it. It’s deleted automatically{' '}
              {selectedAppt ? '7 days after your appointment' : '30 days after you send it'}, or when you cancel the card.
            </Body>
          </>
        ) : (
          <Body muted>Your photos from this recommendation weren’t saved (we never keep them), so this card will be sent without a photo.</Body>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}
      <Button title={`Send to ${shopName}`} onPress={send} loading={sending} />
    </Screen>
  );
}
