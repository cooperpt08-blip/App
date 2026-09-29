import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PhotoCheckResult } from '@/lib/photoCheckPage';
import { pickSquarePhoto, prepareRecommendationPhoto } from '@/lib/photos';
import type { Photo } from '@/lib/recommendation';
import { friendlyError } from '@/lib/supabase';
import { Body, Button, colors, Notice, Title } from './ui';

const TIPS = {
  front: ['Face the camera straight on', 'Good light on your face, like facing a window', 'Hair styled how you usually wear it', 'Whole head in the outline, with space above'],
  side: ['Turn your head to show one side', 'Ear and side of your head in view', 'Or ask a friend to take it'],
};

// Takes one guided photo: an outline to line up with, tips, then an on-phone quality
// check with suggestions before the customer uses it.
export function GuidedPhoto({
  kind,
  check,
  onUse,
  onSkip,
}: {
  kind: 'front' | 'side';
  check: (base64: string, kind: 'front' | 'side') => Promise<PhotoCheckResult>;
  onUse: (photo: Photo) => void;
  onSkip?: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [result, setResult] = useState<PhotoCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(uri: string) {
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareRecommendationPhoto(uri);
      setPhoto(prepared);
      setResult(await check(prepared.base64, kind));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    const shot = await camera.current?.takePictureAsync({ quality: 0.9 });
    if (shot?.uri) review(shot.uri);
  }

  async function fromLibrary() {
    try {
      const uri = await pickSquarePhoto('library', false);
      if (uri) review(uri);
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  function retake() {
    setPhoto(null);
    setResult(null);
  }

  const title = kind === 'front' ? 'Front photo' : 'Side photo (optional)';

  // ---- Reviewing a photo ----
  if (photo || busy) {
    const blocking = result?.issues.some((i) => i.blocking);
    return (
      <View style={{ gap: 14 }}>
        <Title>{title}</Title>
        {photo && <Image source={{ uri: photo.uri }} style={styles.preview} contentFit="cover" />}
        {busy ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ActivityIndicator color={colors.ink} />
            <Body muted>Checking your photo…</Body>
          </View>
        ) : result && result.issues.length > 0 ? (
          <Notice tone={blocking ? 'error' : 'note'}>
            {'To get the best recommendation:\n' + result.issues.map((i) => `• ${i.message}`).join('\n')}
          </Notice>
        ) : result?.checked ? (
          <Notice tone="success">Looks great.</Notice>
        ) : null}
        {!busy && (
          <>
            <Button
              title={result && result.issues.length > 0 ? 'Retake photo' : 'Use this photo'}
              onPress={() => (result && result.issues.length > 0 ? retake() : photo && onUse(photo))}
            />
            <Button
              title={result && result.issues.length > 0 ? 'Use it anyway' : 'Retake'}
              variant="secondary"
              onPress={() => (result && result.issues.length > 0 ? photo && onUse(photo) : retake())}
            />
          </>
        )}
      </View>
    );
  }

  // ---- Taking a photo ----
  return (
    <View style={{ gap: 14 }}>
      <Title>{title}</Title>
      {TIPS[kind].map((t) => (
        <Text key={t} style={{ fontSize: 15, color: colors.muted }}>• {t}</Text>
      ))}
      {error && <Notice tone="error">{error}</Notice>}

      {permission?.granted ? (
        <View style={styles.cameraBox}>
          <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
          {/* The outline to line your head up with. */}
          <View pointerEvents="none" style={styles.overlay}>
            <View style={[styles.oval, kind === 'side' && { width: '58%' }]} />
          </View>
          <View style={styles.controls}>
            <Pressable accessibilityRole="button" accessibilityLabel="Switch camera" onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>Flip</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Take photo" onPress={capture} style={styles.shutter}>
              <View style={styles.shutterInner} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose from photos" onPress={fromLibrary} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>Photos</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Notice tone="note">
            {permission && !permission.canAskAgain
              ? 'Camera access is off. Turn it on in the Settings app, or choose a photo you already have.'
              : 'Shape Up needs your camera to take your photo.'}
          </Notice>
          {(!permission || permission.canAskAgain) && <Button title="Turn on camera" onPress={requestPermission} />}
          <Button title="Choose from my photos" variant="secondary" onPress={fromLibrary} />
        </View>
      )}

      {onSkip && <Button title="Skip the side photo" variant="secondary" onPress={onSkip} />}
      <Body muted>Photos are checked on your phone first. They’re only sent to make your recommendation, then deleted.</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraBox: { width: '100%', maxWidth: 480, aspectRatio: 3 / 4, alignSelf: 'center', borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  oval: { width: '66%', aspectRatio: 0.72, borderRadius: 999, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', borderStyle: 'dashed' },
  controls: { position: 'absolute', bottom: 16, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff' },
  smallBtn: { minWidth: 72, minHeight: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  smallBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  preview: { width: '100%', maxWidth: 480, aspectRatio: 3 / 4, alignSelf: 'center', borderRadius: 24, backgroundColor: colors.soft },
});
