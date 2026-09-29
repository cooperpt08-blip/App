import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

export type Profile = {
  id: string;
  first_name: string;
  kind: 'customer' | 'staff';
  shop_id: string | null;
};

export type Membership = {
  shop_id: string;
  role: 'owner' | 'barber';
  display_name: string;
};

type AccountState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  membership: Membership | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

// Keeps track of who is signed in, their profile, and which shop they work at.
export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMembership(null);
      return;
    }
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, kind, shop_id').eq('id', s.user.id).maybeSingle(),
      supabase.from('shop_members').select('shop_id, role, display_name').eq('user_id', s.user.id).maybeSingle(),
    ]);
    setProfile((p as Profile | null) ?? null);
    setMembership((m as Membership | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Supabase asks us not to wait on other Supabase calls inside this callback.
      setTimeout(() => load(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => load(session), [load, session]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AccountContext.Provider value={{ loading, session, profile, membership, refresh, signOut }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  return value;
}
