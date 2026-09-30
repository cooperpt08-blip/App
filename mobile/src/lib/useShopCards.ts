import { useCallback, useEffect, useState } from 'react';

import { useAccount } from './account';
import type { CutCardRow } from './cutCards';
import { supabase } from './supabase';

// The shop's cut cards, kept up to date live (new cards appear without refreshing).
// Shows cards still to do, plus ones finished in the last week.
export function useShopCards() {
  const { membership } = useAccount();
  const [cards, setCards] = useState<CutCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from('cut_cards')
      .select('*')
      .eq('shop_id', membership.shop_id)
      .or(`status.neq.done,updated_at.gte.${weekAgo}`)
      .order('created_at', { ascending: false })
      .limit(200);
    setLoading(false);
    if (error) return setError(error.message);
    setError(null);
    setCards((data as CutCardRow[]) ?? []);
  }, [membership]);

  useEffect(() => {
    load();
    if (!membership) return;
    const channel = supabase
      .channel(`cut-cards-${membership.shop_id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cut_cards', filter: `shop_id=eq.${membership.shop_id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  return { cards, loading, error, reload: load };
}

// How many new cards are waiting for me: sent to me, or to anyone at the shop.
export function newCardCount(cards: CutCardRow[], myId: string | undefined) {
  return cards.filter((c) => c.status === 'new' && (c.barber_id === null || c.barber_id === myId)).length;
}
