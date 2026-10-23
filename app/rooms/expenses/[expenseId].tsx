import { createThemedStyles } from '../../../src/theme/themed-styles';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SharedExpense, ExpenseClientService } from '../../../src/services/expense-client';
import { useAuth } from '../../../src/context/AuthContext';
import { Card } from '../../../src/components/Card';
import { Button } from '../../../src/components/Button';
import { FormField } from '../../../src/components/FormField';
import { ConfirmationDialog } from '../../../src/components/ConfirmationDialog';
import { KeyboardComposerModal } from '../../../src/components/KeyboardComposerModal';
import { colors } from '../../../src/theme/colors';
import { spacing, radii } from '../../../src/theme/spacing';
import { typography } from '../../../src/theme/typography';
import { validateRupeeInput, rupeesToPaise, paiseToRupees } from '../../../src/domain/money';
import { LIMITS } from '../../../src/constants/limits';
import { KeyboardAwareScrollView } from '../../../src/components/KeyboardAwareScrollView';
import { SplitType, SplitParticipantInput, calculateClientShares } from '../../../src/domain/split';

export default function SharedExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [expense, setExpense] = useState<SharedExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reject Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Cancel Confirmation State
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);

  // Resubmit Modal State
  const [resubmitModalVisible, setResubmitModalVisible] = useState(false);
  const [resubmitTitle, setResubmitTitle] = useState('');
  const [resubmitDescription, setResubmitDescription] = useState('');
  const [resubmitAmountRupees, setResubmitAmountRupees] = useState('');
  const [resubmitSplitType, setResubmitSplitType] = useState<SplitType>('equal');
  const [resubmitParticipants, setResubmitParticipants] = useState<SplitParticipantInput[]>([]);
  const [resubmitSubmitting, setResubmitSubmitting] = useState(false);
  const [resubmitErrorMessage, setResubmitErrorMessage] = useState<string | null>(null);

  const fetchExpense = useCallback(async (isRefresh = false) => {
    if (!expenseId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await ExpenseClientService.getExpenseById(expenseId);
      setExpense(data);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load expense details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [expenseId]);

  useEffect(() => {
    fetchExpense();
  }, [fetchExpense]);

  const isPayer = Boolean(user && expense && expense.payerId === user.uid);
  const userParticipant = expense?.participants.find((p) => p.userId === user?.uid);
  const isPendingForUser = userParticipant && userParticipant.status === 'pending' && expense?.status === 'pending';
  const hasRejections = expense?.participants.some((p) => p.status === 'rejected');

  // Open Resubmit Modal initialized with current expense data
  const handleOpenResubmit = () => {
    if (!expense) return;
    setResubmitTitle(expense.title || '');
    setResubmitDescription(expense.description || '');
    setResubmitAmountRupees(paiseToRupees(expense.amountPaise));
    setResubmitSplitType(expense.splitType);
    setResubmitErrorMessage(null);

    // Populate participants
    const initialParticipants: SplitParticipantInput[] = expense.participants.map((p) => {
      const rawInput = expense.splitInputs?.find((i: any) => i.userId === p.userId);
      return {
        userId: p.userId,
        displayName: p.displayName || p.userId,
        email: p.email,
        selected: true,
        amountRupees: paiseToRupees(p.sharePaise),
        percentage: rawInput?.percentage ? String(rawInput.percentage) : '',
        quantity: rawInput?.quantity ? String(rawInput.quantity) : '1',
        unitPriceRupees: rawInput?.unitPricePaise ? paiseToRupees(rawInput.unitPricePaise) : '',
      };
    });

    setResubmitParticipants(initialParticipants);
    setResubmitModalVisible(true);
  };

  // Resubmit live calculations
  const resubmitTotalPaise = useMemo(() => {
    const res = validateRupeeInput(resubmitAmountRupees);
    return res.isValid && res.paise ? res.paise : 0;
  }, [resubmitAmountRupees]);

  const { shares: resubmitShares, error: resubmitSplitError } = useMemo(() => {
    if (!user || resubmitTotalPaise <= 0) {
      return { shares: [], error: undefined };
    }
    return calculateClientShares(
      resubmitSplitType,
      resubmitTotalPaise,
      resubmitParticipants,
      user.uid
    );
  }, [resubmitSplitType, resubmitTotalPaise, resubmitParticipants, user]);

  const toggleResubmitParticipant = (userId: string) => {
    if (userId === user?.uid) {
      Alert.alert('Notice', 'As the payer, you must be included in the shared expense.');
      return;
    }

    setResubmitParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, selected: !p.selected } : p))
    );
  };

  const updateResubmitParticipantField = (
    userId: string,
    field: keyof SplitParticipantInput,
    value: string
  ) => {
    setResubmitParticipants((prev) =>
      prev.map((p) => (p.userId === userId ? { ...p, [field]: value } : p))
    );
  };

  const handleConfirmResubmit = async () => {
    if (!expense || !user || resubmitSubmitting) return;
    setResubmitErrorMessage(null);

    if (resubmitTotalPaise <= 0) {
      setResubmitErrorMessage('Please enter a valid expense amount greater than ₹0.');
      return;
    }

    if (resubmitTotalPaise > LIMITS.MAX_EXPENSE_PAISE) {
      setResubmitErrorMessage(`Expense cannot exceed maximum limit of ₹${LIMITS.MAX_EXPENSE_RUPEES}.`);
      return;
    }

    const selectedParticipants = resubmitParticipants.filter((p) => p.selected !== false);
    if (selectedParticipants.length < 2) {
      setResubmitErrorMessage('Select at least 2 participants (including you as payer).');
      return;
    }

    if (resubmitSplitError) {
      setResubmitErrorMessage(resubmitSplitError);
      return;
    }

    // Build payload
    let participantsPayload: any[] = [];
    if (resubmitSplitType === 'equal') {
      participantsPayload = selectedParticipants.map((p) => ({ userId: p.userId }));
    } else if (resubmitSplitType === 'custom') {
      participantsPayload = selectedParticipants.map((p) => {
        const valRes = validateRupeeInput(p.amountRupees || '0');
        const paise = valRes.isValid && valRes.paise ? valRes.paise : 0;
        return {
          userId: p.userId,
          sharePaise: paise,
          amountPaise: paise,
        };
      });
    } else if (resubmitSplitType === 'percentage') {
      participantsPayload = selectedParticipants.map((p) => ({
        userId: p.userId,
        percentage: parseFloat(p.percentage || '0'),
      }));
    } else if (resubmitSplitType === 'quantity') {
      participantsPayload = selectedParticipants.map((p) => {
        const valRes = validateRupeeInput(p.unitPriceRupees || '0');
        return {
          userId: p.userId,
          quantity: parseInt(p.quantity || '1', 10),
          unitPricePaise: valRes.isValid && valRes.paise ? valRes.paise : 0,
        };
      });
    }

    setResubmitSubmitting(true);
    try {
      const updated = await ExpenseClientService.resubmitExpense(expense._id, {
        expectedRevision: expense.revision,
        title: resubmitTitle.trim() || undefined,
        description: resubmitDescription.trim() || undefined,
        amountPaise: resubmitTotalPaise,
        splitType: resubmitSplitType,
        participants: participantsPayload,
      });

      setExpense(updated);
      setResubmitModalVisible(false);
      Alert.alert(
        'Expense Resubmitted',
        `Expense has been updated to Revision ${updated.revision}. Participants have been reset to pending for fresh acknowledgement.`
      );
    } catch (err: any) {
      if (err?.code === 'EXPENSE_REVISION_CONFLICT') {
        Alert.alert(
          'Revision Conflict',
          'This expense has changed since you opened it. Please refresh and review before resubmitting.',
          [{ text: 'Refresh', onPress: () => fetchExpense() }]
        );
      } else {
        setResubmitErrorMessage(err?.message || 'Failed to resubmit expense.');
      }
    } finally {
      setResubmitSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!expense || actionLoading) return;
    setActionLoading(true);
    try {
      const updated = await ExpenseClientService.acknowledgeExpense(
        expense._id,
        expense.revision
      );
      setExpense(updated);
      Alert.alert('Acknowledged', 'You have acknowledged this expense share.');
    } catch (err: any) {
      if (err?.code === 'EXPENSE_REVISION_CONFLICT') {
        Alert.alert(
          'Expense Updated',
          'This expense has changed. Please review the updated details before acknowledging.',
          [{ text: 'Refresh', onPress: () => fetchExpense() }]
        );
      } else {
        Alert.alert('Error', err?.message || 'Failed to acknowledge expense.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!expense || actionLoading) return;
    const cleanReason = rejectReason.trim();
    if (cleanReason.length < 3) {
      Alert.alert('Reason Required', 'Please provide a clear reason (at least 3 characters) for rejecting.');
      return;
    }

    setActionLoading(true);
    try {
      const updated = await ExpenseClientService.rejectExpense(
        expense._id,
        expense.revision,
        cleanReason
      );
      setExpense(updated);
      setRejectModalVisible(false);
      setRejectReason('');

      if (updated.status === 'rejected') {
        Alert.alert(
          'Expense Unanimously Rejected',
          'All participants have rejected this expense. The expense is now closed, and a 24-hour room expense creation restriction was applied to the creator.'
        );
      } else {
        Alert.alert('Expense Rejected', 'Your rejection reason has been recorded and returned to the payer for correction.');
      }
    } catch (err: any) {
      if (err?.code === 'EXPENSE_REVISION_CONFLICT') {
        Alert.alert(
          'Expense Updated',
          'This expense has changed. Please review the updated details.',
          [{ text: 'Refresh', onPress: () => fetchExpense() }]
        );
      } else {
        Alert.alert('Error', err?.message || 'Failed to reject expense.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!expense || actionLoading) return;
    setActionLoading(true);
    try {
      const updated = await ExpenseClientService.cancelExpense(expense._id);
      setExpense(updated);
      setCancelDialogVisible(false);
      Alert.alert('Expense Cancelled', 'This shared expense has been permanently cancelled.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel expense.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading expense...</Text>
      </View>
    );
  }

  if (errorMessage || !expense) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{errorMessage || 'Expense not found'}</Text>
        <Button title="Retry" onPress={() => fetchExpense()} variant="outline" style={styles.retryBtn} />
      </View>
    );
  }

  const getStatusBadge = () => {
    switch (expense.status) {
      case 'confirmed':
        return { style: styles.statusConfirmed, textStyle: styles.statusConfirmedText, label: 'Confirmed' };
      case 'rejected':
        return { style: styles.statusRejected, textStyle: styles.statusRejectedText, label: 'Unanimously Rejected (Closed)' };
      case 'cancelled':
        return { style: styles.statusCancelled, textStyle: styles.statusCancelledText, label: 'Cancelled' };
      default:
        if (hasRejections) {
          return { style: styles.statusPending, textStyle: styles.statusPendingText, label: 'Correction Requested' };
        }
        return { style: styles.statusPending, textStyle: styles.statusPendingText, label: 'Pending Acknowledgement' };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchExpense(true)} />}
    >
      {/* Overview Card */}
      <Card style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text style={styles.expenseTitle}>{expense.title || 'Shared Expense'}</Text>
            {expense.description ? (
              <Text style={styles.expenseDescription}>{expense.description}</Text>
            ) : null}
          </View>
          <View style={[styles.statusBadge, statusBadge.style]}>
            <Text style={[styles.statusBadgeText, statusBadge.textStyle]}>{statusBadge.label}</Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>Total Expense</Text>
          <Text style={styles.amountValue}>₹{paiseToRupees(expense.amountPaise)}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="card-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>Split: {expense.splitType.toUpperCase()}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="git-branch-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>Revision {expense.revision}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {new Date(expense.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      </Card>

      {/* Rejection / Status Notice Banner */}
      {expense.status === 'rejected' && (
        <View style={styles.unanimousBanner}>
          <Ionicons name="ban" size={22} color={colors.danger} />
          <View style={styles.unanimousBannerTextCol}>
            <Text style={styles.unanimousBannerTitle}>Unanimously Rejected</Text>
            <Text style={styles.unanimousBannerDesc}>
              All peers rejected this expense. It is permanently closed and cannot be resubmitted. A 24-hour room expense creation restriction was applied to the creator.
            </Text>
          </View>
        </View>
      )}

      {expense.status === 'pending' && hasRejections && (
        <View style={styles.rejectionNoticeBanner}>
          <Ionicons name="alert-circle" size={22} color={colors.warning} />
          <View style={styles.rejectionNoticeTextCol}>
            <Text style={styles.rejectionNoticeTitle}>Correction Requested</Text>
            <Text style={styles.rejectionNoticeDesc}>
              One or more participants rejected their share. {isPayer ? 'You can edit the expense details/split and resubmit as a new revision, or cancel the expense.' : 'Waiting for payer to review feedback and resubmit.'}
            </Text>
          </View>
        </View>
      )}

      {expense.status === 'confirmed' && (
        <View style={styles.confirmedBanner}>
          <Ionicons name="checkmark-circle" size={22} color={colors.success} />
          <Text style={styles.confirmedBannerText}>
            All participants have acknowledged. This expense is confirmed and reflected in room balances.
          </Text>
        </View>
      )}

      {expense.status === 'cancelled' && (
        <View style={styles.cancelledBanner}>
          <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          <Text style={styles.cancelledBannerText}>
            This shared expense was cancelled by the payer.
          </Text>
        </View>
      )}

      {/* Participant Breakdown Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Participants & Acknowledgements</Text>
        <Card style={styles.participantsCard}>
          {expense.participants.map((p, index) => {
            const isSelf = p.userId === user?.uid;
            const isExpensePayer = p.userId === expense.payerId;

            return (
              <View
                key={p.userId}
                style={[
                  styles.participantRow,
                  index === expense.participants.length - 1 && styles.lastRow,
                ]}
              >
                <View style={styles.participantLeft}>
                  <View style={styles.participantNameRow}>
                    <Text style={styles.participantName}>
                      {p.displayName || p.userId} {isSelf ? '(You)' : ''}
                    </Text>
                    {isExpensePayer && (
                      <View style={styles.payerBadge}>
                        <Text style={styles.payerBadgeText}>Payer</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.participantShare}>
                    Share: ₹{paiseToRupees(p.sharePaise)}
                  </Text>

                  {p.rejectionReason && (
                    <View style={styles.rejectionBox}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.danger} />
                      <Text style={styles.rejectionText}>
                        Feedback: "{p.rejectionReason}"
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.participantRight}>
                  {p.status === 'acknowledged' ? (
                    <View style={styles.ackBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.ackBadgeText}>Acknowledged</Text>
                    </View>
                  ) : p.status === 'rejected' ? (
                    <View style={styles.rejBadge}>
                      <Ionicons name="close-circle" size={16} color={colors.danger} />
                      <Text style={styles.rejBadgeText}>Rejected</Text>
                    </View>
                  ) : (
                    <View style={styles.pendingBadge}>
                      <Ionicons name="time-outline" size={16} color={colors.warning} />
                      <Text style={styles.pendingBadgeText}>Pending</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </Card>
      </View>

      {/* User Actions: Participant Acknowledgement / Rejection */}
      {isPendingForUser && !isPayer && (
        <View style={styles.actionsSection}>
          <Text style={styles.actionPrompt}>Your acknowledgement is required for Revision {expense.revision}:</Text>
          <View style={styles.actionButtonsRow}>
            <Button
              title="Acknowledge Share"
              onPress={handleAcknowledge}
              loading={actionLoading}
              style={styles.actionBtn}
            />
            <Button
              title="Reject"
              onPress={() => setRejectModalVisible(true)}
              variant="danger"
              style={styles.actionBtn}
            />
          </View>
        </View>
      )}

      {/* Payer Actions: Edit/Resubmit & Cancel */}
      {isPayer && expense.status === 'pending' && (
        <View style={styles.payerActionsSection}>
          <View style={styles.payerButtonsRow}>
            <Button
              title={hasRejections ? "Edit & Resubmit Revision" : "Edit / Resubmit"}
              onPress={handleOpenResubmit}
              style={styles.payerActionBtn}
            />
            <Button
              title="Cancel Expense"
              onPress={() => setCancelDialogVisible(true)}
              variant="outline"
              loading={actionLoading}
              style={styles.payerCancelBtn}
            />
          </View>
        </View>
      )}

      {/* Reject Modal */}
      <KeyboardComposerModal
        visible={rejectModalVisible}
        onClose={() => {
          if (!actionLoading) {
            setRejectModalVisible(false);
            setRejectReason('');
          }
        }}
        title="Reject Expense Share"
        subtitle="Please provide feedback explaining why you are rejecting (e.g. incorrect split, wasn't present, wrong amount)."
        icon={<Ionicons name="close-circle-outline" size={24} color={colors.danger} />}
        placeholder="Enter rejection reason (at least 3 characters)..."
        value={rejectReason}
        onChangeText={setRejectReason}
        maxLength={300}
        submitLabel="Submit Rejection"
        submitVariant="danger"
        onSubmit={handleConfirmReject}
        submitting={actionLoading}
        submitDisabled={rejectReason.trim().length < 3}
      />


      {/* Edit & Resubmit Modal */}
      <Modal
        visible={resubmitModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setResubmitModalVisible(false)}
      >
        <KeyboardAwareScrollView
          containerStyle={styles.resubmitKeyboardView}
          contentContainerStyle={styles.resubmitContent}
        >
          <View style={styles.resubmitHeaderBar}>
            <Text style={styles.resubmitHeaderTitle}>
              Resubmit Expense (Rev {expense.revision} → Rev {expense.revision + 1})
            </Text>
            <TouchableOpacity onPress={() => setResubmitModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View>
            {resubmitErrorMessage ? (
              <View style={styles.resubmitErrorBanner}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <Text style={styles.resubmitErrorText}>{resubmitErrorMessage}</Text>
              </View>
            ) : null}

            <Card style={styles.resubmitCard}>
              <Text style={styles.resubmitSectionTitle}>Expense Details</Text>
              <FormField
                label="Total Amount (₹)"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={resubmitAmountRupees}
                onChangeText={setResubmitAmountRupees}
              />
              <FormField
                label="Title / Purpose"
                placeholder="e.g., Grocery Shopping"
                value={resubmitTitle}
                onChangeText={setResubmitTitle}
              />
              <FormField
                label="Description (Optional)"
                placeholder="Correction notes"
                value={resubmitDescription}
                onChangeText={setResubmitDescription}
                multiline
                numberOfLines={2}
              />
            </Card>

            <Card style={styles.resubmitCard}>
              <Text style={styles.resubmitSectionTitle}>Split Method</Text>
              <View style={styles.splitTypesGrid}>
                {(['equal', 'custom', 'percentage', 'quantity'] as SplitType[]).map((type) => {
                  const isActive = resubmitSplitType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.splitTypeBtn, isActive && styles.splitTypeBtnActive]}
                      onPress={() => setResubmitSplitType(type)}
                    >
                      <Text style={[styles.splitTypeBtnText, isActive && styles.splitTypeBtnTextActive]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Card>

            <Card style={styles.resubmitCard}>
              <Text style={styles.resubmitSectionTitle}>Participants</Text>
              {resubmitParticipants.map((p) => {
                const isExpensePayer = p.userId === user?.uid;
                const isSelected = p.selected !== false;
                const previousRejection = expense.participants.find((ep) => ep.userId === p.userId)?.rejectionReason;

                return (
                  <View key={p.userId} style={styles.resubmitParticipantItem}>
                    <TouchableOpacity
                      style={styles.resubmitParticipantHeader}
                      onPress={() => toggleResubmitParticipant(p.userId)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? colors.primary : colors.textMuted}
                      />
                      <Text style={styles.resubmitParticipantName}>
                        {p.displayName} {isExpensePayer ? '(You - Payer)' : ''}
                      </Text>
                    </TouchableOpacity>

                    {previousRejection ? (
                      <View style={styles.resubmitFeedbackBox}>
                        <Ionicons name="chatbubble-outline" size={12} color={colors.danger} />
                        <Text style={styles.resubmitFeedbackText}>Rejected previously: "{previousRejection}"</Text>
                      </View>
                    ) : null}

                    {isSelected && resubmitSplitType === 'custom' && (
                      <View style={styles.splitInputRow}>
                        <Text style={styles.splitInputLabel}>Amount (₹):</Text>
                        <TextInput
                          style={styles.splitTextInput}
                          placeholder="0.00"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          value={p.amountRupees}
                          onChangeText={(val) => updateResubmitParticipantField(p.userId, 'amountRupees', val)}
                        />
                      </View>
                    )}

                    {isSelected && resubmitSplitType === 'percentage' && (
                      <View style={styles.splitInputRow}>
                        <Text style={styles.splitInputLabel}>Percentage (%):</Text>
                        <TextInput
                          style={styles.splitTextInput}
                          placeholder="0.00"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          value={p.percentage}
                          onChangeText={(val) => updateResubmitParticipantField(p.userId, 'percentage', val)}
                        />
                      </View>
                    )}

                    {isSelected && resubmitSplitType === 'quantity' && (
                      <View style={styles.quantityInputsRow}>
                        <View style={styles.quantityCol}>
                          <Text style={styles.splitInputLabel}>Qty:</Text>
                          <TextInput
                            style={styles.splitTextInput}
                            placeholder="1"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="number-pad"
                            value={p.quantity}
                            onChangeText={(val) => updateResubmitParticipantField(p.userId, 'quantity', val)}
                          />
                        </View>
                        <View style={styles.quantityCol}>
                          <Text style={styles.splitInputLabel}>Unit (₹):</Text>
                          <TextInput
                            style={styles.splitTextInput}
                            placeholder="0.00"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            value={p.unitPriceRupees}
                            onChangeText={(val) => updateResubmitParticipantField(p.userId, 'unitPriceRupees', val)}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {resubmitSplitError ? (
                <View style={styles.splitWarningBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={styles.splitWarningText}>{resubmitSplitError}</Text>
                </View>
              ) : null}
            </Card>

            {resubmitShares.length > 0 && !resubmitSplitError && (
              <Card style={styles.resubmitCard}>
                <Text style={styles.resubmitSectionTitle}>New Shares Breakdown</Text>
                {resubmitShares.map((s) => (
                  <View key={s.userId} style={styles.shareRow}>
                    <Text style={styles.shareName}>{s.displayName}</Text>
                    <Text style={styles.shareAmount}>₹{paiseToRupees(s.sharePaise)}</Text>
                  </View>
                ))}
              </Card>
            )}

            <Button
              title={resubmitSubmitting ? "Resubmitting..." : `Submit Revision ${expense.revision + 1}`}
              onPress={handleConfirmResubmit}
              loading={resubmitSubmitting}
              style={styles.submitResubmitBtn}
            />
          </View>
        </KeyboardAwareScrollView>
      </Modal>

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        visible={cancelDialogVisible}
        title="Cancel Shared Expense"
        message="Are you sure you want to permanently cancel this pending expense? It will be permanently closed."
        confirmText="Cancel Expense"
        isDestructive
        loading={actionLoading}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelDialogVisible(false)}
      />
    </ScrollView>
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
  errorText: {
    ...typography.bodyMedium,
    color: colors.danger,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.lg,
  },
  headerCard: {
    marginBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  expenseTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  expenseDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  statusConfirmed: {
    backgroundColor: colors.successLight,
  },
  statusPending: {
    backgroundColor: colors.warningLight,
  },
  statusRejected: {
    backgroundColor: colors.dangerLight,
  },
  statusCancelled: {
    backgroundColor: colors.borderSubtle,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusConfirmedText: {
    color: colors.success,
  },
  statusPendingText: {
    color: colors.warning,
  },
  statusRejectedText: {
    color: colors.danger,
  },
  statusCancelledText: {
    color: colors.textMuted,
  },
  amountContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  amountLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  unanimousBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  unanimousBannerTextCol: {
    flex: 1,
  },
  unanimousBannerTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.danger,
  },
  unanimousBannerDesc: {
    ...typography.caption,
    color: colors.danger,
    marginTop: 2,
    lineHeight: 16,
  },
  rejectionNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  rejectionNoticeTextCol: {
    flex: 1,
  },
  rejectionNoticeTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.warning,
  },
  rejectionNoticeDesc: {
    ...typography.caption,
    color: colors.warning,
    marginTop: 2,
    lineHeight: 16,
  },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successLight,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  confirmedBannerText: {
    ...typography.bodySmall,
    color: colors.success,
    flex: 1,
    fontWeight: '600',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cancelledBannerText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
  },
  participantsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  participantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  participantLeft: {
    flex: 1,
  },
  participantNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  participantName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  payerBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  payerBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  participantShare: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rejectionText: {
    ...typography.caption,
    color: colors.danger,
    fontWeight: '600',
  },
  participantRight: {
    marginLeft: spacing.sm,
  },
  ackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ackBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.success,
  },
  rejBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rejBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.danger,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pendingBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.warning,
  },
  actionsSection: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  actionPrompt: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  payerActionsSection: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  payerButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  payerActionBtn: {
    flex: 2,
  },
  payerCancelBtn: {
    flex: 1,
    borderColor: colors.danger,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  modalKeyboardView: {
    width: '100%',
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  reasonInput: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalActionBtn: {
    flex: 1,
  },
  resubmitKeyboardView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  resubmitHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  resubmitHeaderTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  resubmitScroll: {
    flex: 1,
  },
  resubmitContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  resubmitErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  resubmitErrorText: {
    ...typography.bodySmall,
    color: colors.danger,
    flex: 1,
  },
  resubmitCard: {
    marginBottom: spacing.md,
  },
  resubmitSectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
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
    paddingHorizontal: 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
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
  resubmitParticipantItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  resubmitParticipantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resubmitParticipantName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resubmitFeedbackBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    padding: spacing.xs + 2,
    borderRadius: radii.sm,
    marginTop: 4,
    gap: 4,
  },
  resubmitFeedbackText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '600',
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
  submitResubmitBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
}));
