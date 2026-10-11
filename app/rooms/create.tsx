import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { RoomClientService } from '../../src/services/room-service';
import { FormField } from '../../src/components/FormField';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { colors } from '../../src/theme/colors';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function CreateRoomScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErrors({ name: 'Room name is required' });
      return;
    }
    if (trimmed.length > 50) {
      setErrors({ name: 'Room name cannot exceed 50 characters' });
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      const room = await RoomClientService.createRoom(trimmed, description.trim() || undefined);
      router.replace(`/rooms/${room._id}`);
    } catch (err: any) {
      console.error('Create room error:', err);
      Alert.alert('Create Room Failed', err?.message || 'Could not create room.');
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
            <Ionicons name="home" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>Create Shared Room</Text>
          <Text style={styles.subtitle}>
            Set up a room for your hostel, flat, or group of roommates.
          </Text>
        </View>

        <Card style={styles.formCard}>
          <FormField
            label="Room Name"
            placeholder="e.g. Room 302 — Ganga Hostel"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
            }}
            error={errors.name}
            maxLength={50}
            prefix={<Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
          />

          <FormField
            label="Description / Notes (Optional, max 200 chars)"
            placeholder="e.g. 3rd floor wing, Spring semester 2026"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={200}
            inputStyle={styles.textArea}
          />

          <View style={styles.adminNoteBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={styles.adminNoteText}>
              You will be the Room Admin and can invite or remove roommates.
            </Text>
          </View>

          <Button
            title="Create Room"
            onPress={handleCreate}
            variant="primary"
            loading={loading}
            style={styles.submitBtn}
          />
        </Card>
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
    maxWidth: 300,
  },
  formCard: {
    marginTop: spacing.md,
  },
  fieldIcon: {
    marginRight: spacing.sm,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  adminNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: spacing.sm,
    borderRadius: 8,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  adminNoteText: {
    ...typography.caption,
    color: colors.primaryDark,
    flex: 1,
    lineHeight: 16,
  },
  submitBtn: {
    marginTop: spacing.xs,
  },
});
