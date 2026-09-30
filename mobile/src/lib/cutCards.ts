import { supabase } from './supabase';

// Shared pieces for cut cards: the card a customer sends to their barbershop.

export const CARD_BUCKET = 'cut-card-photos';

export type CardStatus = 'new' | 'seen' | 'in_chair' | 'done';

export const STATUS_LABEL: Record<CardStatus, string> = {
  new: 'New',
  seen: 'Seen',
  in_chair: 'In the chair',
  done: 'Done',
};

export type CutCardRow = {
  id: string;
  shop_id: string;
  customer_id: string;
  barber_id: string | null;
  customer_first_name: string;
  cut: {
    name: string;
    tellYourBarber?: string;
    styling?: string;
    product?: string;
    upkeep?: string;
    growOutFirst?: string;
  };
  hair: Record<string, string | string[]>;
  customer_note: string;
  appointment_at: string | null;
  status: CardStatus;
  barber_notes: string;
  has_front_photo?: boolean;
  has_side_photo: boolean;
  photos_deleted_at: string | null;
  photos_delete_after: string;
  created_at: string;
};

// Photos live in private storage at <shop>/<customer>/<card>/front.jpg (and side.jpg).
export function cardPhotoPath(card: { shop_id: string; customer_id: string; id: string }, which: 'front' | 'side') {
  return `${card.shop_id}/${card.customer_id}/${card.id}/${which}.jpg`;
}

// A random id for a new card (made in the app so photos can be uploaded first).
export function newId(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function uploadCardPhoto(path: string, base64: string) {
  const { error } = await supabase.storage
    .from(CARD_BUCKET)
    .upload(path, base64ToBytes(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}

// Temporary links (1 hour) to a card's photos, for people allowed to see them.
export async function cardPhotoUrls(card: CutCardRow): Promise<{ front?: string; side?: string }> {
  if (card.photos_deleted_at) return {};
  const paths: { key: 'front' | 'side'; path: string }[] = [];
  if (card.has_front_photo) paths.push({ key: 'front', path: cardPhotoPath(card, 'front') });
  if (card.has_side_photo) paths.push({ key: 'side', path: cardPhotoPath(card, 'side') });
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(CARD_BUCKET).createSignedUrls(paths.map((p) => p.path), 3600);
  const urls: { front?: string; side?: string } = {};
  data?.forEach((d, i) => {
    if (d.signedUrl) urls[paths[i].key] = d.signedUrl;
  });
  return urls;
}

// "Wavy · Medium strands · Thick · Cowlick, Glasses"
export function hairSummary(hair: CutCardRow['hair']): string {
  const parts: string[] = [];
  if (hair.texture) parts.push(String(hair.texture));
  if (hair.thickness) parts.push(`${hair.thickness} strands`);
  if (hair.density) parts.push(`${hair.density} density`);
  if (hair.topLength) parts.push(`currently ${hair.topLength} on top`);
  if (Array.isArray(hair.workAround) && hair.workAround.length) parts.push(`work around: ${hair.workAround.join(', ')}`);
  return parts.join(' · ');
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'No appointment set';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
