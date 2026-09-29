import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show notifications as a banner even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushStatus = 'on' | 'off' | 'not-asked' | 'unavailable';

// The phone's token for this app, remembered so we can remove it on sign-out.
let currentToken: string | null = null;

// The Expo project id comes from running "npx eas-cli init" once (see README).
function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' ? 'on' : status === 'denied' ? 'off' : 'not-asked';
}

// Turns on notifications for this phone and the signed-in person.
// With ask = false it only registers if they already said yes before (no pop-up).
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  try {
    if (!Device.isDevice || !projectId()) return 'unavailable';
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Shape Up',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return status === 'denied' ? 'off' : 'not-asked';

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return 'on';
  } catch (e) {
    console.warn('Could not turn on notifications', e);
    return 'unavailable';
  }
}

// On sign-out, stop this phone getting the old account's notifications.
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}
