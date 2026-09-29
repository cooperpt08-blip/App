// Shape Up: permanently delete the signed-in person's account and data.
// Called from the app (Settings -> Delete account). Apple requires this.
//
// Deletes their photos (profile and cut card photos), then the account itself, which
// removes their profile, recommendations, cut cards, appointments, team membership and
// phone tokens (the database cascades these).
//
// Shop owners must first choose what happens to their shop (the app asks):
//   * hand it to a barber (they're then no longer the owner), or
//   * invite a new owner by email (the shop keeps running until they accept), or
//   * close it: the app sends { "closeShop": true } and only then is the shop deleted.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

// Every file path under a folder (Supabase storage lists one level at a time).
async function listAll(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = folder ? `${folder}/${item.name}` : item.name;
    if (item.id === null) paths.push(...(await listAll(admin, bucket, path))); // a sub-folder
    else paths.push(path);
  }
  return paths;
}

async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Who is asking? Only the signed-in person can delete their own account.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await asUser.auth.getUser();
  if (userError || !userData.user) return reply(401, { error: 'Please sign in again, then try deleting your account.' });
  const userId = userData.user.id;

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = await req.json().catch(() => ({}));
  const closeShop = body?.closeShop === true;

  try {
    // 1. Shops they own.
    const { data: owned } = await admin.from('shops').select('id').eq('owner_id', userId);
    for (const shop of owned ?? []) {
      const { data: pending } = await admin.from('shop_owner_invites').select('email').eq('shop_id', shop.id).maybeSingle();
      if (pending) continue; // a new owner is invited: the shop stays and waits for them
      if (!closeShop) {
        return reply(409, {
          error: 'Choose who takes over your shop first, or confirm that your shop is closing.',
          needsShopDecision: true,
        });
      }
      // The shop is closing: remove every photo in it, then the shop and all its data.
      await removeAll(admin, 'cut-card-photos', await listAll(admin, 'cut-card-photos', shop.id));
      const { error } = await admin.from('shops').delete().eq('id', shop.id);
      if (error) throw error;
    }

    // 2. Cut card photos they sent to other shops (stored under <shop>/<customer>/...).
    const { data: cards } = await admin.from('cut_cards').select('shop_id').eq('customer_id', userId);
    const shopIds = [...new Set((cards ?? []).map((c) => c.shop_id as string))];
    for (const shopId of shopIds) {
      await removeAll(admin, 'cut-card-photos', await listAll(admin, 'cut-card-photos', `${shopId}/${userId}`));
    }

    // 3. Their profile photo.
    await removeAll(admin, 'profile-photos', await listAll(admin, 'profile-photos', userId));

    // 4. The account itself. Everything else linked to it is deleted by the database.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return reply(200, { deleted: true });
  } catch (e) {
    console.error('delete-account failed', userId, e);
    return reply(500, { error: 'We couldn’t finish deleting your account. Please try again, or contact support.' });
  }
});
