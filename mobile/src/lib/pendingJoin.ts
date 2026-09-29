import AsyncStorage from '@react-native-async-storage/async-storage';

// If someone scans a shop's QR code before they've signed in, we remember the
// code here and link them to the shop right after they finish signing up.
const KEY = 'shapeup.pendingJoinCode';

export async function savePendingJoin(code: string) {
  await AsyncStorage.setItem(KEY, code);
}

export async function takePendingJoin(): Promise<string | null> {
  const code = await AsyncStorage.getItem(KEY);
  if (code) await AsyncStorage.removeItem(KEY);
  return code;
}
