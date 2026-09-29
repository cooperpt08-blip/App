import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export const PROFILE_BUCKET = 'profile-photos';

export function avatarPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

// Lets the person take or choose a photo, cropped square, then shrinks it so it
// uploads fast. Returns null if they cancel.
export async function pickSquarePhoto(source: 'camera' | 'library', square = true): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = square
    ? { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 }
    : { mediaTypes: ['images'], quality: 1 };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Shape Up needs camera access. You can turn it on in Settings.');
  }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

// Shrinks a photo and returns it as JPEG bytes ready to upload.
async function toJpegBytes(uri: string, maxSide: number): Promise<ArrayBuffer> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: maxSide }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error('Could not read that photo. Try another one.');
  const binary = atob(saved.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// A recommendation photo: shrunk to 1024px wide JPEG, with the base64 text the
// server needs. Kept only in memory.
export async function prepareRecommendationPhoto(uri: string): Promise<{ uri: string; base64: string }> {
  const rendered = await ImageManipulator.manipulate(uri).resize({ width: 1024 }).renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error('Could not read that photo. Try another one.');
  return { uri: saved.uri, base64: saved.base64 };
}

export async function uploadProfilePhoto(userId: string, uri: string) {
  const bytes = await toJpegBytes(uri, 600);
  const { error } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(avatarPath(userId), bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { error: saveError } = await supabase
    .from('profiles')
    .update({ avatar_updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (saveError) throw saveError;
}

export async function removeProfilePhoto(userId: string) {
  const { error } = await supabase.storage.from(PROFILE_BUCKET).remove([avatarPath(userId)]);
  if (error) throw error;
  const { error: saveError } = await supabase.from('profiles').update({ avatar_updated_at: null }).eq('id', userId);
  if (saveError) throw saveError;
}

// Private photos can't be opened by a plain link. This asks Supabase for
// temporary links (valid 1 hour) for the people we're allowed to see.
export async function profilePhotoUrls(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrls(userIds.map(avatarPath), 3600);
  const urls: Record<string, string> = {};
  data?.forEach((item, i) => {
    if (item.signedUrl) urls[userIds[i]] = item.signedUrl;
  });
  return urls;
}
