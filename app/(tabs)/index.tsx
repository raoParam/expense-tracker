import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { SQLitePersonalExpenseRepository } from '../../src/repositories/personal-expense-repository';
import { PersonalExpense, MonthlySummary } from '../../src/domain/types';
import { getCurrentYearMonth, formatMonthName } from '../../src/utils/date';
import { SummaryCard } from '../../src/components/SummaryCard';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { EmptyState } from '../../src/components/EmptyState';
import { Button } from '../../src/components/Button';
import { CategoryBadge } from '../../src/components/CategoryBadge';
import { AmountText } from '../../src/components/AmountText';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const activeUserId = user?.uid || 'guest';
  const repo = React.useMemo(() => new SQLitePersonalExpenseRepository(db, activeUserId), [db, activeUserId]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentExpenses, setRecentExpenses] = useState<PersonalExpense[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    year: getCurrentYearMonth().year,
    month: getCurrentYearMonth().month,
    totalAmountPaise: 0,
    expenseCount: 0,
    categoryBreakdown: {},
  });

  const loadData = useCallback(async () => {
    try {
      const { year, month } = getCurrentYearMonth();
      const [summary, recent] = await Promise.all([
        repo.getMonthlySummary(year, month),
        repo.getAll({ sortBy: 'expenseDate', sortOrder: 'DESC' }),
      ]);
      setMonthlySummary(summary);
      setRecentExpenses(recent.slice(0, 5));
    } catch (err) {
      console.error('Failed to load home screen data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const { year, month } = getCurrentYearMonth();
  const monthTitle = formatMonthName(year, month);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
    >
      {/* Local Storage Disclosure Notice */}
      <View style={styles.noticeBanner}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.infoText} />
        <Text style={styles.noticeText}>
          Personal expenses are stored privately on this device.
        </Text>
      </View>

      {/* Current Month Spending Summary */}
      <SummaryCard
        title="Personal Spending"
        subtitle={monthTitle}
        totalPaise={monthlySummary.totalAmountPaise}
        count={monthlySummary.expenseCount}
      />

      {/* Quick Actions Row */}
      <View style={styles.actionRow}>
        <Button
          title="Add Expense"
          onPress={() => router.push('/expense/create')}
          variant="primary"
          icon={<Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />}
          style={styles.actionButton}
        />
        <Button
          title="View All"
          onPress={() => router.push('/(tabs)/personal')}
          variant="secondary"
          icon={<Ionicons name="list-outline" size={18} color={colors.primaryDark} />}
          style={styles.actionButton}
        />
      </View>

      {/* Top Categories for Current Month */}
      {Object.keys(monthlySummary.categoryBreakdown).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Top Categories this Month</Text>
          <View style={styles.categoriesContainer}>
            {Object.entries(monthlySummary.categoryBreakdown)
              .sort((a, b) => b[1].amountPaise - a[1].amountPaise)
              .slice(0, 4)
              .map(([catId, data]) => (
                <View key={catId} style={styles.categoryItem}>
                  <CategoryBadge categoryId={catId} size="medium" />
                  <AmountText
                    amountPaise={data.amountPaise}
                    variant="small"
                    color={colors.textPrimary}
                  />
                </View>
              ))}
          </View>
        </View>
      )}

      {/* Recent Expenses List */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Recent Expenses</Text>
          {recentExpenses.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/personal')}>
              <Text style={styles.viewAllText}>See all</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentExpenses.length === 0 && !loading ? (
          <EmptyState
            title="No Expenses Recorded"
            message="Tap 'Add Expense' above to log your first personal expense."
            actionTitle="Add Your First Expense"
            onAction={() => router.push('/expense/create')}
          />
        ) : (
          recentExpenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              onPress={() => router.push(`/expense/${expense.id}`)}
            />
          ))
        )}
      </View>
    </ScrollView>
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
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  noticeText: {
    ...typography.caption,
    color: colors.infoText,
    flex: 1,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  actionButton: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionHeader: {
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
  },
  viewAllText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  categoriesContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
