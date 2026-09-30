// Shape Up: delete shared photos when they expire.
// Run once a day by Supabase Cron (see README). A photo a customer shared with their
// barbershop is deleted 7 days after the appointment, or 30 days after it was sent if
// there was no appointment. The cut card itself stays (without photos) so the shop
// keeps the client's cut history.
//
// Security: the cron job must send the header  x-shapeup-secret: <NOTIFY_SECRET>.
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'cut-card-photos';

Deno.serve(async (req) => {
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret || req.headers.get('x-shapeup-secret') !== secret) {
    return new Response('Not allowed', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: expired, error } = await db
    .from('cut_cards')
    .select('id, shop_id, customer_id')
    .is('photos_deleted_at', null)
    .lt('photos_delete_after', new Date().toISOString())
    .limit(500);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let cards = 0;
  let files = 0;
  const failures: string[] = [];
  for (const card of expired ?? []) {
    const folder = `${card.shop_id}/${card.customer_id}/${card.id}`;
    const { data: list, error: listError } = await db.storage.from(BUCKET).list(folder, { limit: 100 });
    if (listError) {
      failures.push(card.id);
      continue;
    }
    const paths = (list ?? []).map((f) => `${folder}/${f.name}`);
    if (paths.length) {
      const { error: removeError } = await db.storage.from(BUCKET).remove(paths);
      if (removeError) {
        failures.push(card.id);
        continue; // try again tomorrow
      }
      files += paths.length;
    }
    await db
      .from('cut_cards')
      .update({ photos_deleted_at: new Date().toISOString(), has_front_photo: false, has_side_photo: false, has_preview: false })
      .eq('id', card.id);
    cards++;
  }

  return Response.json({ cards, files, failures: failures.length });
});
