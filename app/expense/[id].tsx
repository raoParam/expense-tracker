import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { SQLitePersonalExpenseRepository } from '../../src/repositories/personal-expense-repository';
import { PersonalExpense } from '../../src/domain/types';
import { validatePersonalExpenseForm } from '../../src/domain/validation';
import { paiseToRupees, formatINR, validateRupeeInput } from '../../src/domain/money';
import { formatDisplayDate } from '../../src/utils/date';
import { getCategoryById } from '../../src/constants/categories';
import { LIMITS } from '../../src/constants/limits';
import { AmountText } from '../../src/components/AmountText';
import { CategoryBadge } from '../../src/components/CategoryBadge';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { FormField } from '../../src/components/FormField';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { EmptyState } from '../../src/components/EmptyState';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { user } = useAuth();
  const activeUserId = user?.uid || 'guest';
  const repo = React.useMemo(() => new SQLitePersonalExpenseRepository(db, activeUserId), [db, activeUserId]);

  const [expense, setExpense] = useState<PersonalExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [rupeeAmount, setRupeeAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadExpense = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await repo.getById(id);
      if (data) {
        setExpense(data);
        setRupeeAmount(paiseToRupees(data.amountPaise));
        setCategoryId(data.categoryId);
        setExpenseDate(data.expenseDate);
        setTitle(data.title);
        setDescription(data.description);
      }
    } catch (err) {
      console.error('Failed to load expense details:', err);
    } finally {
      setLoading(false);
    }
  }, [id, repo]);

  useEffect(() => {
    loadExpense();
  }, [loadExpense]);

  const handleUpdate = async () => {
    if (!expense) return;

    const result = validatePersonalExpenseForm(
      rupeeAmount,
      categoryId,
      expenseDate,
      title,
      description
    );

    if (!result.isValid || !result.cleanedInput) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    try {
      const updated = await repo.update(expense.id, {
        title: result.cleanedInput.title,
        description: result.cleanedInput.description,
        amountPaise: result.cleanedInput.amountPaise,
        categoryId: result.cleanedInput.categoryId,
        expenseDate: result.cleanedInput.expenseDate,
      });

      setExpense(updated);
      setIsEditing(false);
      setErrors({});
    } catch (err: any) {
      console.error('Failed to update expense:', err);
      Alert.alert('Update Failed', err?.message || 'Could not update expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!expense) return;
    setDeleting(true);
    try {
      await repo.delete(expense.id);
      setShowDeleteModal(false);
      router.back();
    } catch (err: any) {
      console.error('Failed to delete expense:', err);
      Alert.alert('Delete Failed', err?.message || 'Could not delete expense.');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Expense Not Found"
          message="This expense record may have been deleted or is unavailable."
          actionTitle="Back to Expenses"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  const category = getCategoryById(expense.categoryId);

  // Live amount preview during editing
  const liveValidation = validateRupeeInput(rupeeAmount);
  const livePreviewINR = liveValidation.isValid && liveValidation.paise !== undefined
    ? formatINR(liveValidation.paise)
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isEditing ? (
          /* Edit Mode Form */
          <View>
            <Text style={styles.modeTitle}>Edit Personal Expense</Text>

            <Card style={styles.amountCard}>
              <Text style={styles.amountLabel}>AMOUNT IN RUPEES (INR)</Text>
              <FormField
                label=""
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={rupeeAmount}
                onChangeText={(val) => {
                  setRupeeAmount(val);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: '' }));
                }}
                error={errors.amount}
                prefix={<Text style={styles.currencyPrefix}>₹</Text>}
                inputStyle={styles.amountInput}
              />
              {livePreviewINR && (
                <View style={styles.previewBox}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.previewText}>
                    Stored as: <Text style={styles.previewBold}>{livePreviewINR}</Text> ({liveValidation.paise} paise)
                  </Text>
                </View>
              )}
            </Card>

            <CategoryPicker
              selectedCategoryId={categoryId}
              onSelectCategory={(catId) => {
                setCategoryId(catId);
                if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
              }}
              error={errors.category}
            />

            <FormField
              label="Expense Date"
              placeholder="YYYY-MM-DD"
              value={expenseDate}
              onChangeText={(val) => {
                setExpenseDate(val);
                if (errors.expenseDate) setErrors((prev) => ({ ...prev, expenseDate: '' }));
              }}
              error={errors.expenseDate}
              helperText="Format: YYYY-MM-DD"
              prefix={<Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
            />

            <FormField
              label={`Title (Optional, max ${LIMITS.MAX_TITLE_LENGTH} chars)`}
              placeholder="Title"
              value={title}
              onChangeText={(val) => {
                setTitle(val);
                if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
              }}
              error={errors.title}
              maxLength={LIMITS.MAX_TITLE_LENGTH}
              prefix={<Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
            />

            <FormField
              label={`Description / Notes (Optional, max ${LIMITS.MAX_DESCRIPTION_LENGTH} chars)`}
              placeholder="Notes"
              value={description}
              onChangeText={(val) => {
                setDescription(val);
                if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
              }}
              error={errors.description}
              multiline
              numberOfLines={3}
              maxLength={LIMITS.MAX_DESCRIPTION_LENGTH}
              inputStyle={styles.textArea}
            />

            <View style={styles.buttonRow}>
              <Button
                title="Cancel"
                onPress={() => {
                  setIsEditing(false);
                  setRupeeAmount(paiseToRupees(expense.amountPaise));
                  setCategoryId(expense.categoryId);
                  setExpenseDate(expense.expenseDate);
                  setTitle(expense.title);
                  setDescription(expense.description);
                  setErrors({});
                }}
                variant="outline"
                style={styles.actionBtn}
                disabled={saving}
              />
              <Button
                title="Save Changes"
                onPress={handleUpdate}
                variant="primary"
                loading={saving}
                style={styles.actionBtn}
              />
            </View>
          </View>
        ) : (
          /* View Mode */
          <View>
            {/* Amount Hero Card */}
            <Card style={styles.heroCard}>
              <View style={styles.heroCategoryRow}>
                <CategoryBadge categoryId={expense.categoryId} size="medium" />
                <Text style={styles.heroDate}>{formatDisplayDate(expense.expenseDate)}</Text>
              </View>

              <AmountText
                amountPaise={expense.amountPaise}
                variant="hero"
                color={colors.textPrimary}
                style={styles.heroAmount}
              />

              <Text style={styles.paiseDetail}>
                Exact: {expense.amountPaise} paise
              </Text>
            </Card>

            {/* Expense Details Card */}
            <Card style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Title</Text>
                <Text style={styles.detailValue}>{expense.title}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category</Text>
                <Text style={styles.detailValue}>{category.name}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expense Date</Text>
                <Text style={styles.detailValue}>{formatDisplayDate(expense.expenseDate)}</Text>
              </View>

              {expense.description ? (
                <View style={styles.descSection}>
                  <Text style={styles.detailLabel}>Description / Notes</Text>
                  <Text style={styles.descValue}>{expense.description}</Text>
                </View>
              ) : null}

              <View style={styles.timestampsRow}>
                <Text style={styles.timestampText}>
                  Recorded: {new Date(expense.createdAt).toLocaleString('en-IN')}
                </Text>
              </View>
            </Card>

            {/* Actions */}
            <View style={styles.viewActionsRow}>
              <Button
                title="Edit Expense"
                onPress={() => setIsEditing(true)}
                variant="primary"
                icon={<Ionicons name="create-outline" size={18} color={colors.textInverse} />}
                style={styles.actionBtn}
              />
              <Button
                title="Delete"
                onPress={() => setShowDeleteModal(true)}
                variant="danger"
                icon={<Ionicons name="trash-outline" size={18} color={colors.textInverse} />}
                style={styles.actionBtn}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Confirmation Modal for Deletion */}
      <ConfirmationDialog
        visible={showDeleteModal}
        title="Delete Expense"
        message={`Are you sure you want to delete "${expense.title}" (${formatINR(expense.amountPaise)})? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  modeTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  heroCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: spacing.md,
  },
  heroDate: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  heroAmount: {
    marginVertical: spacing.xs,
  },
  paiseDetail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  detailsCard: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  descSection: {
    paddingTop: spacing.xs,
  },
  descValue: {
    ...typography.body,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  timestampsRow: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  timestampText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  viewActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  amountCard: {
    marginBottom: spacing.lg,
  },
  amountLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  currencyPrefix: {
    ...typography.h2,
    color: colors.primary,
    marginRight: spacing.xs,
    fontWeight: '700',
  },
  amountInput: {
    ...typography.h2,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: 4,
  },
  previewText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewBold: {
    fontWeight: '700',
    color: colors.successText,
  },
  fieldIcon: {
    marginRight: spacing.sm,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
