import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Room } from '../../services/room-service';
import { SharedExpense } from '../../services/expense-client';
import { getSharedExpenseParticipation } from '../../domain/shared-expense-presentation';
import { paiseToRupees } from '../../domain/money';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Button } from '../Button';
import { Card } from '../Card';
import { StatusPill, ui } from './RoomUi';

interface Props {
  room: Room;
  expenses: SharedExpense[];
  userId?: string;
  onAddExpense: () => void;
  onOpenExpense: (expenseId: string) => void;
}

export function RoomExpensesTab({ room, expenses, userId, onAddExpense, onOpenExpense }: Props) {
  if (expenses.length === 0) {
    return (
      <View style={ui.tabSection}>
        <Card style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Shared Expenses Yet</Text>
          <Text style={styles.emptyDesc}>
            Split mess bills, groceries, electricity, or outing expenses with your roommates.
          </Text>
          {room.status === 'active' && (
            <Button title="Add First Shared Expense" onPress={onAddExpense} style={styles.emptyActionBtn} />
          )}
        </Card>
      </View>
    );
  }

  return (
    <View style={ui.tabSection}>
      {expenses.map((exp) => {
        const isPayer = exp.payerId === userId;
        const pendingCount = exp.participants.filter((p) => p.status === 'pending').length;
        const participation = getSharedExpenseParticipation(exp, userId);
        const payerName = exp.participants.find((p) => p.userId === exp.payerId)?.displayName || 'Roommate';
        const shareLabel =
          participation.kind === 'participant'
            ? participation.involvementLabel
            : participation.kind === 'not-involved'
            ? 'Not involved'
            : null;

        return (
          <TouchableOpacity key={exp._id} activeOpacity={0.7} onPress={() => onOpenExpense(exp._id)}>
            <Card style={styles.card}>
              <View style={styles.header}>
                <View style={styles.titleCol}>
                  <Text style={styles.title}>{exp.title || 'Shared Expense'}</Text>
                  <Text style={styles.payer}>{isPayer ? 'Paid by you' : `Paid by ${payerName}`}</Text>
                </View>
                <View style={styles.amountCol}>
                  <Text style={styles.amount}>₹{paiseToRupees(exp.amountPaise)}</Text>
                  {!isPayer && shareLabel ? <Text style={styles.share}>{shareLabel}</Text> : null}
                </View>
              </View>

              {participation.responseLabel ? (
                <Text style={styles.acknowledgement} accessibilityLabel={participation.responseLabel}>
                  {participation.responseLabel}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <StatusPill
                  status={exp.status}
                  label={exp.status === 'pending' ? `Pending (${pendingCount} left)` : undefined}
                />
                <Text style={styles.date}>{new Date(exp.createdAt).toLocaleDateString()}</Text>
              </View>
            </Card>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = createThemedStyles(() => ({
  card: {
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  payer: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amount: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  share: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  acknowledgement: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: spacing.md,
  },
}));
