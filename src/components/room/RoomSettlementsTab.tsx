import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Room } from '../../services/room-service';
import { SuggestedSettlementsResult } from '../../services/balance-client';
import { SettlementModel } from '../../services/settlement-client';
import { paiseToRupees } from '../../domain/money';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { Button } from '../Button';
import { Card } from '../Card';
import { InfoNote, SectionTitle, SettledState, StatusPill, EmptyNote, ui } from './RoomUi';
import { SettleUpTarget } from './useRoomDetail';

interface Props {
  room: Room;
  userId?: string;
  settlements: SettlementModel[];
  suggestions: SuggestedSettlementsResult | null;
  verifyingId: string | null;
  cancellingId: string | null;
  onVerify: (settlementId: string) => void;
  onReject: (settlementId: string) => void;
  onCancel: (settlementId: string) => void;
  onSettleUp: (target: SettleUpTarget) => void;
}

export function RoomSettlementsTab({
  room,
  userId,
  settlements,
  suggestions,
  verifyingId,
  cancellingId,
  onVerify,
  onReject,
  onCancel,
  onSettleUp,
}: Props) {
  const nameOf = (id: string, fallback: string) =>
    id === userId ? 'You' : room.members.find((m) => m.userId === id)?.displayName || fallback;

  const toVerify = settlements.filter((s) => s.status === 'pending' && s.receiverId === userId);
  const sent = settlements.filter((s) => s.status === 'pending' && s.debtorId === userId);
  const transfers = suggestions?.suggestedTransfers ?? [];
  const outgoing = transfers.filter((t) => t.fromUserId === userId);
  const incoming = transfers.filter((t) => t.toUserId === userId);

  return (
    <View style={ui.tabSection}>
      {toVerify.length > 0 && (
        <View style={styles.subSection}>
          <View style={styles.actionHeader}>
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <Text style={styles.actionTitle}>Repayment Verification Required ({toVerify.length})</Text>
          </View>

          {toVerify.map((req) => (
            <Card key={req._id} style={styles.pendingCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.pendingName}>{nameOf(req.debtorId, 'Roommate')}</Text>
                  <Text style={styles.date}>Requested on {new Date(req.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.pendingAmount}>₹{paiseToRupees(req.amountPaise)}</Text>
              </View>

              <Text style={styles.prompt}>Confirm that you have received this payment to settle the debt.</Text>

              <View style={styles.btnRow}>
                <Button
                  title="Verify Receipt"
                  onPress={() => onVerify(req._id)}
                  loading={verifyingId === req._id}
                  style={styles.verifyBtn}
                />
                <Button title="Reject" variant="outline" onPress={() => onReject(req._id)} style={styles.rejectBtn} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {sent.length > 0 && (
        <View style={styles.subSection}>
          <SectionTitle>Waiting for Verification</SectionTitle>
          {sent.map((req) => (
            <Card key={req._id} style={styles.waitingCard}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.waitingTitle}>Sent to {nameOf(req.receiverId, 'Roommate')}</Text>
                  <Text style={styles.date}>Requested {new Date(req.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.waitingAmount}>₹{paiseToRupees(req.amountPaise)}</Text>
              </View>

              <View style={styles.waitingFooter}>
                <View style={styles.waitingStatus}>
                  <ActivityIndicator size="small" color={colors.warning} style={styles.spinner} />
                  <Text style={styles.waitingStatusText}>Awaiting confirmation</Text>
                </View>
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => onCancel(req._id)}
                  loading={cancellingId === req._id}
                  style={styles.cancelBtn}
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle>Suggested Settle Up Transfers</SectionTitle>
      <Card style={styles.card}>
        <InfoNote text="Amounts are calculated from the group's current outstanding net balances. A transfer may not match a historical expense pair." />
        {outgoing.length === 0 && incoming.length === 0 ? (
          <SettledState iconSize={28} text="There are no suggested net-balance transfers for you." />
        ) : (
          <>
            {outgoing.map((t, index) => {
              const receiverName = room.members.find((m) => m.userId === t.toUserId)?.displayName || t.toDisplayName || 'Roommate';
              const awaiting = sent.some((r) => r.receiverId === t.toUserId);

              return (
                <View
                  key={`out_${t.toUserId}_${index}`}
                  style={[styles.transferRow, index === outgoing.length - 1 && incoming.length === 0 && ui.lastRow]}
                >
                  <View style={styles.transferInfo}>
                    <Text style={styles.transferName}>You pay {receiverName}</Text>
                    <Text style={styles.owe}>₹{paiseToRupees(t.amountPaise)}</Text>
                  </View>

                  {awaiting ? (
                    <Text style={styles.awaiting}>Awaiting verification</Text>
                  ) : room.status === 'active' ? (
                    <Button
                      title="Settle Up"
                      style={styles.settleBtn}
                      onPress={() =>
                        onSettleUp({
                          debtorId: t.fromUserId,
                          receiverId: t.toUserId,
                          receiverDisplayName: receiverName,
                          amountPaise: t.amountPaise,
                        })
                      }
                    />
                  ) : null}
                </View>
              );
            })}

            {incoming.map((t, index) => {
              const debtorName = room.members.find((m) => m.userId === t.fromUserId)?.displayName || t.fromDisplayName || 'Roommate';

              return (
                <View
                  key={`in_${t.fromUserId}_${index}`}
                  style={[styles.transferRow, index === incoming.length - 1 && ui.lastRow]}
                >
                  <View style={styles.transferInfo}>
                    <Text style={styles.transferName}>{debtorName} pays you</Text>
                    <Text style={styles.owed}>+₹{paiseToRupees(t.amountPaise)}</Text>
                  </View>
                  <Text style={styles.awaiting}>Awaiting payment</Text>
                </View>
              );
            })}
          </>
        )}
      </Card>

      <SectionTitle style={styles.historyTitle}>Settlement History ({settlements.length})</SectionTitle>
      <Card style={styles.card}>
        {settlements.length === 0 ? (
          <EmptyNote text="No settlement records in this room yet." />
        ) : (
          settlements.map((st, index) => (
            <View key={st._id} style={[styles.historyRow, index === settlements.length - 1 && ui.lastRow]}>
              <View style={styles.historyTop}>
                <View style={styles.historyNames}>
                  <Text style={styles.historyText}>
                    <Text style={styles.bold}>{nameOf(st.debtorId, 'Debtor')}</Text>
                    {' paid '}
                    <Text style={styles.bold}>{nameOf(st.receiverId, 'Receiver')}</Text>
                  </Text>
                  <Text style={styles.date}>{new Date(st.createdAt).toLocaleDateString()}</Text>
                </View>

                <View style={styles.historyAmountBox}>
                  <Text style={styles.historyAmount}>₹{paiseToRupees(st.amountPaise)}</Text>
                  <StatusPill status={st.status} />
                </View>
              </View>

              {st.status === 'rejected' && st.rejectionReason && (
                <View style={styles.rejectionBox}>
                  <Ionicons name="information-circle" size={14} color={colors.danger} />
                  <Text style={styles.rejectionText}>Reason: {st.rejectionReason}</Text>
                </View>
              )}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const styles = createThemedStyles(() => ({
  subSection: {
    marginBottom: spacing.md,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  actionTitle: {
    ...typography.h3,
    color: colors.warning,
  },
  pendingCard: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  pendingName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  pendingAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  prompt: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  verifyBtn: {
    flex: 1,
    backgroundColor: colors.success,
  },
  rejectBtn: {
    flex: 1,
    borderColor: colors.danger,
  },
  waitingCard: {
    marginBottom: spacing.xs,
  },
  waitingTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  waitingAmount: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  waitingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  waitingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waitingStatusText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  card: {
    padding: 0,
    overflow: 'hidden',
  },
  transferRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  transferInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  transferName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  owe: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.danger,
    marginTop: 2,
  },
  owed: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.success,
    marginTop: 2,
  },
  awaiting: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  settleBtn: {
    minWidth: 90,
  },
  historyRow: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyNames: {
    flex: 1,
    marginRight: spacing.sm,
  },
  historyText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  historyAmountBox: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerLight,
    padding: spacing.xs,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
  },
  rejectionText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  bold: {
    fontWeight: '700',
  },
  spinner: {
    marginRight: 6,
  },
  historyTitle: {
    marginTop: spacing.lg,
  },
}));
