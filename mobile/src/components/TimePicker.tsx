import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatClock, TIME_OPTIONS } from '@/lib/schedule';
import { Button, colors } from './ui';

// A full-screen list of times to tap, big enough to use at the chair.
export function TimePicker({
  visible,
  title,
  after,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  after?: string; // only offer times later than this
  onPick: (time: string) => void;
  onClose: () => void;
}) {
  const options = after ? TIME_OPTIONS.filter((t) => t > after) : TIME_OPTIONS.slice(0, -1);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {options.map((t) => (
            <Pressable
              key={t}
              accessibilityRole="button"
              onPress={() => onPick(t)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.soft }]}>
              <Text style={styles.optionText}>{formatClock(t)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={{ padding: 16 }}>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  title: { fontSize: 22, fontWeight: '700', padding: 20, paddingBottom: 8, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  option: {
    minWidth: 104,
    flexGrow: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontSize: 17, fontWeight: '600', color: colors.text },
});
