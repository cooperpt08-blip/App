import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// These two values come from your Supabase project (Project Settings -> API).
// They're meant to be inside the app: the security rules in the database are
// what keep data private, not these keys. Put them in mobile/.env.local.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// During a web build there's no browser storage yet, so sessions aren't saved there.
const canStore = Platform.OS !== 'web' || typeof window !== 'undefined';

export const supabase = createClient(url ?? 'https://not-configured.supabase.co', anonKey ?? 'not-configured', {
  auth: {
    storage: canStore ? AsyncStorage : undefined,
    autoRefreshToken: true,
    persistSession: canStore,
    detectSessionInUrl: false,
  },
});

// Keep the sign-in fresh only while the app is open.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// Turns a database or network error into a sentence a person can act on.
export function friendlyError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    if (error.message.includes('certificate')) {
      return 'Couldn’t connect securely. The Wi-Fi you’re on may be blocking Shape Up. Try another network or cellular data.';
    }
    if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed') || error.message.includes('fetch failed')) {
      return "Can't reach Shape Up. Check your internet connection and try again.";
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
