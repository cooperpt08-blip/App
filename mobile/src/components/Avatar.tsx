import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { colors } from './ui';

// A round profile photo, or the person's first initial if they haven't added one.
export function Avatar({ name, url, size = 56 }: { name: string; url?: string | null; size?: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url }} style={[shape, { backgroundColor: colors.soft }]} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[shape, { backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: colors.muted }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}
