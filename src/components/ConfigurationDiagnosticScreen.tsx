import { createThemedStyles } from '../theme/themed-styles';
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme/colors';

interface Props {
  message?: string | null;
}

export const ConfigurationDiagnosticScreen: React.FC<Props> = ({ message }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeIcon}>⚠️</Text>
        </View>

        <Text style={styles.title}>Configuration Required</Text>
        <Text style={styles.subtitle}>
          Spendly could not start Firebase Authentication because required build configuration is missing.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Diagnostic Details</Text>
          <Text style={styles.errorText}>
            {message || 'EXPO_PUBLIC_FIREBASE_API_KEY is missing from this build.'}
          </Text>

          <View style={styles.divider} />

          <Text style={styles.sectionHeader}>How to Resolve</Text>
          <Text style={styles.step}>
            <Text style={styles.stepBold}>1. Expo Dashboard: </Text>
            Navigate to expo.dev &gt; Spendly project &gt; Settings &gt; Environment Variables.
          </Text>
          <Text style={styles.step}>
            <Text style={styles.stepBold}>2. Add Variables: </Text>
            Define <Text style={styles.codeText}>EXPO_PUBLIC_FIREBASE_API_KEY</Text> and{' '}
            <Text style={styles.codeText}>EXPO_PUBLIC_FIREBASE_APP_ID</Text> for the{' '}
            <Text style={styles.codeText}>preview</Text> environment.
          </Text>
          <Text style={styles.step}>
            <Text style={styles.stepBold}>3. Rebuild: </Text>
            Run <Text style={styles.codeText}>eas build --profile preview --platform android</Text>.
          </Text>
        </View>

        <Text style={styles.footerText}>
          Authentication is safely paused to protect your account. No invalid credentials were used.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  badgeContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  badgeIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  step: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  stepBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  codeText: {
    fontFamily: 'monospace',
    color: colors.info,
    backgroundColor: colors.infoLight,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
}));
