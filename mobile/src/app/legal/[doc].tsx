import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { Body, Button, colors, Eyebrow, Screen, Title } from '@/components/ui';
import { LEGAL_EFFECTIVE, PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/lib/legal';

// Shows the Privacy Policy (/legal/privacy) or the Terms of Service (/legal/terms).
export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const isTerms = doc === 'terms';
  const sections = isTerms ? TERMS_OF_SERVICE : PRIVACY_POLICY;

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Eyebrow>Shape Up</Eyebrow>
      <Title>{isTerms ? 'Terms of Service' : 'Privacy Policy'}</Title>
      <Body muted>Last updated: {LEGAL_EFFECTIVE}</Body>
      {sections.map((section) => (
        <View key={section.heading} style={{ gap: 8 }}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text }}>{section.heading}</Text>
          {section.paragraphs.map((p, i) => (
            <Body key={i}>{p}</Body>
          ))}
        </View>
      ))}
    </Screen>
  );
}
