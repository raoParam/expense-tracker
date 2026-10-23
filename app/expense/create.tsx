import { createThemedStyles } from '../../src/theme/themed-styles';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { SQLitePersonalExpenseRepository } from '../../src/repositories/personal-expense-repository';
import { validatePersonalExpenseForm } from '../../src/domain/validation';
import { formatINR, validateRupeeInput } from '../../src/domain/money';
import { getTodayISODate } from '../../src/utils/date';
import { DEFAULT_CATEGORY_ID } from '../../src/constants/categories';
import { LIMITS } from '../../src/constants/limits';
import { FormField } from '../../src/components/FormField';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { KeyboardAwareScrollView } from '../../src/components/KeyboardAwareScrollView';

export default function CreateExpenseScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const activeUserId = user?.uid || 'guest';
  const repo = React.useMemo(() => new SQLitePersonalExpenseRepository(db, activeUserId), [db, activeUserId]);

  const [rupeeAmount, setRupeeAmount] = useState('');
  const [categoryId, setCategoryId] = useState(DEFAULT_CATEGORY_ID);
  const [expenseDate, setExpenseDate] = useState(getTodayISODate());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const titleRef = React.useRef<TextInput>(null);
  const descRef = React.useRef<TextInput>(null);

  // Live amount conversion preview
  const liveValidation = validateRupeeInput(rupeeAmount);
  const livePreviewINR = liveValidation.isValid && liveValidation.paise !== undefined
    ? formatINR(liveValidation.paise)
    : null;

  const handleSave = async () => {
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
      await repo.create({
        title: result.cleanedInput.title,
        description: result.cleanedInput.description,
        amountPaise: result.cleanedInput.amountPaise,
        categoryId: result.cleanedInput.categoryId,
        expenseDate: result.cleanedInput.expenseDate,
      });

      router.back();
    } catch (err: any) {
      console.error('Failed to create expense:', err);
      Alert.alert('Save Failed', err?.message || 'Could not save expense to local database.');
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      containerStyle={styles.container}
      contentContainerStyle={styles.content}
    >
        {/* Amount Input Section */}
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
            containerStyle={styles.amountFieldContainer}
          />
          {livePreviewINR ? (
            <View style={styles.previewBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.previewText}>
                Stored as: <Text style={styles.previewBold}>{livePreviewINR}</Text> ({liveValidation.paise} paise)
              </Text>
            </View>
          ) : (
            <Text style={styles.limitHint}>
              Max ₹99,999,999.99 (up to 2 decimal places)
            </Text>
          )}
        </Card>

        {/* Category Picker */}
        <CategoryPicker
          selectedCategoryId={categoryId}
          onSelectCategory={(catId) => {
            setCategoryId(catId);
            if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
          }}
          error={errors.category}
        />

        {/* Date Input */}
        <FormField
          label="Expense Date"
          placeholder="YYYY-MM-DD"
          value={expenseDate}
          onChangeText={(val) => {
            setExpenseDate(val);
            if (errors.expenseDate) setErrors((prev) => ({ ...prev, expenseDate: '' }));
          }}
          error={errors.expenseDate}
          helperText="Format: YYYY-MM-DD (defaults to today)"
          prefix={<Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
        />

        {/* Title Input */}
        <FormField
          ref={titleRef}
          label={`Title (Optional, max ${LIMITS.MAX_TITLE_LENGTH} chars)`}
          placeholder="e.g. Mess monthly fee (defaults to category name)"
          returnKeyType="next"
          onSubmitEditing={() => descRef.current?.focus()}
          blurOnSubmit={false}
          value={title}
          onChangeText={(val) => {
            setTitle(val);
            if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
          }}
          error={errors.title}
          maxLength={LIMITS.MAX_TITLE_LENGTH}
          prefix={<Ionicons name="pricetag-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />}
        />

        {/* Description / Notes */}
        <FormField
          ref={descRef}
          label={`Description / Notes (Optional, max ${LIMITS.MAX_DESCRIPTION_LENGTH} chars)`}
          placeholder="Add extra details, bill remarks, etc."
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

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="outline"
            style={styles.cancelButton}
            disabled={saving}
          />
          <Button
            title="Save Expense"
            onPress={handleSave}
            variant="primary"
            loading={saving}
            style={styles.saveButton}
          />
        </View>
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
  amountCard: {
    marginBottom: spacing.lg,
    paddingVertical: spacing.lg,
  },
  amountLabel: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  amountFieldContainer: {
    marginBottom: 0,
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
  limitHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 2,
  },
}));
