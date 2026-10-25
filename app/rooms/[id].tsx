import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { paiseToRupees } from '../../src/domain/money';
import { createThemedStyles } from '../../src/theme/themed-styles';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/Button';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { KeyboardComposerModal } from '../../src/components/KeyboardComposerModal';
import { RoomBalancesTab } from '../../src/components/room/RoomBalancesTab';
import { RoomExpensesTab } from '../../src/components/room/RoomExpensesTab';
import { RoomHeader } from '../../src/components/room/RoomHeader';
import { RoomMembersTab } from '../../src/components/room/RoomMembersTab';
import { RoomSettlementsTab } from '../../src/components/room/RoomSettlementsTab';
import { RoomTabPage, RoomTabs } from '../../src/components/room/RoomTabs';
import { InfoNote } from '../../src/components/room/RoomUi';
import { useRoomAdmin, useRoomData, useSettlementActions } from '../../src/components/room/useRoomDetail';

export default function RoomDetailScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid;

  const { room, setRoom, expenses, balances, suggestions, settlements, loading, refreshing, error, refresh } =
    useRoomData(id);
  const admin = useRoomAdmin(room, setRoom);
  const settle = useSettlementActions(room, uid, refresh);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading room details...</Text>
      </View>
    );
  }

  if (error || !room) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{error || 'Room not found'}</Text>
        <Button title="Retry" onPress={() => refresh()} variant="outline" style={styles.retryBtn} />
      </View>
    );
  }

  const isAdmin = Boolean(user && room.adminId === user.uid);
  const activeMembers = room.members.filter((m) => m.status === 'active');
  const removedMembers = room.members.filter((m) => m.status === 'removed');
  const pendingToVerify = settlements.filter((s) => s.status === 'pending' && s.receiverId === uid).length;
  const addExpense = () => router.push(`/rooms/expenses/create?roomId=${room._id}` as any);
  const targetName = settle.settleUpTarget?.receiverDisplayName;

  const pages: RoomTabPage[] = [
    {
      id: 'expenses',
      label: 'Expenses',
      icon: 'receipt-outline',
      badge: expenses.length || undefined,
      content: (
        <RoomExpensesTab
          room={room}
          expenses={expenses}
          userId={uid}
          onAddExpense={addExpense}
          onOpenExpense={(expenseId) => router.push(`/rooms/expenses/${expenseId}` as any)}
        />
      ),
    },
    {
      id: 'balances',
      label: 'Balances',
      icon: 'pie-chart-outline',
      content: <RoomBalancesTab balances={balances} suggestions={suggestions} userId={uid} />,
    },
    {
      id: 'settlements',
      label: 'Settlements',
      icon: 'checkmark-done-circle-outline',
      badge: pendingToVerify || undefined,
      content: (
        <RoomSettlementsTab
          room={room}
          userId={uid}
          settlements={settlements}
          suggestions={suggestions}
          verifyingId={settle.verifyingId}
          cancellingId={settle.cancellingId}
          onVerify={settle.verify}
          onReject={settle.openReject}
          onCancel={settle.cancel}
          onSettleUp={settle.setSettleUpTarget}
        />
      ),
    },
    {
      id: 'members',
      label: 'Members',
      icon: 'people-outline',
      badge: activeMembers.length || undefined,
      content: (
        <RoomMembersTab
          room={room}
          userId={uid}
          isAdmin={isAdmin}
          activeMembers={activeMembers}
          removedMembers={removedMembers}
          onRemove={admin.setMemberToRemove}
          onArchive={() => admin.setArchiveVisible(true)}
        />
      ),
    },
  ];

  return (
    <View style={styles.container}>
      <RoomTabs
        header={
          <RoomHeader
            room={room}
            memberCount={activeMembers.length}
            expenseCount={expenses.length}
            isAdmin={isAdmin}
            generatingInvite={admin.generatingInvite}
            onAddExpense={addExpense}
            onInvite={admin.generateInvite}
          />
        }
        pages={pages}
        requestedTab={tab}
        refreshing={refreshing}
        onRefresh={() => refresh(true)}
      />

      <ConfirmationDialog
        visible={Boolean(settle.settleUpTarget)}
        title="Settle Group Balance"
        icon={<Ionicons name="wallet-outline" size={32} color={colors.primary} />}
        confirmText="Send Request"
        loading={settle.settlingUp}
        onConfirm={settle.confirmSettleUp}
        onCancel={() => settle.setSettleUpTarget(null)}
      >
        <Text style={styles.desc}>
          Request settlement of the current suggested group transfer of{' '}
          <Text style={styles.strong}>₹{paiseToRupees(settle.settleUpTarget?.amountPaise ?? 0)}</Text> with{' '}
          <Text style={styles.strong}>{targetName}</Text>.
        </Text>
        <InfoNote
          box
          text={`Transfer the funds to ${targetName} via UPI / cash. Once submitted, they will verify receipt to complete the settlement.`}
        />
      </ConfirmationDialog>

      <KeyboardComposerModal
        visible={Boolean(settle.rejectingId)}
        onClose={() => settle.setRejectingId(null)}
        title="Reject Repayment Request"
        subtitle="Please provide a reason why this repayment request was not received or is incorrect."
        icon={<Ionicons name="close-circle-outline" size={24} color={colors.danger} />}
        placeholder="e.g., Payment not received in bank account / incorrect amount"
        value={settle.rejectReason}
        onChangeText={settle.setRejectReason}
        maxLength={300}
        submitLabel="Confirm Reject"
        submitVariant="danger"
        onSubmit={settle.confirmReject}
        submitting={settle.submittingReject}
        submitDisabled={!settle.rejectReason.trim()}
      />

      <ConfirmationDialog
        visible={admin.inviteVisible}
        title="Room Invite Code"
        icon={<Ionicons name="key" size={28} color={colors.primary} />}
        message={`Share this 6-character code with your roommates to let them join "${room.name}".`}
        confirmText="Share Code"
        cancelText="Done"
        onConfirm={admin.shareInvite}
        onCancel={() => admin.setInviteVisible(false)}
      >
        <View style={styles.codeBox}>
          <Text style={styles.code} selectable>
            {admin.invitation?.inviteCode}
          </Text>
        </View>
        <Text style={styles.codeExpiry}>
          Valid for 7 days (expires {admin.invitation ? new Date(admin.invitation.expiresAt).toLocaleDateString() : ''})
        </Text>
      </ConfirmationDialog>

      <ConfirmationDialog
        visible={Boolean(admin.memberToRemove)}
        title="Remove Member"
        message={`Are you sure you want to remove ${admin.memberToRemove?.displayName || 'this member'} from ${room.name}?`}
        confirmText="Remove"
        isDestructive
        loading={admin.removingMember}
        onConfirm={admin.confirmRemoveMember}
        onCancel={() => admin.setMemberToRemove(null)}
      />

      <ConfirmationDialog
        visible={admin.archiveVisible}
        title="Archive Room"
        message="Archiving will make this room read-only. Members will still be able to view past history. Are you sure you want to archive this room?"
        confirmText="Archive"
        isDestructive
        loading={admin.archiving}
        onConfirm={admin.confirmArchive}
        onCancel={() => admin.setArchiveVisible(false)}
      />
    </View>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
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
  desc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  strong: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  codeBox: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xs,
  },
  code: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.primary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  codeExpiry: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },
}));
