// Shape Up: push notifications for new bookings, cancellations and cut cards.
// Called by Supabase Database Webhooks (see README) whenever a row is added to or
// changed in the appointments or cut_cards table.
//
// Security: the webhook must send the header  x-shapeup-secret: <NOTIFY_SECRET>.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

type Row = Record<string, unknown>;
type WebhookPayload = { type: 'INSERT' | 'UPDATE' | 'DELETE'; table: string; record: Row | null; old_record: Row | null };
type Push = { userIds: string[]; title: string; body: string; url: string };

// "Tue, Oct 3 at 3:00 PM" in the shop's own time zone.
function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  return `${day} at ${time}`;
}

async function firstName(db: SupabaseClient, userId: string) {
  const { data } = await db.from('profiles').select('first_name').eq('id', userId).maybeSingle();
  return (data?.first_name as string | undefined) ?? 'A client';
}

async function shopInfo(db: SupabaseClient, shopId: string) {
  const { data } = await db.from('shops').select('name, timezone').eq('id', shopId).maybeSingle();
  return { name: (data?.name as string) ?? 'your barbershop', tz: (data?.timezone as string) || 'America/New_York' };
}

async function staffOf(db: SupabaseClient, shopId: string) {
  const { data } = await db.from('shop_members').select('user_id').eq('shop_id', shopId);
  return (data ?? []).map((m) => m.user_id as string);
}

// Sends to every phone the people have signed in on, and forgets phones that no longer accept them.
export async function sendPush(db: SupabaseClient, push: Push) {
  if (push.userIds.length === 0) return 0;
  const { data: tokens } = await db.from('push_tokens').select('token').in('user_id', push.userIds);
  const list = (tokens ?? []).map((t) => t.token as string);
  if (list.length === 0) return 0;
  const messages = list.map((to) => ({ to, title: push.title, body: push.body, sound: 'default', data: { url: push.url } }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);
  const tickets: { status: string; details?: { error?: string } }[] = result?.data ?? [];
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? list[i] : null))
    .filter((t): t is string => t !== null);
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  return list.length - dead.length;
}

async function pushesFor(db: SupabaseClient, p: WebhookPayload): Promise<Push[]> {
  const row = p.record;
  const old = p.old_record;
  if (!row) return [];

  if (p.table === 'appointments') {
    const shop = await shopInfo(db, row.shop_id as string);
    const time = when(row.starts_at as string, shop.tz);
    const customer = await firstName(db, row.customer_id as string);
    if (p.type === 'INSERT' && row.status === 'booked') {
      return [{ userIds: [row.barber_id as string], title: 'New booking', body: `${customer} booked ${time}`, url: '/schedule' }];
    }
    if (p.type === 'UPDATE' && old?.status === 'booked' && row.status === 'cancelled') {
      if (row.cancelled_by === 'customer') {
        return [{ userIds: [row.barber_id as string], title: 'Booking cancelled', body: `${customer} cancelled ${time}`, url: '/schedule' }];
      }
      return [{
        userIds: [row.customer_id as string],
        title: 'Appointment cancelled',
        body: `${shop.name} cancelled your appointment on ${time}. Open Shape Up to book another time.`,
        url: '/home',
      }];
    }
    return [];
  }

  if (p.table === 'cut_cards' && p.type === 'INSERT') {
    const cut = (row.cut as { name?: string } | null)?.name ?? 'a new cut';
    const customer = (row.customer_first_name as string) || (await firstName(db, row.customer_id as string));
    const to = row.barber_id ? [row.barber_id as string] : await staffOf(db, row.shop_id as string);
    return [{ userIds: to, title: 'New cut card', body: `${customer} sent a cut card: ${cut}`, url: '/upcoming' }];
  }

  return [];
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-shapeup-secret') !== secret) {
    return new Response('Not allowed', { status: 401 });
  }
  const payload = (await req.json()) as WebhookPayload;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    let sent = 0;
    for (const push of await pushesFor(db, payload)) sent += await sendPush(db, push);
    return Response.json({ sent });
  } catch (e) {
    console.error('notify failed', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
