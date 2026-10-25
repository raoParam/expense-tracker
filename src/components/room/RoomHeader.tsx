import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Room } from '../../services/room-service';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Button } from '../Button';
import { Card } from '../Card';
import { StatusPill } from './RoomUi';

interface Props {
  room: Room;
  memberCount: number;
  expenseCount: number;
  isAdmin: boolean;
  generatingInvite: boolean;
  onAddExpense: () => void;
  onInvite: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function RoomHeader({ room, memberCount, expenseCount, isAdmin, generatingInvite, onAddExpense, onInvite }: Props) {
  const isActive = room.status === 'active';

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titleArea}>
          <Text style={styles.name}>{room.name}</Text>
          {room.description ? <Text style={styles.description}>{room.description}</Text> : null}
        </View>
        <StatusPill status={room.status} large />
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.metaText}>{plural(memberCount, 'member')}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.metaText}>{plural(expenseCount, 'expense')}</Text>
        </View>
        {isAdmin && (
          <View style={styles.adminIndicator}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={styles.adminText}>You are Admin</Text>
          </View>
        )}
      </View>

      {isActive && (
        <View style={styles.actions}>
          <Button title="+ Add Expense" onPress={onAddExpense} style={styles.addBtn} />
          {isAdmin && (
            <Button title="Invite" onPress={onInvite} loading={generatingInvite} variant="outline" style={styles.inviteBtn} />
          )}
        </View>
      )}
    </Card>
  );
}

const styles = createThemedStyles(() => ({
  card: {
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  name: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
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
  adminIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  adminText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addBtn: {
    flex: 1,
  },
  inviteBtn: {
    minWidth: 80,
  },
}));
