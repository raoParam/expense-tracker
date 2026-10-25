import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoomBalancesResult, SuggestedSettlementsResult } from '../../services/balance-client';
import { paiseToRupees } from '../../domain/money';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Card } from '../Card';
import { EmptyNote, InfoNote, SectionTitle, SettledState, ui } from './RoomUi';

interface Props {
  balances: RoomBalancesResult | null;
  suggestions: SuggestedSettlementsResult | null;
  userId?: string;
}

function formatNet(paise: number) {
  if (paise > 0) return `+₹${paiseToRupees(paise)}`;
  if (paise < 0) return `-₹${paiseToRupees(-paise)}`;
  return '₹0.00';
}

export function RoomBalancesTab({ balances, suggestions, userId }: Props) {
  const rows = balances?.balances ?? [];
  const transfers = suggestions?.suggestedTransfers ?? [];

  return (
    <View style={ui.tabSection}>
      <SectionTitle>Room Member Balances</SectionTitle>
      <Card style={styles.card}>
        {rows.length === 0 ? (
          <EmptyNote text="No confirmed balances yet." />
        ) : (
          rows.map((b, index) => (
            <View key={b.userId} style={[styles.row, index === rows.length - 1 && ui.lastRow]}>
              <View style={styles.info}>
                <Text style={styles.name}>
                  {b.displayName || 'Roommate'} {b.userId === userId ? '(You)' : ''}
                </Text>
                <Text style={styles.subtext}>
                  Paid: ₹{paiseToRupees(b.totalPaidPaise)} | Share: ₹{paiseToRupees(b.totalSharePaise)}
                </Text>
              </View>
              <View style={styles.amountBox}>
                <Text
                  style={[
                    styles.net,
                    b.netBalancePaise > 0 ? styles.positive : b.netBalancePaise < 0 ? styles.negative : styles.settled,
                  ]}
                >
                  {formatNet(b.netBalancePaise)}
                </Text>
                <Text style={styles.hint}>
                  {b.netBalancePaise > 0 ? 'gets back' : b.netBalancePaise < 0 ? 'owes' : 'settled'}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <View style={styles.titleRow}>
        <SectionTitle>Suggested Simplified Transfers</SectionTitle>
        <Text style={styles.note}>Informational</Text>
      </View>
      <Card style={styles.card}>
        {transfers.length === 0 ? (
          <SettledState text="All debts in this room are currently settled!" />
        ) : (
          transfers.map((t, index) => (
            <View
              key={`${t.fromUserId}_${t.toUserId}_${index}`}
              style={[styles.transferRow, index === transfers.length - 1 && ui.lastRow]}
            >
              <View style={styles.transferIcon}>
                <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
              </View>
              <View style={styles.transferInfo}>
                <Text style={styles.transferNames}>
                  <Text style={styles.bold}>
                    {t.fromDisplayName || 'Debtor'}
                    {t.fromUserId === userId ? ' (You)' : ''}
                  </Text>
                  {' pays '}
                  <Text style={styles.bold}>
                    {t.toDisplayName || 'Creditor'}
                    {t.toUserId === userId ? ' (You)' : ''}
                  </Text>
                </Text>
                <Text style={styles.transferAmount}>₹{paiseToRupees(t.amountPaise)}</Text>
              </View>
            </View>
          ))
        )}
        <InfoNote text="These transfers come from the current room net balances. They are the recommended repayment paths for this group, not historical bilateral debt records." />
      </Card>
    </View>
  );
}

const styles = createThemedStyles(() => ({
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  amountBox: {
    alignItems: 'flex-end',
  },
  net: {
    ...typography.amountMedium,
    fontWeight: '700',
  },
  positive: {
    color: colors.success,
  },
  negative: {
    color: colors.danger,
  },
  settled: {
    color: colors.textMuted,
  },
  hint: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  note: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  transferIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferInfo: {
    flex: 1,
  },
  transferNames: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  transferAmount: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  bold: {
    fontWeight: '700',
  },
}));
