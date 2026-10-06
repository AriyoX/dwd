import { Linking, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LEGAL_CONTACT, LEGAL_UPDATED, PRIVACY_POLICY, TERMS_OF_SERVICE } from '@dwd/core';
import { PrimaryButton } from '@/components/primary-button';
import { Panel, Screen, ScreenHeading } from '@/components/screen';
import { useTheme } from '@/providers/theme-provider';
import { useState } from 'react';
import { Notice } from '@/components/screen';
export default function LegalScreen() {
  const { document } = useLocalSearchParams<{ document?: string }>();
  const policy = document === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY;
  const { typography } = useTheme();
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <Screen insetTop={false}>
      <ScreenHeading title={policy.title} />
      <Text style={typography.body}>Updated {LEGAL_UPDATED}</Text>
      <Text style={typography.body}>{policy.introduction}</Text>
      {policy.sections.map((section) => (
        <Panel key={section.title}>
          <Text accessibilityRole="header" style={typography.sectionTitle}>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={typography.body}>
              {paragraph}
            </Text>
          ))}
        </Panel>
      ))}
      <PrimaryButton
        label={LEGAL_CONTACT.email}
        variant="quiet"
        onPress={() =>
          void Linking.openURL(`mailto:${LEGAL_CONTACT.email}`).catch(() =>
            setIssue('Could not open email. Contact ' + LEGAL_CONTACT.email + ' directly.'),
          )
        }
      />
      {issue ? <Notice error message={issue} /> : null}
    </Screen>
  );
}
