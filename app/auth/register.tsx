import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { FormField } from '../../src/components/FormField';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleRegister = async () => {
    const newErrors: Record<string, string> = {};
    if (!email.trim()) newErrors.email = 'Email address is required';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (displayName && displayName.trim().length > 32) {
      newErrors.displayName = 'Name cannot exceed 32 characters';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      await register(email.trim(), password, displayName.trim() || undefined);
      Alert.alert('Account Created', 'Your Spendly account is ready.', [
        { text: 'Continue', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('Registration error:', err);
      Alert.alert('Registration Failed', err?.message || 'Could not create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerBox}>
          <View style={styles.iconCircle}>
            <Ionicons name="person-add" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join Spendly to manage shared hostel rooms and split expenses.
          </Text>
        </View>

        <Card style={styles.formCard}>
          <FormField
            label="Your Name (Optional, max 32 chars)"
            placeholder="e.g. Rohan Sharma"
            value={displayName}
            onChangeText={(text) => {
              setDisplayName(text);
              if (errors.displayName) setErrors((prev) => ({ ...prev, displayName: '' }));
            }}
            error={errors.displayName}
            maxLength={32}
            prefix={<Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          <FormField
            label="Email Address"
            placeholder="student@hostel.edu"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
            }}
            error={errors.email}
            prefix={<Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          <FormField
            label="Password (min 6 characters)"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
            }}
            error={errors.password}
            prefix={<Ionicons name="key-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          <FormField
            label="Confirm Password"
            placeholder="••••••••"
            secureTextEntry
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
            }}
            error={errors.confirmPassword}
            prefix={<Ionicons name="checkmark-circle-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          <Button
            title="Create Account"
            onPress={handleRegister}
            variant="primary"
            loading={loading}
            style={styles.submitBtn}
          />
        </Card>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.replace('/auth/login')}>
            <Text style={styles.switchLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerBox: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  formCard: {
    marginTop: spacing.md,
  },
  fieldIcon: {
    marginRight: spacing.sm,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  switchText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  switchLink: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  },
});
