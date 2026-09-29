import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { registerForPush, unregisterPush } from './notifications';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  first_name: string;
  kind: 'customer' | 'staff';
  shop_id: string | null;
  avatar_updated_at: string | null;
  // undefined = the database doesn't have birthdays yet (update not run); null = not given yet.
  birth_date?: string | null;
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
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

// Keeps track of who is signed in, their profile, and which shop they work at.
export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMembership(null);
      setIsAdmin(false);
      return;
    }
    const [first, { data: m }, { data: admin }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('shop_members').select('shop_id, role, display_name').eq('user_id', s.user.id).maybeSingle(),
      supabase.rpc('is_app_admin'),
    ]);
    // select('*') keeps working whichever database updates have been run so far.
    const p: unknown = first.data ? { avatar_updated_at: null, ...first.data } : null;
    setProfile((p as Profile | null) ?? null);
    setMembership((m as Membership | null) ?? null);
    setIsAdmin(admin === true);
    // Barbers need to hear about new bookings, so ask them right away. Customers are
    // asked after they book; here they're only registered if they already said yes.
    registerForPush(Boolean(m));
  }, []);

  // Whose account is loaded right now, so a routine sign-in refresh doesn't reload everything.
  const loadedUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      const userId = s?.user.id ?? null;
      if (userId === loadedUser.current) {
        setSession(s);
        return;
      }
      // A different person signed in or out: hold every screen on "loading" until
      // their profile and shop are loaded, so nobody gets sent to the wrong place.
      loadedUser.current = userId;
      setLoading(true);
      setSession(s);
      // Supabase asks us not to wait on other Supabase calls inside this callback.
      setTimeout(async () => {
        await load(s);
        setLoading(false);
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(() => load(session), [load, session]);
  const signOut = useCallback(async () => {
    await unregisterPush();
    await supabase.auth.signOut();
  }, []);

  return (
    <AccountContext.Provider value={{ loading, session, profile, membership, isAdmin, refresh, signOut }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider');
  return value;
}
