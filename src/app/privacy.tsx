import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/lib/layout';
import { colors, fonts, spacing } from '@/theme';

const CONTACT_EMAIL = 'niketh13putta@gmail.com';
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

export default function PrivacyScreen() {
  const { formMaxWidth, horizontalPad } = useLayout();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>PRIVACY</Text>
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
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: {LAST_UPDATED}</Text>

        <Paragraph>
          ProteinQuest (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) helps you track daily
          protein intake by scanning meals with your camera. This policy explains what data we
          collect, how we use it, and the choices you have.
        </Paragraph>

        <Section title="Information we collect">
          <Bullet>Account data: an anonymous user ID created when you first open the app.</Bullet>
          <Bullet>
            Profile data: age, weight, sex, activity level, protein goal, and dragon game
            progress you choose to save.
          </Bullet>
          <Bullet>
            Meal logs: food names, estimated protein and calories, confidence scores, and optional
            meal photos you scan or log.
          </Bullet>
          <Bullet>
            Device and usage data: basic app diagnostics and page visits to keep the service
            running reliably.
          </Bullet>
        </Section>

        <Section title="Camera and photos">
          <Paragraph>
            ProteinQuest requests camera and photo library access only when you scan or choose a
            meal photo. Images are sent to our secure analysis service to estimate protein content.
            Photos may be stored in our cloud storage linked to your anonymous account so you can
            review past meals. We do not use your photos for advertising.
          </Paragraph>
        </Section>

        <Section title="AI food analysis">
          <Paragraph>
            When you scan a meal, the image is processed by an AI service to identify foods and
            estimate nutritional values. Results are estimates, not medical advice. Analysis
            requests include your authenticated session token and the image data needed to return
            results.
          </Paragraph>
        </Section>

        <Section title="Subscriptions and payments">
          <Paragraph>
            ProteinQuest Pro is an optional subscription that unlocks unlimited AI meal scans. Free
            users get 1 day of unlimited meal logging, then 1 free meal per day. Trends and
            weekly history are available to all users.
          </Paragraph>
          <Bullet>
            Mobile (iOS/Android): purchases are processed by Apple or Google via RevenueCat. We
            receive subscription status and an anonymous app user ID, not your full payment card
            details.
          </Bullet>
          <Bullet>
            Web: optional Stripe Checkout may be used when enabled. Stripe processes payment; we
            receive confirmation to unlock Pro on your account.
          </Bullet>
          <Bullet>
            Subscription data stored: whether you have an active Pro entitlement, linked to your
            anonymous account ID.
          </Bullet>
          <Paragraph>
            Subscriptions auto-renew unless cancelled at least 24 hours before the end of the
            current billing period. You can manage or cancel anytime in your device subscription
            settings (App Store or Google Play) or by contacting us. Refunds are handled by Apple
            or Google according to their policies.
          </Paragraph>
        </Section>

        <Section title="How we store data">
          <Paragraph>
            Data is stored securely with Supabase (hosted PostgreSQL database and object storage).
            Your session token is kept on your device. We use industry-standard encryption in
            transit (HTTPS/TLS). Anonymous accounts are not linked to your name, email, or phone
            unless you contact us separately.
          </Paragraph>
        </Section>

        <Section title="How we use data">
          <Bullet>Provide meal scanning, protein tracking, and dragon progression features.</Bullet>
          <Bullet>Maintain your daily logs, goals, and streaks across sessions.</Bullet>
          <Bullet>Improve reliability, fix bugs, and prevent abuse.</Bullet>
          <Paragraph>
            We do not sell your personal information. We do not show third-party ads in the app.
          </Paragraph>
        </Section>

        <Section title="Data retention and deletion">
          <Paragraph>
            Meal logs and profile data remain until you delete them or stop using the app. Because
            accounts are anonymous, reinstalling the app creates a new account. To request
            deletion of data tied to a specific session, contact us at the email below with your
            anonymous user ID from Settings (if available).
          </Paragraph>
        </Section>

        <Section title="Children">
          <Paragraph>
            ProteinQuest is not directed at children under 13. We do not knowingly collect data
            from children. Contact us if you believe a child has provided information through the
            app.
          </Paragraph>
        </Section>

        <Section title="Your rights">
          <Paragraph>
            Depending on where you live, you may have rights to access, correct, or delete your
            data. Email us to make a request. We will respond within a reasonable time.
          </Paragraph>
        </Section>

        <Section title="Changes">
          <Paragraph>
            We may update this policy as the app evolves. The &quot;Last updated&quot; date at the
            top will change when we do. Continued use after changes means you accept the updated
            policy.
          </Paragraph>
        </Section>

        <Section title="Contact">
          <Paragraph>Questions about this policy or your data:</Paragraph>
          <Pressable
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            style={styles.emailLink}>
            <Text style={styles.emailText}>{CONTACT_EMAIL}</Text>
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
