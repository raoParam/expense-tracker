import { createThemedStyles } from '../../../src/theme/themed-styles';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Room, RoomClientService } from '../../../src/services/room-service';
import { ExpenseClientService } from '../../../src/services/expense-client';
import { useAuth } from '../../../src/context/AuthContext';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { FormField } from '../../../src/components/FormField';
import { colors } from '../../../src/theme/colors';
import { spacing, radii } from '../../../src/theme/spacing';
import { typography } from '../../../src/theme/typography';
import { SplitType, SplitParticipantInput, calculateClientShares } from '../../../src/domain/split';
import { validateRupeeInput, rupeesToPaise, paiseToRupees } from '../../../src/domain/money';
import { LIMITS } from '../../../src/constants/limits';
import { KeyboardAwareScrollView } from '../../../src/components/KeyboardAwareScrollView';

export default function CreateSharedExpenseScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [room, setRoom] = useState<Room | null>(null);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [splitType, setSplitType] = useState<SplitType>('equal');

  // Participants State
  const [participants, setParticipants] = useState<SplitParticipantInput[]>([]);

  useEffect(() => {
    async function loadRoom() {
      if (!roomId) return;
      try {
        setLoadingRoom(true);
        const data = await RoomClientService.getRoomById(roomId);
        setRoom(data);

        // Initialize active members as participants
        const active = data.members.filter((m) => m.status === 'active');
        const initialParticipants: SplitParticipantInput[] = active.map((m) => ({
          userId: m.userId,
          displayName: m.displayName || m.email || 'Member',
          email: m.email,
          selected: true,
          amountRupees: '',
          percentage: '',
          quantity: '1',
          unitPriceRupees: '',
        }));

        setParticipants(initialParticipants);
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to load room members.');
      } finally {
        setLoadingRoom(false);
      }
    }

    loadRoom();
  }, [roomId]);

  const totalPaise = useMemo(() => {
    const res = validateRupeeInput(amountRupees);
    return res.isValid && res.paise ? res.paise : 0;
  }, [amountRupees]);

  // Live split calculation
  const { shares, error: splitError } = useMemo(() => {
    if (!user || totalPaise <= 0) {
      return { shares: [], error: undefined };
    }
    return calculateClientShares(splitType, totalPaise, participants, user.uid);
  }, [splitType, totalPaise, participants, user]);

  const toggleParticipant = (userId: string) => {
    if (userId === user?.uid) {
      Alert.alert('Notice', 'As the payer, you must be included in the shared expense.');
      return;
    }

    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, selected: !p.selected } : p))
    );
  };

  const updateParticipantField = (
    userId: string,
    field: keyof SplitParticipantInput,
    value: string
  ) => {
    setParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, [field]: value } : p))
    );
  };

  const handleSubmit = async () => {
    if (!room || !user || submitting) return;
    setErrorMessage(null);

    if (totalPaise <= 0) {
      setErrorMessage('Please enter a valid expense amount greater than ₹0.');
      return;
    }

    if (totalPaise > LIMITS.MAX_EXPENSE_PAISE) {
      setErrorMessage(`Expense cannot exceed maximum limit of ₹${LIMITS.MAX_EXPENSE_RUPEES}.`);
      return;
    }

    const selectedParticipants = participants.filter((p) => p.selected !== false);
    if (selectedParticipants.length < 2) {
      setErrorMessage('Select at least 2 participants (including you as payer).');
      return;
    }

    if (splitError) {
      setErrorMessage(splitError);
      return;
    }

    // Build payload
    let participantsPayload: any[] = [];

    if (splitType === 'equal') {
      participantsPayload = selectedParticipants.map((p) => ({
        userId: p.userId,
      }));
    } else if (splitType === 'custom') {
      participantsPayload = selectedParticipants.map((p) => ({
        userId: p.userId,
        sharePaise: rupeesToPaise(p.amountRupees || '0'),
      }));
    } else if (splitType === 'percentage') {
      participantsPayload = selectedParticipants.map((p) => ({
        userId: p.userId,
        percentage: parseFloat(p.percentage || '0'),
      }));
    } else if (splitType === 'quantity') {
      participantsPayload = selectedParticipants.map((p) => ({
        userId: p.userId,
        quantity: parseInt(p.quantity || '1', 10),
        unitPricePaise: rupeesToPaise(p.unitPriceRupees || '0'),
      }));
    }

    setSubmitting(true);
    try {
      await ExpenseClientService.createExpense(room._id, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        amountPaise: totalPaise,
        splitType,
        participants: participantsPayload,
        idempotencyKey: `exp_${user.uid}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      });

      Alert.alert('Success', 'Shared expense created! Pending member acknowledgements.', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (err: any) {
      if (err?.code === 'CREATOR_RESTRICTED') {
        setErrorMessage(
          'You are temporarily restricted from creating room expenses for 24 hours due to unanimous rejection by your roommates.'
        );
      } else {
        setErrorMessage(err?.message || 'Failed to create shared expense.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingRoom) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading room members...</Text>
      </View>
    );
  }

  const selectedCount = participants.filter((p) => p.selected !== false).length;

  return (
    <KeyboardAwareScrollView
      containerStyle={styles.keyboardView}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Basic Expense Info */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Expense Info</Text>

          <FormField
            label="Total Amount (₹)"
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={amountRupees}
            onChangeText={setAmountRupees}
          />

          <FormField
            label="Title / Purpose"
            placeholder="e.g., Grocery Shopping, Electricity Bill"
            value={title}
            onChangeText={setTitle}
          />

          <FormField
            label="Description (Optional)"
            placeholder="Additional notes about this shared bill"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={2}
          />
        </Card>

        {/* Split Type Selector */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Split Method</Text>
          <View style={styles.splitTypesGrid}>
            {(['equal', 'custom', 'percentage', 'quantity'] as SplitType[]).map((type) => {
              const isActive = splitType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.splitTypeBtn, isActive && styles.splitTypeBtnActive]}
                  onPress={() => setSplitType(type)}
                >
                  <Ionicons
                    name={
                      type === 'equal'
                        ? 'git-compare-outline'
                        : type === 'custom'
                        ? 'calculator-outline'
                        : type === 'percentage'
                        ? 'pie-chart-outline'
                        : 'cart-outline'
                    }
                    size={20}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.splitTypeBtnText, isActive && styles.splitTypeBtnTextActive]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Participants & Split Inputs */}
        <Card style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Participants ({selectedCount})</Text>
            {splitType === 'equal' && totalPaise > 0 && selectedCount >= 2 && (
              <Text style={styles.perPersonHint}>
                ~₹{paiseToRupees(Math.floor(totalPaise / selectedCount))} / person
              </Text>
            )}
          </View>

          {participants.map((p) => {
            const isPayer = p.userId === user?.uid;
            const isSelected = p.selected !== false;

            return (
              <View key={p.userId} style={styles.participantItem}>
                <TouchableOpacity
                  style={styles.participantHeader}
                  onPress={() => toggleParticipant(p.userId)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                  <View style={styles.participantNameContainer}>
                    <Text style={[styles.participantName, !isSelected && styles.participantNameUnselected]}>
                      {p.displayName} {isPayer ? '(You - Payer)' : ''}
                    </Text>
                    {p.email ? <Text style={styles.participantEmail}>{p.email}</Text> : null}
                  </View>
                </TouchableOpacity>

                {/* Specific split inputs when selected */}
                {isSelected && splitType === 'custom' && (
                  <View style={styles.splitInputRow}>
                    <Text style={styles.splitInputLabel}>Amount (₹):</Text>
                    <TextInput
                      style={styles.splitTextInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={p.amountRupees}
                      onChangeText={(val) => updateParticipantField(p.userId, 'amountRupees', val)}
                    />
                  </View>
                )}

                {isSelected && splitType === 'percentage' && (
                  <View style={styles.splitInputRow}>
                    <Text style={styles.splitInputLabel}>Percentage (%):</Text>
                    <TextInput
                      style={styles.splitTextInput}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={p.percentage}
                      onChangeText={(val) => updateParticipantField(p.userId, 'percentage', val)}
                    />
                  </View>
                )}

                {isSelected && splitType === 'quantity' && (
                  <View style={styles.quantityInputsRow}>
                    <View style={styles.quantityCol}>
                      <Text style={styles.splitInputLabel}>Qty:</Text>
                      <TextInput
                        style={styles.splitTextInput}
                        placeholder="1"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        value={p.quantity}
                        onChangeText={(val) => updateParticipantField(p.userId, 'quantity', val)}
                      />
                    </View>
                    <View style={styles.quantityCol}>
                      <Text style={styles.splitInputLabel}>Unit Price (₹):</Text>
                      <TextInput
                        style={styles.splitTextInput}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        value={p.unitPriceRupees}
                        onChangeText={(val) => updateParticipantField(p.userId, 'unitPriceRupees', val)}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {splitError ? (
            <View style={styles.splitWarningBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
              <Text style={styles.splitWarningText}>{splitError}</Text>
            </View>
          ) : null}
        </Card>

        {/* Live Shares Breakdown Preview */}
        {shares.length > 0 && !splitError && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Live Share Breakdown</Text>
            {shares.map((share) => {
              const isPayer = share.userId === user?.uid;
              return (
                <View key={share.userId} style={styles.shareRow}>
                  <Text style={styles.shareName}>
                    {share.displayName} {isPayer ? '(Paid)' : '(Owes)'}
                  </Text>
                  <Text style={styles.shareAmount}>
                    ₹{paiseToRupees(share.sharePaise)}
                  </Text>
                </View>
              );
            })}
          </Card>
        )}

        {/* Submit Button */}
        <Button
          title={submitting ? 'Creating Expense...' : 'Create Shared Expense'}
          onPress={handleSubmit}
          loading={submitting}
          style={styles.submitBtn}
        />
    </KeyboardAwareScrollView>
  );
}

const styles = createThemedStyles(() => ({
  keyboardView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
    lineHeight: 18,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  perPersonHint: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
  splitTypesGrid: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  splitTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    gap: 4,
  },
  splitTypeBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  splitTypeBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  splitTypeBtnTextActive: {
    color: colors.primary,
  },
  participantItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  participantNameContainer: {
    flex: 1,
  },
  participantName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  participantNameUnselected: {
    color: colors.textMuted,
  },
  participantEmail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  splitInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  quantityInputsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  quantityCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  splitInputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  splitTextInput: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 14,
    color: colors.textPrimary,
    minWidth: 80,
    textAlign: 'right',
  },
  splitWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    padding: spacing.sm,
    borderRadius: radii.sm,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  splitWarningText: {
    ...typography.caption,
    color: colors.warning,
    flex: 1,
    fontWeight: '600',
  },
  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  shareName: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  shareAmount: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  submitBtn: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
}));
