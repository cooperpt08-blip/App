import { Redirect, Tabs } from 'expo-router';

import { colors, Loading } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { newCardCount, useShopCards } from '@/lib/useShopCards';

// The barbershop side: tabs along the bottom, big enough to tap at the chair.
export default function ShopLayout() {
  const { loading, session, membership } = useAccount();
  if (loading) return <Loading />;
  if (!session || !membership) return <Redirect href="/" />;
  return <ShopTabs />;
}

function ShopTabs() {
  const { session, membership } = useAccount();
  const { cards } = useShopCards();
  const waiting = newCardCount(cards, session?.user.id);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarStyle: { minHeight: 64 },
        tabBarIconStyle: { display: 'none' },
      }}>
      <Tabs.Screen
        name="upcoming"
        options={{
          title: 'Upcoming cuts',
          // A little count of new cut cards waiting, updated live.
          tabBarBadge: waiting > 0 ? waiting : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontWeight: '700' },
        }}
      />
      <Tabs.Screen name="schedule" options={{ title: 'Schedule' }} />
      <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
      <Tabs.Screen name="shop" options={{ title: membership?.role === 'owner' ? 'My shop' : 'Shop' }} />
    </Tabs>
  );
}
