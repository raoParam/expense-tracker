import { createThemedStyles } from '../../src/theme/themed-styles';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoomClientService, InvitationInfo } from '../../src/services/room-service';
import { FormField } from '../../src/components/FormField';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

export default function JoinRoomScreen() {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [preview, setPreview] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCodeChange = async (text: string) => {
    const clean = text.toUpperCase().trim();
    setInviteCode(clean);
    setError(null);

    // When a code of length 6+ is entered, trigger quick preview lookup
    if (clean.length >= 6) {
      setLookingUp(true);
      try {
        const info = await RoomClientService.getInvitationInfo(clean);
        setPreview(info);
      } catch (err: any) {
        setPreview(null);
      } finally {
        setLookingUp(false);
      }
    } else {
      setPreview(null);
    }
  };

  const handleJoin = async () => {
    const clean = inviteCode.trim().toUpperCase();
    if (!clean) {
      setError('Please enter an invite code');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const room = await RoomClientService.acceptInvitation(clean);
      Alert.alert('Joined Room', `You have successfully joined "${room.name}".`, [
        {
          text: 'Open Room',
          onPress: () => router.replace(`/rooms/${room._id}`),
        },
      ]);
    } catch (err: any) {
      console.error('Join room error:', err);
      setError(err?.message || 'Could not join room with this code.');
      Alert.alert('Join Failed', err?.message || 'Invalid or expired invite code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      containerStyle={styles.container}
      contentContainerStyle={styles.content}
    >
        <View style={styles.headerBox}>
          <View style={styles.iconCircle}>
            <Ionicons name="enter-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Join Room</Text>
          <Text style={styles.subtitle}>
            Enter the 6-character invite code shared by your room admin.
          </Text>
        </View>

        <Card style={styles.formCard}>
          <FormField
            label="Invite Code"
            placeholder="e.g. SP-9X2A"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
            value={inviteCode}
            onChangeText={handleCodeChange}
            error={error || undefined}
            maxLength={12}
            inputStyle={styles.codeInput}
            prefix={<Ionicons name="key-outline" size={20} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          {lookingUp && (
            <View style={styles.lookupRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.lookupText}>Checking invitation code...</Text>
            </View>
          )}

          {preview && (
            <View style={styles.previewBox}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={styles.previewInfo}>
                <Text style={styles.previewRoomName}>{preview.roomName}</Text>
                <Text style={styles.previewExpires}>
                  Expires: {new Date(preview.expiresAt).toLocaleDateString('en-IN')}
                </Text>
              </View>
            </View>
          )}

          <Button
            title="Join Room"
            onPress={handleJoin}
            variant="primary"
            loading={loading}
            style={styles.submitBtn}
          />
        </Card>
    </KeyboardAwareScrollView>
  );
}

const styles = createThemedStyles(() => ({
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
    maxWidth: 290,
  },
  formCard: {
    marginTop: spacing.md,
  },
  fieldIcon: {
    marginRight: spacing.sm,
  },
  codeInput: {
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 18,
  },
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  lookupText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: 8,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.successText,
  },
  previewInfo: {
    flex: 1,
  },
  previewRoomName: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.successText,
  },
  previewExpires: {
    ...typography.caption,
    color: colors.successText,
    fontSize: 11,
  },
  submitBtn: {
    marginTop: spacing.xs,
  },
}));
