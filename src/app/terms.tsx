import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { SITE_URL } from '@/lib/site';
import { colors, fonts, spacing } from '@/theme';

const CONTACT_EMAIL = 'niketh13putta@gmail.com';
const PRIVACY_URL = `${SITE_URL}/privacy`;
const LAST_UPDATED = 'June 11, 2026';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: string }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function TermsScreen() {
  const { formMaxWidth, horizontalPad } = useLayout();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>TERMS</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: horizontalPad,
            maxWidth: formMaxWidth,
            width: '100%',
            alignSelf: 'center',
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Terms of Use</Text>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <Paragraph>
          These Terms of Use (&quot;Terms&quot;) govern your use of ProteinQuest (&quot;the app&quot;,
          &quot;we&quot;, &quot;our&quot;). By downloading, accessing, or using the app you agree to
          these Terms and our Privacy Policy.
        </Paragraph>

        <Section title="The service">
          <Paragraph>
            ProteinQuest provides AI-assisted meal scanning and protein tracking for informational
            and wellness purposes. Nutritional estimates are not medical advice. Consult a
            qualified professional for dietary or health decisions.
          </Paragraph>
        </Section>

        <Section title="Accounts">
          <Paragraph>
            The app uses anonymous accounts tied to your device. You are responsible for activity
            on your account. We may suspend access if we detect abuse or violations of these Terms.
          </Paragraph>
        </Section>

        <Section title="ProteinQuest Pro subscriptions">
          <Bullet>
            ProteinQuest Pro is an auto-renewing subscription that unlocks unlimited AI scans.
          </Bullet>
          <Bullet>
            Weekly plan: $4.99 per week. Yearly plan: $2.49/month, billed as $29.99 annually.
          </Bullet>
          <Bullet>
            Payment is charged to your Apple ID or Google Play account at confirmation of purchase.
          </Bullet>
          <Bullet>
            Subscriptions automatically renew unless cancelled at least 24 hours before the end of
            the current billing period.
          </Bullet>
          <Bullet>
            Manage or cancel anytime in your device subscription settings (App Store or Google
            Play).
          </Bullet>
          <Bullet>
            Refunds are handled by Apple or Google according to their policies, not directly by
            us.
          </Bullet>
          <Bullet>
            Free tier includes a 2-day unlimited scan trial, then 1 free AI scan per day. Pro unlocks unlimited scans.
          </Bullet>
        </Section>

        <Section title="Acceptable use">
          <Paragraph>
            Do not misuse the app, attempt to reverse engineer our services, upload unlawful
            content, or interfere with other users. Meal photos you submit must be yours or used
            with permission.
          </Paragraph>
        </Section>

        <Section title="Intellectual property">
          <Paragraph>
            ProteinQuest, its branding, dragon characters, and software are owned by us or our
            licensors. You receive a limited, non-transferable license to use the app for personal,
            non-commercial purposes.
          </Paragraph>
        </Section>

        <Section title="Disclaimer">
          <Paragraph>
            The app is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
            accuracy of AI nutritional estimates or uninterrupted availability.
          </Paragraph>
        </Section>

        <Section title="Limitation of liability">
          <Paragraph>
            To the maximum extent permitted by law, we are not liable for indirect, incidental, or
            consequential damages arising from your use of the app.
          </Paragraph>
        </Section>

        <Section title="Changes">
          <Paragraph>
            We may update these Terms as the app evolves. Continued use after changes means you
            accept the updated Terms. The date at the top indicates the latest revision.
          </Paragraph>
        </Section>

        <Section title="Contact">
          <Paragraph>Questions about these Terms:</Paragraph>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            style={styles.emailLink}>
            <Text style={styles.emailText}>{CONTACT_EMAIL}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} style={styles.emailLink}>
            <Text style={styles.emailText}>Privacy Policy</Text>
          </Pressable>
        </Section>

        {Platform.OS === 'web' ? (
          <Text style={styles.footer}>ProteinQuest · proteinquest.app</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
  },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  updated: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 17,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 6,
    paddingRight: spacing.sm,
  },
  bulletDot: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.accent,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  emailLink: { marginTop: 4 },
  emailText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.accent,
  },
  footer: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
