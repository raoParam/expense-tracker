import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { SQLitePersonalExpenseRepository } from '../../src/repositories/personal-expense-repository';
import { PersonalExpense } from '../../src/domain/types';
import { CATEGORIES } from '../../src/constants/categories';
import { ExpenseRow } from '../../src/components/ExpenseRow';
import { EmptyState } from '../../src/components/EmptyState';
import { AmountText } from '../../src/components/AmountText';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function PersonalExpensesScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const activeUserId = user?.uid || 'guest';
  const repo = useMemo(() => new SQLitePersonalExpenseRepository(db, activeUserId), [db, activeUserId]);

  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'DESC' | 'ASC'>('DESC');

  const loadExpenses = useCallback(async () => {
    try {
      const data = await repo.getAll({
        categoryId: selectedCategory || undefined,
        searchQuery: searchQuery || undefined,
        sortBy: 'expenseDate',
        sortOrder,
      });
      setExpenses(data);
    } catch (err) {
      console.error('Failed to load personal expenses:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [repo, selectedCategory, searchQuery, sortOrder]);

  useFocusEffect(
    useCallback(() => {
      loadExpenses();
    }, [loadExpenses])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadExpenses();
  };

  const totalFilteredPaise = useMemo(() => {
    return expenses.reduce((acc, curr) => acc + curr.amountPaise, 0);
  }, [expenses]);

  return (
    <View style={styles.container}>
      {/* Search & Sort Controls Bar */}
      <View style={styles.controlsBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or description..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={sortOrder === 'DESC' ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={18}
            color={colors.textPrimary}
          />
          <Text style={styles.sortText}>
            {sortOrder === 'DESC' ? 'Newest' : 'Oldest'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Category Filter Chips */}
      <View style={styles.categoryScrollContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <TouchableOpacity
            onPress={() => setSelectedCategory(null)}
            style={[
              styles.categoryChip,
              selectedCategory === null && styles.categoryChipActive,
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === null && styles.categoryChipTextActive,
              ]}
            >
              All Categories
            </Text>
          </TouchableOpacity>

          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(isActive ? null : cat.id)}
                style={[
                  styles.categoryChip,
                  isActive && {
                    borderColor: cat.color,
                    backgroundColor: `${cat.color}15`,
                  },
                ]}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={14}
                  color={isActive ? cat.color : colors.textSecondary}
                  style={styles.chipIcon}
                />
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && { color: cat.color, fontWeight: '700' },
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Filtered Summary Bar */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryCount}>
          {expenses.length} {expenses.length === 1 ? 'record' : 'records'}
        </Text>
        <View style={styles.summaryTotalRow}>
          <Text style={styles.summaryTotalLabel}>Total: </Text>
          <AmountText
            amountPaise={totalFilteredPaise}
            variant="medium"
            color={colors.primary}
          />
        </View>
      </View>

      {/* Expenses List */}
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExpenseRow
            expense={item}
            onPress={() => router.push(`/expense/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              title={searchQuery || selectedCategory ? 'No Matching Expenses' : 'No Personal Expenses'}
              message={
                searchQuery || selectedCategory
                  ? 'Try clearing your search query or category filter.'
                  : 'Start tracking your daily expenses by tapping Add Expense.'
              }
              actionTitle={searchQuery || selectedCategory ? 'Clear Filters' : 'Add Expense'}
              onAction={() => {
                if (searchQuery || selectedCategory) {
                  setSearchQuery('');
                  setSelectedCategory(null);
                } else {
                  router.push('/expense/create');
                }
              }}
            />
          ) : null
        }
      />

      {/* Floating Add Expense Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/expense/create')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 42,
    gap: 4,
  },
  sortText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  categoryScrollContainer: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  categoryScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipIcon: {
    marginRight: 4,
  },
  categoryChipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTotalLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
});
