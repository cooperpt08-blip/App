import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Body, Button, Card, colors, Field, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { cardPhotoUrls, formatWhen, hairSummary, STATUS_LABEL, type CardStatus, type CutCardRow } from '@/lib/cutCards';
import { friendlyError, supabase } from '@/lib/supabase';

function Detail({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      <Body>{text}</Body>
    </View>
  );
}

// One cut card, full screen, for the barber at the chair.
export default function CutCardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loading: accountLoading, membership } = useAccount();
  const [card, setCard] = useState<CutCardRow | null>(null);
  const [barberName, setBarberName] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{ front?: string; side?: string }>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('cut_cards').select('*').eq('id', id).single();
    if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
    let row = data as CutCardRow;
    // Opening a new card marks it as seen.
    if (row.status === 'new') {
      const { data: updated } = await supabase.from('cut_cards').update({ status: 'seen' }).eq('id', id).select('*').single();
      if (updated) row = updated as CutCardRow;
    }
    setCard(row);
    setNotes(row.barber_notes);
    setPhotos(await cardPhotoUrls(row));
    if (row.barber_id) {
      const { data: m } = await supabase.from('shop_members').select('display_name').eq('user_id', row.barber_id).maybeSingle();
      setBarberName(m?.display_name ?? null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: CardStatus) {
    setSaving(status);
    const { data, error } = await supabase.from('cut_cards').update({ status }).eq('id', id).select('*').single();
    setSaving(null);
    if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
    setCard(data as CutCardRow);
    setMessage(null);
  }

  async function saveNotes() {
    setSaving('notes');
    const { error } = await supabase.from('cut_cards').update({ barber_notes: notes.trim() }).eq('id', id);
    setSaving(null);
    setMessage(error ? { tone: 'error', text: friendlyError(error) } : { tone: 'success', text: 'Notes saved.' });
  }

  if (accountLoading) return <Loading />;
  if (!membership) return <Redirect href="/" />;
  if (!card) return message ? <Screen><Notice tone="error">{message.text}</Notice></Screen> : <Loading />;

  const photoList = (['front', 'side'] as const).filter((k) => photos[k]);

  return (
    <Screen>
      <Button title="‹ Upcoming cuts" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/upcoming'))} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={card.customer_first_name} size={56} />
        <View style={{ flex: 1 }}>
          <Title>{card.customer_first_name}</Title>
          <Body muted>
            {formatWhen(card.appointment_at)}
            {barberName ? ` · with ${barberName}` : ' · any barber'}
          </Body>
        </View>
      </View>

      {/* Status: big buttons for the chair. */}
      <View style={styles.statusRow}>
        {(['seen', 'in_chair', 'done'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: card.status === s }}
            onPress={() => setStatus(s)}
            disabled={saving !== null}
            style={[styles.status, card.status === s && styles.statusOn]}>
            <Text style={[styles.statusText, card.status === s && { color: colors.inkText }]}>{STATUS_LABEL[s]}</Text>
          </Pressable>
        ))}
      </View>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {photoList.length > 0 ? (
        <View style={styles.photos}>
          {photoList.map((k) => (
            <Pressable key={k} accessibilityRole="imagebutton" accessibilityLabel={`${k} photo, tap to enlarge`} onPress={() => setZoom(photos[k]!)} style={{ flex: 1 }}>
              <Image source={{ uri: photos[k] }} style={styles.photo} contentFit="cover" />
              <Text style={styles.photoLabel}>{k === 'front' ? 'Front' : 'Side'} · tap to enlarge</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Body muted>
          {card.photos_deleted_at
            ? 'Photos were deleted after the appointment, to protect the client’s privacy.'
            : 'The client chose not to share a photo.'}
        </Body>
      )}

      <Card>
        <Label>The cut</Label>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>{card.cut.name}</Text>
        {card.cut.tellYourBarber ? (
          <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: '#a8a29e' }}>INSTRUCTIONS</Text>
            <Text style={{ fontSize: 19, lineHeight: 27, color: colors.inkText }}>{card.cut.tellYourBarber}</Text>
          </View>
        ) : null}
        <Detail label="Styling" text={card.cut.styling} />
        <Detail label="Product" text={card.cut.product} />
        <Detail label="Upkeep" text={card.cut.upkeep} />
      </Card>

      <Card>
        <Detail label="Hair" text={hairSummary(card.hair)} />
        <Detail label="What they asked for" text={typeof card.hair.want === 'string' ? card.hair.want : undefined} />
        <Detail label="Client’s note" text={card.customer_note} />
      </Card>

      <Card>
        <Field
          label="Your notes"
          hint="Only your shop sees these."
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={2000}
          placeholder="e.g. Went a little shorter on top, cowlick at the crown"
        />
        <Button title="Save notes" onPress={saveNotes} loading={saving === 'notes'} />
      </Card>

      <Button title="See client’s history" variant="secondary" onPress={() => router.push(`/client/${card.customer_id}`)} />

      <Modal visible={zoom !== null} animationType="fade" onRequestClose={() => setZoom(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          {/* Pinch to zoom in on detail (hairline, crown, cowlick). */}
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            {zoom && <Image source={{ uri: zoom }} style={{ width: '100%', aspectRatio: 3 / 4 }} contentFit="contain" />}
          </ScrollView>
          <View style={{ padding: 16 }}>
            <Button title="Close" variant="secondary" onPress={() => setZoom(null)} />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: 8 },
  status: { flex: 1, minHeight: 60, borderRadius: 16, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  statusOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  statusText: { fontSize: 17, fontWeight: '700', color: colors.text },
  photos: { flexDirection: 'row', gap: 10 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, backgroundColor: colors.soft },
  photoLabel: { fontSize: 13, color: colors.muted, marginTop: 4, textAlign: 'center' },
});
