import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/components/ui';
import { AccountProvider } from '@/lib/account';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </AccountProvider>
    </SafeAreaProvider>
  );
}
