// Shared pieces for the Clients tab and cut card sharing.

// What a barber's scanner looks for, so it can't be confused with other QR codes.
export const CLIENT_CODE_PREFIX = 'shapeup-client:';

// Accepts a scanned QR value or a typed code like "ABCD-EFGH" and returns "ABCDEFGH".
export function parseClientCode(value: string): string | null {
  const raw = value.startsWith(CLIENT_CODE_PREFIX) ? value.slice(CLIENT_CODE_PREFIX.length) : value;
  const code = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return code.length === 8 ? code : null;
}

export type ShopClient = {
  customer_id: string;
  first_name: string;
  avatar_updated_at: string | null;
  linked: boolean;
  shared: boolean;
  usual_cut: string | null;
  usual_cut_is_note: boolean;
  last_cut_at: string | null;
  mine: boolean;
};

export type ClientCutCard = {
  card_id: string;
  from_this_shop: boolean;
  cut: {
    name: string;
    tellYourBarber?: string;
    styling?: string;
    product?: string;
    upkeep?: string;
  };
  hair: Record<string, string | string[]>;
  customer_note: string;
  created_at: string;
  appointment_at: string | null;
  status: string | null;
  barber_name: string | null;
};

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
