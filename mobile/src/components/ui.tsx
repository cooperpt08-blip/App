// Shared building blocks so every screen looks the same.
// Buttons and inputs are at least 56 points tall so they're easy to hit at the chair.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  bg: '#fafaf9',
  card: '#ffffff',
  ink: '#1c1917',
  inkText: '#ffffff',
  text: '#1c1917',
  muted: '#78716c',
  line: '#e7e5e4',
  soft: '#f5f5f4',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  good: '#15803d',
  goodSoft: '#f0fdf4',
  note: '#78350f',
  noteSoft: '#fffbeb',
};

// A full screen with safe margins. Content is centered and capped in width so
// it looks right on a tablet too.
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{body}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Body({ children, muted, center }: { children: ReactNode; muted?: boolean; center?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, center && { textAlign: 'center' }]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? colors.inkText : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: primary ? colors.inkText : variant === 'danger' ? colors.danger : colors.text },
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, props.multiline && { minHeight: 110 }]} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'success' | 'note' }) {
  const palette = {
    info: [colors.soft, colors.text],
    error: [colors.dangerSoft, colors.danger],
    success: [colors.goodSoft, colors.good],
    note: [colors.noteSoft, colors.note],
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette[0] }]}>
      <Text style={{ color: palette[1], fontSize: 15, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 24 },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 18, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, lineHeight: 34 },
  eyebrow: { fontSize: 13, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.muted },
  body: { fontSize: 17, lineHeight: 24, color: colors.text },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted },
  button: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: '#d6d3d1' },
  buttonText: { fontSize: 17, fontWeight: '600' },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
  },
  hint: { fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12 },
  notice: { borderRadius: 14, padding: 14 },
});
