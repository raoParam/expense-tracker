import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Room, RoomMember, RoomClientService, InvitationInfo } from '../../src/services/room-service';
import { ExpenseClientService, SharedExpense } from '../../src/services/expense-client';
import {
  BalanceClientService,
  RoomBalancesResult,
  SuggestedSettlementsResult,
  BilateralDebtInfo,
} from '../../src/services/balance-client';
import {
  SettlementClientService,
  SettlementModel,
} from '../../src/services/settlement-client';
import { useAuth } from '../../src/context/AuthContext';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { paiseToRupees } from '../../src/domain/money';

type RoomTab = 'expenses' | 'balances' | 'settlements' | 'members';

interface TabItem {
  id: RoomTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: number | string;
}

interface SettleUpTarget {
  receiverId: string;
  receiverDisplayName: string;
  amountPaise: number;
}

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();

  const [activeTab, setActiveTab] = useState<RoomTab>('expenses');
  const [containerWidth, setContainerWidth] = useState<number>(windowWidth || 360);

  const pagerRef = useRef<ScrollView>(null);
  const tabsScrollRef = useRef<ScrollView>(null);

  // Room data
  const [room, setRoom] = useState<Room | null>(null);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [balancesData, setBalancesData] = useState<RoomBalancesResult | null>(null);
  const [settlementsData, setSettlementsData] = useState<SuggestedSettlementsResult | null>(null);
  const [bilateralDebts, setBilateralDebts] = useState<BilateralDebtInfo[]>([]);
  const [roomSettlements, setRoomSettlements] = useState<SettlementModel[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite Code State
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // Confirmation Dialog States
  const [memberToRemove, setMemberToRemove] = useState<RoomMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Settlement Action States
  const [settleUpTarget, setSettleUpTarget] = useState<SettleUpTarget | null>(null);
  const [settlingUp, setSettlingUp] = useState(false);

  const [rejectingSettlementId, setRejectingSettlementId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchRoomData = useCallback(async (isRefresh = false) => {
    if (!id) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [roomRes, expRes, balRes, setRes, debtsRes, settlementsRes] = await Promise.all([
        RoomClientService.getRoomById(id),
        ExpenseClientService.listRoomExpenses(id).catch(() => []),
        BalanceClientService.getRoomBalances(id).catch(() => null),
        BalanceClientService.getSuggestedSettlements(id).catch(() => null),
        BalanceClientService.getRoomBilateralDebts(id).catch(() => []),
        SettlementClientService.listRoomSettlements(id).catch(() => []),
      ]);

      setRoom(roomRes);
      setExpenses(expRes);
      setBalancesData(balRes);
      setSettlementsData(setRes);
      setBilateralDebts(debtsRes);
      setRoomSettlements(settlementsRes);
    } catch (err: any) {
      setError(err?.message || 'Failed to load room details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRoomData();
  }, [fetchRoomData]);

  const isAdmin = Boolean(user && room && room.adminId === user.uid);
  const activeMembers = room?.members.filter((m) => m.status === 'active') || [];
  const removedMembers = room?.members.filter((m) => m.status === 'removed') || [];

  // Debts related to current user
  const myDebtsToOthers = bilateralDebts.filter((d) => d.debtorId === user?.uid);
  const debtsOthersOweMe = bilateralDebts.filter((d) => d.receiverId === user?.uid);

  // Pending settlements
  const pendingRequestsToVerify = roomSettlements.filter(
    (s) => s.status === 'pending' && s.receiverId === user?.uid
  );
  const myPendingRequestsSent = roomSettlements.filter(
    (s) => s.status === 'pending' && s.debtorId === user?.uid
  );

  const TABS: TabItem[] = [
    {
      id: 'expenses',
      label: 'Expenses',
      icon: 'receipt-outline',
      badge: expenses.length > 0 ? expenses.length : undefined,
    },
    {
      id: 'balances',
      label: 'Balances',
      icon: 'pie-chart-outline',
    },
    {
      id: 'settlements',
      label: 'Settlements',
      icon: 'checkmark-done-circle-outline',
      badge: pendingRequestsToVerify.length > 0 ? pendingRequestsToVerify.length : undefined,
    },
    {
      id: 'members',
      label: 'Members',
      icon: 'people-outline',
      badge: activeMembers.length > 0 ? activeMembers.length : undefined,
    },
  ];

  const activeTabIndex = Math.max(
    0,
    TABS.findIndex((t) => t.id === activeTab)
  );

  const scrollTabIntoView = (index: number) => {
    if (tabsScrollRef.current) {
      const approxTabWidth = 125;
      const targetX = Math.max(0, index * approxTabWidth - 40);
      tabsScrollRef.current.scrollTo({ x: targetX, animated: true });
    }
  };

  const handleTabPress = (tab: RoomTab, index: number) => {
    setActiveTab(tab);
    if (pagerRef.current && containerWidth > 0) {
      pagerRef.current.scrollTo({ x: index * containerWidth, animated: true });
    }
    scrollTabIntoView(index);
  };

  const handlePagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    if (containerWidth > 0) {
      const pageIndex = Math.round(offsetX / containerWidth);
      if (pageIndex >= 0 && pageIndex < TABS.length) {
        const selectedTab = TABS[pageIndex].id;
        if (selectedTab !== activeTab) {
          setActiveTab(selectedTab);
          scrollTabIntoView(pageIndex);
        }
      }
    }
  };

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    const newWidth = e.nativeEvent.layout.width;
    if (newWidth > 0 && Math.abs(newWidth - containerWidth) > 1) {
      setContainerWidth(newWidth);
      if (pagerRef.current) {
        pagerRef.current.scrollTo({ x: activeTabIndex * newWidth, animated: false });
      }
    }
  };

  const handleGenerateInvite = async () => {
    if (!room) return;
    setGeneratingInvite(true);
    try {
      const inv = await RoomClientService.createInvitation(room._id, 7);
      setInvitation(inv);
      setInviteModalVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate invitation code.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const handleShareInvite = async () => {
    if (!invitation) return;
    try {
      await Share.share({
        message: `Join our room "${invitation.roomName}" on Spendly using invite code: ${invitation.inviteCode}\n(Code valid for 7 days)`,
      });
    } catch (err: any) {
      // Ignored or dismissed
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!room || !memberToRemove || removingMember) return;
    setRemovingMember(true);
    try {
      const updated = await RoomClientService.removeMember(room._id, memberToRemove.userId);
      setRoom(updated);
      setMemberToRemove(null);
      Alert.alert('Success', `${memberToRemove.displayName || 'Member'} has been removed.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to remove member.');
    } finally {
      setRemovingMember(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!room || archiving) return;
    setArchiving(true);
    try {
      const updated = await RoomClientService.archiveRoom(room._id);
      setRoom(updated);
      setArchiveDialogVisible(false);
      Alert.alert('Room Archived', 'This room has been archived and is now read-only.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to archive room.');
    } finally {
      setArchiving(false);
    }
  };

  // Settlement handlers
  const handleConfirmSettleUp = async () => {
    if (!room || !settleUpTarget || settlingUp) return;
    setSettlingUp(true);
    try {
      await SettlementClientService.createSettlement(room._id, {
        receiverId: settleUpTarget.receiverId,
        amountPaise: settleUpTarget.amountPaise,
        idempotencyKey: `settle_${room._id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      });
      setSettleUpTarget(null);
      Alert.alert(
        'Settlement Request Sent',
        `A repayment verification request of ₹${paiseToRupees(
          settleUpTarget.amountPaise
        )} has been sent to ${settleUpTarget.receiverDisplayName}. Your balance will update once they verify receipt.`
      );
      fetchRoomData(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create settlement request.');
    } finally {
      setSettlingUp(false);
    }
  };

  const handleVerifySettlement = async (settlementId: string) => {
    if (verifyingId) return;
    setVerifyingId(settlementId);
    try {
      await SettlementClientService.verifySettlement(settlementId);
      Alert.alert('Repayment Verified', 'The settlement has been verified and balances have been updated.');
      fetchRoomData(true);
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'Failed to verify settlement.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleOpenRejectModal = (settlementId: string) => {
    setRejectingSettlementId(settlementId);
    setRejectReason('');
  };

  const handleConfirmRejectSettlement = async () => {
    if (!rejectingSettlementId || submittingReject) return;
    if (!rejectReason.trim()) {
      Alert.alert('Validation Error', 'Please enter a reason for rejecting this repayment request.');
      return;
    }

    setSubmittingReject(true);
    try {
      await SettlementClientService.rejectSettlement(rejectingSettlementId, rejectReason.trim());
      setRejectingSettlementId(null);
      setRejectReason('');
      Alert.alert('Settlement Rejected', 'The settlement request was rejected with your reason.');
      fetchRoomData(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to reject settlement.');
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleCancelSettlement = async (settlementId: string) => {
    if (cancellingId) return;
    setCancellingId(settlementId);
    try {
      await SettlementClientService.cancelSettlement(settlementId);
      Alert.alert('Request Cancelled', 'Your repayment settlement request was cancelled.');
      fetchRoomData(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel settlement request.');
    } finally {
      setCancellingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading room details...</Text>
      </View>
    );
  }

  if (error || !room) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{error || 'Room not found'}</Text>
        <Button title="Retry" onPress={() => fetchRoomData()} variant="outline" style={styles.retryBtn} />
      </View>
    );
  }

  // Sub-renderers for each tab page
  const renderExpensesTab = () => (
    <View style={styles.tabSection}>
      {expenses.length === 0 ? (
        <Card style={styles.emptyCard}>
          <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No Shared Expenses Yet</Text>
          <Text style={styles.emptyDesc}>
            Split mess bills, groceries, electricity, or outing expenses with your roommates.
          </Text>
          {room.status === 'active' && (
            <Button
              title="Add First Shared Expense"
              onPress={() => router.push(`/rooms/expenses/create?roomId=${room._id}` as any)}
              style={styles.emptyActionBtn}
            />
          )}
        </Card>
      ) : (
        expenses.map((exp) => {
          const isPayer = exp.payerId === user?.uid;
          const userPart = exp.participants.find((p) => p.userId === user?.uid);
          const pendingCount = exp.participants.filter((p) => p.status === 'pending').length;

          return (
            <TouchableOpacity
              key={exp._id}
              activeOpacity={0.7}
              onPress={() => router.push(`/rooms/expenses/${exp._id}` as any)}
            >
              <Card style={styles.expenseItemCard}>
                <View style={styles.expenseItemHeader}>
                  <View style={styles.expenseTitleCol}>
                    <Text style={styles.expenseItemTitle}>{exp.title || 'Shared Expense'}</Text>
                    <Text style={styles.expenseItemPayer}>
                      Paid by {isPayer ? 'You' : exp.participants.find((p) => p.userId === exp.payerId)?.displayName || 'Roommate'}
                    </Text>
                  </View>

                  <View style={styles.expenseAmountCol}>
                    <Text style={styles.expenseItemAmount}>₹{paiseToRupees(exp.amountPaise)}</Text>
                    {userPart && (
                      <Text style={styles.expenseUserShare}>
                        Your share: ₹{paiseToRupees(userPart.sharePaise)}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.expenseItemFooter}>
                  <View
                    style={[
                      styles.expStatusBadge,
                      exp.status === 'confirmed'
                        ? styles.statusConfirmed
                        : exp.status === 'rejected'
                        ? styles.statusRejected
                        : exp.status === 'cancelled'
                        ? styles.statusCancelled
                        : styles.statusPending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.expStatusBadgeText,
                        exp.status === 'confirmed'
                          ? styles.statusConfirmedText
                          : exp.status === 'rejected'
                          ? styles.statusRejectedText
                          : exp.status === 'cancelled'
                          ? styles.statusCancelledText
                          : styles.statusPendingText,
                      ]}
                    >
                      {exp.status === 'pending'
                        ? `Pending (${pendingCount} left)`
                        : exp.status.toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.expenseDate}>
                    {new Date(exp.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  const renderBalancesTab = () => (
    <View style={styles.tabSection}>
      {/* Member Net Balances */}
      <Text style={styles.sectionTitle}>Room Member Balances</Text>
      <Card style={styles.balancesCard}>
        {balancesData?.balances && balancesData.balances.length > 0 ? (
          balancesData.balances.map((b, index) => {
            const isSelf = b.userId === user?.uid;
            const isPositive = b.netBalancePaise > 0;
            const isNegative = b.netBalancePaise < 0;

            return (
              <View
                key={b.userId}
                style={[
                  styles.balanceRow,
                  index === balancesData.balances.length - 1 && styles.lastRow,
                ]}
              >
                <View style={styles.balanceMemberInfo}>
                  <Text style={styles.balanceMemberName}>
                    {b.displayName || 'Roommate'} {isSelf ? '(You)' : ''}
                  </Text>
                  <Text style={styles.balanceSubtext}>
                    Paid: ₹{paiseToRupees(b.totalPaidPaise)} | Share: ₹{paiseToRupees(b.totalSharePaise)}
                  </Text>
                </View>

                <View style={styles.balanceAmountBox}>
                  <Text
                    style={[
                      styles.balanceNetText,
                      isPositive
                        ? styles.netPositiveText
                        : isNegative
                        ? styles.netNegativeText
                        : styles.netSettledText,
                    ]}
                  >
                    {isPositive
                      ? `+₹${paiseToRupees(b.netBalancePaise)}`
                      : isNegative
                      ? `-₹${paiseToRupees(-b.netBalancePaise)}`
                      : '₹0.00'}
                  </Text>
                  <Text style={styles.balanceStatusHint}>
                    {isPositive ? 'gets back' : isNegative ? 'owes' : 'settled'}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.noDataText}>No confirmed balances yet.</Text>
        )}
      </Card>

      {/* Suggested Transfers */}
      <View style={styles.suggestedHeaderRow}>
        <Text style={styles.sectionTitle}>Suggested Simplified Transfers</Text>
        <Text style={styles.suggestedNote}>Informational</Text>
      </View>
      <Card style={styles.settlementsCard}>
        {settlementsData?.suggestedTransfers && settlementsData.suggestedTransfers.length > 0 ? (
          settlementsData.suggestedTransfers.map((st, index) => {
            const fromSelf = st.fromUserId === user?.uid;
            const toSelf = st.toUserId === user?.uid;

            return (
              <View
                key={`${st.fromUserId}_${st.toUserId}_${index}`}
                style={[
                  styles.settleRow,
                  index === settlementsData.suggestedTransfers.length - 1 && styles.lastRow,
                ]}
              >
                <View style={styles.settleIconBox}>
                  <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
                </View>

                <View style={styles.settleInfo}>
                  <Text style={styles.settleNames}>
                    <Text style={{ fontWeight: '700' }}>{st.fromDisplayName || 'Debtor'}{fromSelf ? ' (You)' : ''}</Text>
                    {' pays '}
                    <Text style={{ fontWeight: '700' }}>{st.toDisplayName || 'Creditor'}{toSelf ? ' (You)' : ''}</Text>
                  </Text>
                  <Text style={styles.settleAmount}>
                    ₹{paiseToRupees(st.amountPaise)}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.settledContainer}>
            <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
            <Text style={styles.settledText}>All debts in this room are currently settled!</Text>
          </View>
        )}
        <View style={styles.settlementHintBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.settlementHintText}>
            Suggested transfers simplify multi-party balances. To record and verify actual repayments, swipe to the Settlements tab.
          </Text>
        </View>
      </Card>
    </View>
  );

  const renderSettlementsTab = () => (
    <View style={styles.tabSection}>
      {/* Action Required: Incoming Repayment Requests */}
      {pendingRequestsToVerify.length > 0 && (
        <View style={styles.settlementSubSection}>
          <View style={styles.actionRequiredHeader}>
            <Ionicons name="alert-circle" size={20} color={colors.warning} />
            <Text style={styles.actionRequiredTitle}>
              Repayment Verification Required ({pendingRequestsToVerify.length})
            </Text>
          </View>

          {pendingRequestsToVerify.map((req) => {
            const debtorMember = room.members.find((m) => m.userId === req.debtorId);
            const isVerifying = verifyingId === req._id;

            return (
              <Card key={req._id} style={styles.pendingActionCard}>
                <View style={styles.pendingActionHeader}>
                  <View>
                    <Text style={styles.pendingDebtorName}>
                      {debtorMember?.displayName || 'Roommate'}
                    </Text>
                    <Text style={styles.pendingDate}>
                      Requested on {new Date(req.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.pendingActionAmount}>
                    ₹{paiseToRupees(req.amountPaise)}
                  </Text>
                </View>

                <Text style={styles.pendingActionPrompt}>
                  Confirm that you have received this payment to settle the debt.
                </Text>

                <View style={styles.pendingBtnRow}>
                  <Button
                    title="Verify Receipt"
                    onPress={() => handleVerifySettlement(req._id)}
                    loading={isVerifying}
                    style={styles.verifyBtn}
                  />
                  <Button
                    title="Reject"
                    variant="outline"
                    onPress={() => handleOpenRejectModal(req._id)}
                    style={styles.rejectBtn}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Outgoing Pending Requests Sent By User */}
      {myPendingRequestsSent.length > 0 && (
        <View style={styles.settlementSubSection}>
          <Text style={styles.sectionTitle}>Waiting for Verification</Text>
          {myPendingRequestsSent.map((req) => {
            const receiverMember = room.members.find((m) => m.userId === req.receiverId);
            const isCancelling = cancellingId === req._id;

            return (
              <Card key={req._id} style={styles.waitingCard}>
                <View style={styles.waitingHeader}>
                  <View>
                    <Text style={styles.waitingTitle}>
                      Sent to {receiverMember?.displayName || 'Roommate'}
                    </Text>
                    <Text style={styles.waitingDate}>
                      Requested {new Date(req.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={styles.waitingAmount}>
                    ₹{paiseToRupees(req.amountPaise)}
                  </Text>
                </View>

                <View style={styles.waitingFooter}>
                  <View style={styles.waitingStatusBox}>
                    <ActivityIndicator size="small" color={colors.warning} style={{ marginRight: 6 }} />
                    <Text style={styles.waitingStatusText}>Awaiting confirmation</Text>
                  </View>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => handleCancelSettlement(req._id)}
                    loading={isCancelling}
                    style={styles.cancelSmallBtn}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {/* Direct Bilateral Debts / Settle Up Options */}
      <Text style={styles.sectionTitle}>Direct Bilateral Debts</Text>
      <Card style={styles.bilateralCard}>
        {myDebtsToOthers.length === 0 && debtsOthersOweMe.length === 0 ? (
          <View style={styles.settledContainer}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.success} />
            <Text style={styles.settledText}>You have no direct outstanding debts.</Text>
          </View>
        ) : (
          <>
            {/* You Owe Others */}
            {myDebtsToOthers.map((debt, index) => {
              const receiverMember = room.members.find((m) => m.userId === debt.receiverId);
              const receiverName = receiverMember?.displayName || debt.receiverDisplayName || 'Roommate';

              return (
                <View
                  key={`owe_${debt.receiverId}_${index}`}
                  style={[styles.bilateralRow, index === myDebtsToOthers.length - 1 && debtsOthersOweMe.length === 0 && styles.lastRow]}
                >
                  <View style={styles.bilateralInfo}>
                    <Text style={styles.bilateralName}>You owe {receiverName}</Text>
                    <Text style={styles.bilateralAmountOwe}>
                      ₹{paiseToRupees(debt.amountPaise)}
                    </Text>
                  </View>

                  {room.status === 'active' && (
                    <Button
                      title="Settle Up"
                      onPress={() =>
                        setSettleUpTarget({
                          receiverId: debt.receiverId,
                          receiverDisplayName: receiverName,
                          amountPaise: debt.amountPaise,
                        })
                      }
                      style={styles.settleUpBtn}
                    />
                  )}
                </View>
              );
            })}

            {/* Others Owe You */}
            {debtsOthersOweMe.map((debt, index) => {
              const debtorMember = room.members.find((m) => m.userId === debt.debtorId);
              const debtorName = debtorMember?.displayName || debt.debtorDisplayName || 'Roommate';

              return (
                <View
                  key={`owed_${debt.debtorId}_${index}`}
                  style={[styles.bilateralRow, index === debtsOthersOweMe.length - 1 && styles.lastRow]}
                >
                  <View style={styles.bilateralInfo}>
                    <Text style={styles.bilateralName}>{debtorName} owes you</Text>
                    <Text style={styles.bilateralAmountOwed}>
                      +₹{paiseToRupees(debt.amountPaise)}
                    </Text>
                  </View>

                  <Text style={styles.awaitingRepayText}>Awaiting payment</Text>
                </View>
              );
            })}
          </>
        )}
      </Card>

      {/* Past Settlement History */}
      <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
        Settlement History ({roomSettlements.length})
      </Text>
      <Card style={styles.historyCard}>
        {roomSettlements.length === 0 ? (
          <Text style={styles.noDataText}>No settlement records in this room yet.</Text>
        ) : (
          roomSettlements.map((st, index) => {
            const debtorMember = room.members.find((m) => m.userId === st.debtorId);
            const receiverMember = room.members.find((m) => m.userId === st.receiverId);

            const debtorName = st.debtorId === user?.uid ? 'You' : debtorMember?.displayName || 'Debtor';
            const receiverName = st.receiverId === user?.uid ? 'You' : receiverMember?.displayName || 'Receiver';

            return (
              <View
                key={st._id}
                style={[styles.historyRow, index === roomSettlements.length - 1 && styles.lastRow]}
              >
                <View style={styles.historyTopRow}>
                  <View style={styles.historyNames}>
                    <Text style={styles.historyTransferText}>
                      <Text style={{ fontWeight: '700' }}>{debtorName}</Text>
                      {' paid '}
                      <Text style={{ fontWeight: '700' }}>{receiverName}</Text>
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(st.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <View style={styles.historyAmountBox}>
                    <Text style={styles.historyAmountText}>
                      ₹{paiseToRupees(st.amountPaise)}
                    </Text>
                    <View
                      style={[
                        styles.stStatusBadge,
                        st.status === 'verified'
                          ? styles.statusVerified
                          : st.status === 'rejected'
                          ? styles.statusRejected
                          : st.status === 'cancelled'
                          ? styles.statusCancelled
                          : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.stStatusBadgeText,
                          st.status === 'verified'
                            ? styles.statusVerifiedText
                            : st.status === 'rejected'
                            ? styles.statusRejectedText
                            : st.status === 'cancelled'
                            ? styles.statusCancelledText
                            : styles.statusPendingText,
                        ]}
                      >
                        {st.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                {st.status === 'rejected' && st.rejectionReason && (
                  <View style={styles.historyRejectionBox}>
                    <Ionicons name="information-circle" size={14} color={colors.danger} />
                    <Text style={styles.historyRejectionText}>
                      Reason: {st.rejectionReason}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );

  const renderMembersTab = () => (
    <View style={styles.tabSection}>
      <Text style={styles.sectionTitle}>Active Members ({activeMembers.length})</Text>
      <Card style={styles.membersCard}>
        {activeMembers.map((member, index) => {
          const isSelf = member.userId === user?.uid;
          const isMemberAdmin = member.role === 'admin';

          return (
            <View
              key={member.userId}
              style={[
                styles.memberRow,
                index === activeMembers.length - 1 && removedMembers.length === 0 && styles.lastRow,
              ]}
            >
              <View style={styles.memberAvatar}>
                <Text style={styles.avatarText}>
                  {(member.displayName || member.email || 'M').charAt(0).toUpperCase()}
                </Text>
              </View>

              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>
                    {member.displayName || 'Roommate'}
                    {isSelf ? ' (You)' : ''}
                  </Text>
                  {isMemberAdmin && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                {member.email ? (
                  <Text style={styles.memberEmail}>{member.email}</Text>
                ) : null}
                <Text style={styles.memberJoined}>
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </Text>
              </View>

              {isAdmin && !isSelf && !isMemberAdmin && room.status === 'active' && (
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => setMemberToRemove(member)}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {removedMembers.length > 0 && (
          <View style={styles.removedSection}>
            <Text style={styles.removedHeader}>Former Members</Text>
            {removedMembers.map((member, index) => (
              <View
                key={member.userId}
                style={[
                  styles.memberRow,
                  styles.removedMemberRow,
                  index === removedMembers.length - 1 && styles.lastRow,
                ]}
              >
                <View style={[styles.memberAvatar, styles.removedAvatar]}>
                  <Text style={styles.removedAvatarText}>
                    {(member.displayName || member.email || 'M').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberName, styles.removedText]}>
                    {member.displayName || 'Roommate'} (Removed)
                  </Text>
                  {member.email ? (
                    <Text style={[styles.memberEmail, styles.removedText]}>{member.email}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Admin Controls */}
      {isAdmin && room.status === 'active' && (
        <View style={styles.adminControlsSection}>
          <Button
            title="Archive Room"
            onPress={() => setArchiveDialogVisible(true)}
            variant="outline"
            style={styles.archiveBtn}
          />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* Pinned Room Header Card */}
      <View style={styles.headerSection}>
        <Card style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.titleArea}>
              <Text style={styles.roomName}>{room.name}</Text>
              {room.description ? (
                <Text style={styles.roomDescription}>{room.description}</Text>
              ) : null}
            </View>
            <View
              style={[
                styles.statusBadge,
                room.status === 'active' ? styles.statusActive : styles.statusArchived,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  room.status === 'active' ? styles.statusActiveText : styles.statusArchivedText,
                ]}
              >
                {room.status.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.metaText}>
                {activeMembers.length} {activeMembers.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="receipt-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.metaText}>
                {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}
              </Text>
            </View>
            {isAdmin && (
              <View style={styles.adminIndicator}>
                <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                <Text style={styles.adminIndicatorText}>You are Admin</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.headerActionButtons}>
            {room.status === 'active' && (
              <Button
                title="+ Add Expense"
                onPress={() => router.push(`/rooms/expenses/create?roomId=${room._id}` as any)}
                style={styles.addExpenseBtn}
              />
            )}

            {isAdmin && room.status === 'active' && (
              <Button
                title="Invite"
                onPress={handleGenerateInvite}
                loading={generatingInvite}
                variant="outline"
                style={styles.headerSmallBtn}
              />
            )}
          </View>
        </Card>

        {/* Horizontal Scrollable Tabs Bar (WhatsApp style) */}
        <View style={styles.tabsWrapper}>
          <ScrollView
            ref={tabsScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsScrollContent}
          >
            {TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  activeOpacity={0.7}
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                  onPress={() => handleTabPress(tab.id, idx)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                    {tab.label}
                  </Text>
                  {tab.badge !== undefined && (
                    <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                      <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
                        {tab.badge}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Main Body Horizontal Pager (Swipe Left/Right to Switch Pages) */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePagerScrollEnd}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {/* Page 0: Expenses */}
        <ScrollView
          style={{ width: containerWidth }}
          contentContainerStyle={styles.tabScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRoomData(true)} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderExpensesTab()}
        </ScrollView>

        {/* Page 1: Balances */}
        <ScrollView
          style={{ width: containerWidth }}
          contentContainerStyle={styles.tabScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRoomData(true)} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderBalancesTab()}
        </ScrollView>

        {/* Page 2: Settlements */}
        <ScrollView
          style={{ width: containerWidth }}
          contentContainerStyle={styles.tabScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRoomData(true)} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderSettlementsTab()}
        </ScrollView>

        {/* Page 3: Members */}
        <ScrollView
          style={{ width: containerWidth }}
          contentContainerStyle={styles.tabScrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchRoomData(true)} />
          }
          showsVerticalScrollIndicator={false}
        >
          {renderMembersTab()}
        </ScrollView>
      </ScrollView>

      {/* Settle Up Confirmation Modal */}
      <Modal
        visible={Boolean(settleUpTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setSettleUpTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="wallet-outline" size={32} color={colors.primary} />
              <Text style={styles.modalTitle}>Settle Bilateral Debt</Text>
            </View>

            <Text style={styles.modalDesc}>
              Request settlement of the full outstanding debt of{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                ₹{settleUpTarget ? paiseToRupees(settleUpTarget.amountPaise) : '0.00'}
              </Text>{' '}
              with{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                {settleUpTarget?.receiverDisplayName}
              </Text>
              .
            </Text>

            <View style={styles.settleNoteBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.settleNoteText}>
                Transfer the funds to {settleUpTarget?.receiverDisplayName} via UPI / cash. Once submitted, they will verify receipt to complete the settlement.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Button
                title="Send Request"
                onPress={handleConfirmSettleUp}
                loading={settlingUp}
                style={styles.modalActionBtn}
              />
              <Button
                title="Cancel"
                onPress={() => setSettleUpTarget(null)}
                variant="outline"
                disabled={settlingUp}
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        visible={Boolean(rejectingSettlementId)}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingSettlementId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="close-circle-outline" size={32} color={colors.danger} />
              <Text style={styles.modalTitle}>Reject Repayment Request</Text>
            </View>

            <Text style={styles.modalDesc}>
              Please provide a reason why this repayment request was not received or is incorrect.
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="e.g., Payment not received in bank account / incorrect amount"
              placeholderTextColor={colors.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={300}
            />

            <View style={styles.modalActions}>
              <Button
                title="Confirm Reject"
                variant="danger"
                onPress={handleConfirmRejectSettlement}
                loading={submittingReject}
                style={styles.modalActionBtn}
              />
              <Button
                title="Cancel"
                onPress={() => setRejectingSettlementId(null)}
                variant="outline"
                disabled={submittingReject}
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Code Modal */}
      <Modal
        visible={inviteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="key" size={28} color={colors.primary} />
              <Text style={styles.modalTitle}>Room Invite Code</Text>
            </View>

            <Text style={styles.modalDesc}>
              Share this 6-character code with your roommates to let them join "{room.name}".
            </Text>

            <View style={styles.codeContainer}>
              <Text style={styles.codeText} selectable>
                {invitation?.inviteCode}
              </Text>
            </View>

            <Text style={styles.codeExpiry}>
              Valid for 7 days (expires {invitation ? new Date(invitation.expiresAt).toLocaleDateString() : ''})
            </Text>

            <View style={styles.modalActions}>
              <Button
                title="Share Code"
                onPress={handleShareInvite}
                style={styles.modalActionBtn}
              />
              <Button
                title="Done"
                onPress={() => setInviteModalVisible(false)}
                variant="outline"
                style={styles.modalActionBtn}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Remove Member Dialog */}
      <ConfirmationDialog
        visible={Boolean(memberToRemove)}
        title="Remove Member"
        message={`Are you sure you want to remove ${memberToRemove?.displayName || 'this member'} from ${room.name}?`}
        confirmText="Remove"
        isDestructive
        loading={removingMember}
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Archive Room Dialog */}
      <ConfirmationDialog
        visible={archiveDialogVisible}
        title="Archive Room"
        message="Archiving will make this room read-only. Members will still be able to view past history. Are you sure you want to archive this room?"
        confirmText="Archive"
        isDestructive
        loading={archiving}
        onConfirm={handleConfirmArchive}
        onCancel={() => setArchiveDialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  pager: {
    flex: 1,
  },
  tabScrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
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
    marginBottom: spacing.xs,
    padding: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  roomName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  roomDescription: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  statusActive: {
    backgroundColor: colors.successLight,
  },
  statusArchived: {
    backgroundColor: colors.surfaceSubtle,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusActiveText: {
    color: colors.success,
  },
  statusArchivedText: {
    color: colors.textMuted,
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
  adminIndicatorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  headerActionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addExpenseBtn: {
    flex: 1,
  },
  headerSmallBtn: {
    minWidth: 80,
  },
  tabsWrapper: {
    marginVertical: spacing.xs,
  },
  tabsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  tabButtonText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.full,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: colors.primary,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabBadgeTextActive: {
    color: colors.surface,
  },
  tabSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
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
  expenseItemCard: {
    marginBottom: spacing.xs,
  },
  expenseItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  expenseTitleCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  expenseItemTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expenseItemPayer: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  expenseAmountCol: {
    alignItems: 'flex-end',
  },
  expenseItemAmount: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expenseUserShare: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  expenseItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  expStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  statusPending: {
    backgroundColor: colors.warningLight,
  },
  statusConfirmed: {
    backgroundColor: colors.successLight,
  },
  statusRejected: {
    backgroundColor: colors.dangerLight,
  },
  statusCancelled: {
    backgroundColor: colors.surfaceSubtle,
  },
  expStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusPendingText: {
    color: colors.warning,
  },
  statusConfirmedText: {
    color: colors.success,
  },
  statusRejectedText: {
    color: colors.danger,
  },
  statusCancelledText: {
    color: colors.textMuted,
  },
  expenseDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  balancesCard: {
    padding: 0,
    overflow: 'hidden',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  balanceMemberInfo: {
    flex: 1,
  },
  balanceMemberName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  balanceSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  balanceAmountBox: {
    alignItems: 'flex-end',
  },
  balanceNetText: {
    ...typography.amountMedium,
    fontWeight: '700',
  },
  netPositiveText: {
    color: colors.success,
  },
  netNegativeText: {
    color: colors.danger,
  },
  netSettledText: {
    color: colors.textMuted,
  },
  balanceStatusHint: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  suggestedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  suggestedNote: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  settlementsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.md,
  },
  settleIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settleInfo: {
    flex: 1,
  },
  settleNames: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  settleAmount: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
    marginTop: 2,
  },
  settlementHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  settlementHintText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  settledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  settledText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.success,
  },
  noDataText: {
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
  },
  settlementSubSection: {
    marginBottom: spacing.md,
  },
  actionRequiredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  actionRequiredTitle: {
    ...typography.h3,
    color: colors.warning,
  },
  pendingActionCard: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warning,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  pendingActionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  pendingDebtorName: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  pendingDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  pendingActionAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  pendingActionPrompt: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  pendingBtnRow: {
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
  waitingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  waitingTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  waitingDate: {
    ...typography.caption,
    color: colors.textMuted,
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
  waitingStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waitingStatusText: {
    ...typography.caption,
    color: colors.warning,
    fontWeight: '600',
  },
  cancelSmallBtn: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  bilateralCard: {
    padding: 0,
    overflow: 'hidden',
  },
  bilateralRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  bilateralInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  bilateralName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  bilateralAmountOwe: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.danger,
    marginTop: 2,
  },
  bilateralAmountOwed: {
    ...typography.amountMedium,
    fontWeight: '700',
    color: colors.success,
    marginTop: 2,
  },
  settleUpBtn: {
    minWidth: 90,
  },
  awaitingRepayText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  historyCard: {
    padding: 0,
    overflow: 'hidden',
  },
  historyRow: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyNames: {
    flex: 1,
    marginRight: spacing.sm,
  },
  historyTransferText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  historyDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyAmountBox: {
    alignItems: 'flex-end',
  },
  historyAmountText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  stStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  statusVerified: {
    backgroundColor: colors.successLight,
  },
  stStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusVerifiedText: {
    color: colors.success,
  },
  historyRejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerLight,
    padding: spacing.xs,
    borderRadius: radii.sm,
    marginTop: spacing.xs,
  },
  historyRejectionText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  membersCard: {
    padding: 0,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.primary,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  memberName: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  memberEmail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  memberJoined: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  removeBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  removedSection: {
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  removedHeader: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  removedMemberRow: {
    opacity: 0.6,
  },
  removedAvatar: {
    backgroundColor: colors.borderSubtle,
  },
  removedAvatarText: {
    color: colors.textMuted,
  },
  removedText: {
    color: colors.textMuted,
  },
  adminControlsSection: {
    marginTop: spacing.md,
  },
  archiveBtn: {
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
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  modalHeader: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  settleNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  settleNoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  reasonInput: {
    width: '100%',
    minHeight: 80,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  codeContainer: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xs,
  },
  codeText: {
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
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalActionBtn: {
    flex: 1,
  },
});
