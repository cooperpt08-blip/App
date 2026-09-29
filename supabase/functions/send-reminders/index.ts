// Shape Up: remind customers about their appointment the day before.
// Run every hour by Supabase Cron (see README). Each appointment gets one reminder,
// sent when it's less than a day away. Bookings made in the last 3 hours before the
// appointment don't get one (the customer just booked it).
//
// Security: the cron job must send the header  x-shapeup-secret: <NOTIFY_SECRET>.
import { createClient } from 'npm:@supabase/supabase-js@2';

const HOUR = 60 * 60 * 1000;

// "today" or "tomorrow" (or the weekday) in the shop's time zone, plus the time.
function describe(iso: string, timeZone: string) {
  const dayOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone }); // YYYY-MM-DD
  const start = new Date(iso);
  const time = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  const today = dayOf(new Date());
  const tomorrow = dayOf(new Date(Date.now() + 24 * HOUR));
  const day = dayOf(start) === today ? 'today' : dayOf(start) === tomorrow ? 'tomorrow'
    : start.toLocaleDateString('en-US', { weekday: 'long', timeZone });
  return `${day} at ${time}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-shapeup-secret') !== secret) {
    return new Response('Not allowed', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = Date.now();

  const { data: due, error } = await db
    .from('appointments')
    .select('id, shop_id, barber_id, customer_id, starts_at, created_at')
    .eq('status', 'booked')
    .is('reminder_sent_at', null)
    .gte('starts_at', new Date(now + 1 * HOUR).toISOString())
    .lte('starts_at', new Date(now + 24 * HOUR).toISOString());
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let reminded = 0;
  for (const a of due ?? []) {
    const startsAt = new Date(a.starts_at).getTime();
    const bookedAt = new Date(a.created_at).getTime();

    // Mark it first, so a slow run can never send the same reminder twice.
    const { data: claimed } = await db
      .from('appointments')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', a.id)
      .is('reminder_sent_at', null)
      .select('id');
    if (!claimed?.length) continue;
    if (startsAt - bookedAt < 3 * HOUR) continue; // booked moments ago: no reminder needed

    const [{ data: shop }, { data: barber }, { data: tokens }] = await Promise.all([
      db.from('shops').select('name, timezone').eq('id', a.shop_id).maybeSingle(),
      db.from('shop_members').select('display_name').eq('shop_id', a.shop_id).eq('user_id', a.barber_id).maybeSingle(),
      db.from('push_tokens').select('token').eq('user_id', a.customer_id),
    ]);
    if (!tokens?.length) continue;

    const tz = (shop?.timezone as string) || 'America/New_York';
    const withWho = barber?.display_name ? ` with ${barber.display_name}` : '';
    const body = `Your haircut is ${describe(a.starts_at, tz)}${withWho} at ${shop?.name ?? 'your barbershop'}. Can’t make it? Cancel in the app so someone else can book.`;
    const messages = tokens.map((t) => ({
      to: t.token,
      title: 'Haircut reminder',
      body,
      sound: 'default',
      data: { url: '/home' },
    }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (res.ok) reminded++;
  }

  return Response.json({ checked: due?.length ?? 0, reminded });
});
