import { useCallback, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Room, RoomMember, RoomClientService, InvitationInfo } from '../../services/room-service';
import { ExpenseClientService, SharedExpense } from '../../services/expense-client';
import {
  BalanceClientService,
  RoomBalancesResult,
  SuggestedSettlementsResult,
} from '../../services/balance-client';
import { SettlementClientService, SettlementModel } from '../../services/settlement-client';
import { paiseToRupees } from '../../domain/money';

export type Refresh = (isRefresh?: boolean) => Promise<void>;

export interface SettleUpTarget {
  debtorId: string;
  receiverId: string;
  receiverDisplayName: string;
  amountPaise: number;
}

/**
 * Loads everything the room screen shows. Room details can stay mounted while a
 * child screen is pushed, so data reloads on every focus. Only the first load
 * shows the full-screen spinner: later reloads keep the current tab and its
 * data on screen instead of remounting the pager.
 */
export function useRoomData(id: string | undefined) {
  const [room, setRoom] = useState<Room | null>(null);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [balances, setBalances] = useState<RoomBalancesResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedSettlementsResult | null>(null);
  const [settlements, setSettlements] = useState<SettlementModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const refresh = useCallback<Refresh>(
    async (isRefresh = false) => {
      if (!id) return;
      if (isRefresh) setRefreshing(true);
      else if (!loaded.current) setLoading(true);
      setError(null);

      try {
        const [roomRes, expRes, balRes, sugRes, setRes] = await Promise.all([
          RoomClientService.getRoomById(id),
          ExpenseClientService.listRoomExpenses(id).catch(() => []),
          BalanceClientService.getRoomBalances(id).catch(() => null),
          BalanceClientService.getSuggestedSettlements(id).catch(() => null),
          SettlementClientService.listRoomSettlements(id).catch(() => []),
        ]);
        setRoom(roomRes);
        setExpenses(expRes);
        setBalances(balRes);
        setSuggestions(sugRes);
        setSettlements(setRes);
        loaded.current = true;
      } catch (err: any) {
        const message = err?.message || 'Failed to load room details.';
        if (loaded.current) Alert.alert('Could not refresh', message);
        else setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return { room, setRoom, expenses, balances, suggestions, settlements, loading, refreshing, error, refresh };
}

/** Invite code, member removal and archive: the admin side of a room. */
export function useRoomAdmin(room: Room | null, setRoom: (room: Room) => void) {
  const [inviteVisible, setInviteVisible] = useState(false);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<RoomMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const generateInvite = async () => {
    if (!room) return;
    setGeneratingInvite(true);
    try {
      setInvitation(await RoomClientService.createInvitation(room._id, 7));
      setInviteVisible(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate invitation code.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const shareInvite = async () => {
    if (!invitation) return;
    try {
      await Share.share({
        message: `Join our room "${invitation.roomName}" on Spendly using invite code: ${invitation.inviteCode}\n(Code valid for 7 days)`,
      });
    } catch {
      // Share sheet dismissed.
    }
  };

  const confirmRemoveMember = async () => {
    if (!room || !memberToRemove || removingMember) return;
    setRemovingMember(true);
    try {
      setRoom(await RoomClientService.removeMember(room._id, memberToRemove.userId));
      setMemberToRemove(null);
      Alert.alert('Success', `${memberToRemove.displayName || 'Member'} has been removed.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to remove member.');
    } finally {
      setRemovingMember(false);
    }
  };

  const confirmArchive = async () => {
    if (!room || archiving) return;
    setArchiving(true);
    try {
      setRoom(await RoomClientService.archiveRoom(room._id));
      setArchiveVisible(false);
      Alert.alert('Room Archived', 'This room has been archived and is now read-only.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to archive room.');
    } finally {
      setArchiving(false);
    }
  };

  return {
    inviteVisible, setInviteVisible, invitation, generatingInvite, generateInvite, shareInvite,
    memberToRemove, setMemberToRemove, removingMember, confirmRemoveMember,
    archiveVisible, setArchiveVisible, archiving, confirmArchive,
  };
}

/** Settle Up, verify, reject and cancel for repayment requests. */
export function useSettlementActions(room: Room | null, uid: string | undefined, refresh: Refresh) {
  const [settleUpTarget, setSettleUpTarget] = useState<SettleUpTarget | null>(null);
  const [settlingUp, setSettlingUp] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const confirmSettleUp = async () => {
    if (!room || !uid || !settleUpTarget || settleUpTarget.debtorId !== uid || settlingUp) return;
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
        `A repayment verification request of ₹${paiseToRupees(settleUpTarget.amountPaise)} has been sent to ${settleUpTarget.receiverDisplayName}. Your balance will update once they verify receipt.`
      );
      await refresh(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create settlement request.');
    } finally {
      setSettlingUp(false);
    }
  };

  const verify = async (settlementId: string) => {
    if (verifyingId) return;
    setVerifyingId(settlementId);
    try {
      await SettlementClientService.verifySettlement(settlementId);
      Alert.alert('Repayment Verified', 'The settlement has been verified and balances have been updated.');
      await refresh(true);
    } catch (err: any) {
      Alert.alert('Verification Failed', err?.message || 'Failed to verify settlement.');
    } finally {
      setVerifyingId(null);
    }
  };

  const openReject = (settlementId: string) => {
    setRejectingId(settlementId);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectingId || submittingReject) return;
    if (!rejectReason.trim()) {
      Alert.alert('Validation Error', 'Please enter a reason for rejecting this repayment request.');
      return;
    }
    setSubmittingReject(true);
    try {
      await SettlementClientService.rejectSettlement(rejectingId, rejectReason.trim());
      setRejectingId(null);
      setRejectReason('');
      Alert.alert('Settlement Rejected', 'The settlement request was rejected with your reason.');
      await refresh(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to reject settlement.');
    } finally {
      setSubmittingReject(false);
    }
  };

  const cancel = async (settlementId: string) => {
    if (cancellingId) return;
    setCancellingId(settlementId);
    try {
      await SettlementClientService.cancelSettlement(settlementId);
      Alert.alert('Request Cancelled', 'Your repayment settlement request was cancelled.');
      await refresh(true);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to cancel settlement request.');
    } finally {
      setCancellingId(null);
    }
  };

  return {
    settleUpTarget, setSettleUpTarget, settlingUp, confirmSettleUp,
    rejectingId, setRejectingId, rejectReason, setRejectReason, submittingReject, confirmReject, openReject,
    verifyingId, verify, cancellingId, cancel,
  };
}
