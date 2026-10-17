import { DeviceToken } from '../models/DeviceToken';
import { NotificationLog } from '../models/NotificationLog';
import { IExpense } from '../models/Expense';
import { ISettlement } from '../models/Settlement';
import { AppError } from '../middleware/errorHandler';

export interface ExpoPushMessage {
  to: string | string[];
  data?: Record<string, any>;
  title?: string;
  body?: string;
  sound?: 'default' | null;
  ttl?: number;
  expiration?: number;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
  categoryId?: string;
  mutableContent?: boolean;
}

export interface ExpoPushSuccessTicket {
  status: 'ok';
  id: string;
}

export interface ExpoPushErrorTicket {
  status: 'error';
  message: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded' | string;
    [key: string]: any;
  };
}

export type ExpoPushTicket = ExpoPushSuccessTicket | ExpoPushErrorTicket;

export interface ExpoPushReceiptSuccess {
  status: 'ok';
  details?: Record<string, any>;
}

export interface ExpoPushReceiptError {
  status: 'error';
  message: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded' | string;
    [key: string]: any;
  };
}

export type ExpoPushReceipt = ExpoPushReceiptSuccess | ExpoPushReceiptError;

export interface TicketCheckEntry {
  ticketId: string;
  token?: string;
  dedupKey?: string;
}

export interface SendNotificationParams {
  recipientIds: string[];
  dedupKeyPrefix: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, any>;
  channelId?: string;
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_API_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE_LIMIT = 100;

export function isExpoPushToken(token: any): boolean {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  if (!trimmed) return false;

  const match = trimmed.match(/^(?:ExponentPushToken|ExpoPushToken)\[(.+)\]$/);
  if (match) {
    return match[1].trim().length > 0;
  }

  return /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(trimmed);
}

export function chunkPushNotifications<T>(items: T[], chunkSize = CHUNK_SIZE_LIMIT): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

export const PushNotificationService = {
  /**
   * Validate Expo Push Token format
   */
  isValidPushToken(token: any): boolean {
    return isExpoPushToken(token);
  },

  /**
   * Register or update an Expo push token for an authenticated user
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'android' | 'ios' | 'web' | 'unknown' = 'android',
    deviceId?: string
  ): Promise<void> {
    const cleanToken = (token || '').trim();
    if (!cleanToken || !isExpoPushToken(cleanToken)) {
      throw new AppError('Invalid Expo push token format', 400, 'INVALID_PUSH_TOKEN');
    }

    // Upsert token: if token was previously registered to another user (device handed off / account switched),
    // it updates to the new user and is active.
    await DeviceToken.findOneAndUpdate(
      { pushToken: cleanToken },
      {
        userId,
        pushToken: cleanToken,
        platform,
        deviceId: deviceId ? deviceId.trim() : undefined,
        isActive: true,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true }
    );
  },

  /**
   * Unregister / deactivate an Expo push token upon logout
   */
  async unregisterDeviceToken(userId: string, token: string): Promise<void> {
    const cleanToken = (token || '').trim();
    if (!cleanToken) return;

    await DeviceToken.findOneAndUpdate(
      { pushToken: cleanToken, userId },
      { $set: { isActive: false, lastSeenAt: new Date() } }
    );
  },

  /**
   * Deactivate tokens that have been reported invalid or unregistered by Expo
   */
  async deactivateTokens(tokens: string[]): Promise<void> {
    if (!tokens || tokens.length === 0) return;
    try {
      await DeviceToken.updateMany(
        { pushToken: { $in: tokens } },
        { $set: { isActive: false, lastSeenAt: new Date() } }
      );
    } catch (err: any) {
      console.error('[PushNotificationService] Failed to deactivate invalid tokens:', err?.message);
    }
  },

  /**
   * Dispatch push messages to Expo Push API
   */
  async sendMessagesToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];

    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Expo push service responded with status ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as { data?: ExpoPushTicket[]; errors?: any[] };
    return json.data || [];
  },

  /**
   * Query Expo Push Service for delivery receipts
   * https://exp.host/--/api/v2/push/getReceipts
   */
  async getReceiptsFromExpo(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (!ticketIds || ticketIds.length === 0) return {};

    const response = await fetch(EXPO_RECEIPTS_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Expo push receipt service responded with status ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as { data?: Record<string, ExpoPushReceipt>; errors?: any[] };
    if (json.errors && json.errors.length > 0) {
      console.warn('[PushNotificationService] Expo receipts API returned errors:', json.errors);
    }
    return json.data || {};
  },

  /**
   * Process receipts safely, deactivate tokens for DeviceNotRegistered,
   * update NotificationLog status, and safely retry pending tickets.
   */
  async checkTicketReceipts(
    entries: TicketCheckEntry[],
    retryCount = 0
  ): Promise<{ checkedCount: number; errorsCount: number }> {
    if (!entries || entries.length === 0) {
      return { checkedCount: 0, errorsCount: 0 };
    }

    const validEntries = entries.filter((e) => Boolean(e && e.ticketId));
    if (validEntries.length === 0) {
      return { checkedCount: 0, errorsCount: 0 };
    }

    const entryMap = new Map<string, TicketCheckEntry>();
    validEntries.forEach((e) => entryMap.set(e.ticketId, e));

    const ticketIds = Array.from(entryMap.keys());
    const chunks = chunkPushNotifications(ticketIds, CHUNK_SIZE_LIMIT);

    let checkedCount = 0;
    let errorsCount = 0;
    const invalidTokensToDeactivate: string[] = [];
    const pendingRetryEntries: TicketCheckEntry[] = [];

    for (const chunk of chunks) {
      try {
        const receipts = await this.getReceiptsFromExpo(chunk);

        for (const ticketId of chunk) {
          const receipt = receipts[ticketId];
          const entry = entryMap.get(ticketId);

          if (!receipt) {
            // Receipt not yet available from Expo/FCM
            if (entry) pendingRetryEntries.push(entry);
            continue;
          }

          checkedCount++;

          if (receipt.status === 'ok') {
            try {
              await NotificationLog.updateMany(
                { ticketId },
                { $set: { receiptStatus: 'ok' } }
              );
            } catch (err: any) {
              console.warn(
                `[PushNotificationService] Failed to update receipt status for ${ticketId}:`,
                err?.message
              );
            }
          } else if (receipt.status === 'error') {
            errorsCount++;
            const receiptError =
              receipt.message || receipt.details?.error || 'Unknown delivery failure';
            console.warn(
              `[PushNotificationService] Delivery receipt error for ticket ${ticketId}:`,
              receiptError,
              receipt.details
            );

            try {
              await NotificationLog.updateMany(
                { ticketId },
                {
                  $set: {
                    status: 'failed',
                    receiptStatus: 'error',
                    receiptError,
                  },
                }
              );
            } catch (err: any) {
              console.warn(
                `[PushNotificationService] Failed to record receipt error for ${ticketId}:`,
                err?.message
              );
            }

            const isDeviceNotRegistered =
              (receipt.details &&
                (receipt.details.error === 'DeviceNotRegistered' ||
                  receipt.details.error === 'InvalidCredentials')) ||
              (typeof receipt.message === 'string' &&
                receipt.message.toLowerCase().includes('not registered'));

            if (isDeviceNotRegistered) {
              let tokenToDeactivate = entry?.token;
              if (!tokenToDeactivate) {
                const log = await NotificationLog.findOne({ ticketId });
                tokenToDeactivate = log?.pushToken;
              }
              if (tokenToDeactivate) {
                invalidTokensToDeactivate.push(tokenToDeactivate);
              }
            }
          }
        }
      } catch (err: any) {
        console.error('[PushNotificationService] Failed to query Expo push receipts:', err?.message);
        // On network/service failure, queue chunk for retry if retry limit has not been reached
        for (const ticketId of chunk) {
          const entry = entryMap.get(ticketId);
          if (entry) pendingRetryEntries.push(entry);
        }
      }
    }

    if (invalidTokensToDeactivate.length > 0) {
      await this.deactivateTokens(invalidTokensToDeactivate);
    }

    // Bounded retry: if some receipts were still pending and we haven't retried yet,
    // schedule one bounded retry after a delay (e.g. 30 seconds)
    if (pendingRetryEntries.length > 0 && retryCount < 1) {
      this.scheduleReceiptCheck(pendingRetryEntries, 30000, retryCount + 1);
    }

    return { checkedCount, errorsCount };
  },

  /**
   * Schedule a non-blocking, bounded deferred receipt check.
   * On Render's single-instance deployment, this executes within the Node.js event loop
   * using timer.unref() so process shutdown is never blocked.
   */
  scheduleReceiptCheck(
    entries: TicketCheckEntry[],
    delayMs = 15000,
    retryCount = 0
  ): void {
    if (!entries || entries.length === 0) return;

    const timer = setTimeout(() => {
      this.checkTicketReceipts(entries, retryCount).catch((err) => {
        console.warn(
          '[PushNotificationService] Deferred receipt check encountered error:',
          err?.message
        );
      });
    }, delayMs);

    if (timer.unref) {
      timer.unref();
    }
  },

  /**
   * Process pending receipts from MongoDB for recent notifications (last 24 hours).
   * Can be invoked on server boot, periodic maintenance, or on-demand without blocking API operations.
   */
  async processPendingReceipts(limit = 50): Promise<number> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pendingLogs = await NotificationLog.find({
        receiptStatus: 'pending',
        ticketId: { $exists: true, $ne: null },
        createdAt: { $gte: oneDayAgo },
      }).limit(limit);

      if (pendingLogs.length === 0) return 0;

      const entries: TicketCheckEntry[] = pendingLogs.map((log) => ({
        ticketId: log.ticketId!,
        token: log.pushToken,
        dedupKey: log.dedupKey,
      }));

      const { checkedCount } = await this.checkTicketReceipts(entries);
      return checkedCount;
    } catch (err: any) {
      console.warn('[PushNotificationService] Error in processPendingReceipts:', err?.message);
      return 0;
    }
  },

  /**
   * Starts a bounded, in-process periodic worker for checking pending receipts on Render.
   * Architecture note: On Render single-instance web service deployments, a separate worker process
   * or redis-backed cron is not provisioned. This in-process worker periodically sweeps recent
   * (last 24h) pending receipts without blocking the HTTP event loop or process shutdown.
   */
  startPeriodicReceiptWorker(intervalMs = 15 * 60 * 1000): NodeJS.Timeout | null {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }

    // Run initial sweep 15s after startup
    const initialTimer = setTimeout(() => {
      this.processPendingReceipts().catch((err) => {
        console.warn('[PushNotificationService] Startup receipt check failed:', err?.message);
      });
    }, 15000);
    if (initialTimer.unref) initialTimer.unref();

    const intervalTimer = setInterval(() => {
      this.processPendingReceipts().catch((err) => {
        console.warn('[PushNotificationService] Periodic receipt check failed:', err?.message);
      });
    }, intervalMs);
    if (intervalTimer.unref) intervalTimer.unref();

    return intervalTimer;
  },

  /**
   * Send push notification with deduplication and error handling
   */
  async sendNotification(params: SendNotificationParams): Promise<void> {
    try {
      const { recipientIds, dedupKeyPrefix, type, title, body, data, channelId = 'spendly-default' } = params;

      // Deduplicate recipient IDs
      const uniqueRecipients = Array.from(new Set(recipientIds.filter(Boolean)));
      if (uniqueRecipients.length === 0) return;

      // 1. Check deduplication for each recipient
      const eligibleRecipients: string[] = [];
      for (const recId of uniqueRecipients) {
        const dedupKey = `${dedupKeyPrefix}:${recId}`;
        const existing = await NotificationLog.findOne({ dedupKey });
        if (!existing) {
          eligibleRecipients.push(recId);
        }
      }

      if (eligibleRecipients.length === 0) {
        return;
      }

      // 2. Fetch active tokens for eligible recipients
      const activeDevices = await DeviceToken.find({
        userId: { $in: eligibleRecipients },
        isActive: true,
      });

      const recipientTokensMap = new Map<string, string[]>();
      for (const dev of activeDevices) {
        if (!recipientTokensMap.has(dev.userId)) {
          recipientTokensMap.set(dev.userId, []);
        }
        recipientTokensMap.get(dev.userId)!.push(dev.pushToken);
      }

      // 3. Prepare messages
      const messages: ExpoPushMessage[] = [];
      const tokenToRecipientMap = new Map<string, string>();

      for (const recId of eligibleRecipients) {
        const tokens = recipientTokensMap.get(recId) || [];
        if (tokens.length === 0) {
          // Log as skipped so we know it was handled and don't re-query repeatedly
          try {
            await NotificationLog.create({
              dedupKey: `${dedupKeyPrefix}:${recId}`,
              recipientId: recId,
              type,
              status: 'skipped',
              title,
              body,
              data,
            });
          } catch (e) {
            // Ignore duplicate key race
          }
          continue;
        }

        for (const token of tokens) {
          tokenToRecipientMap.set(token, recId);
          messages.push({
            to: token,
            sound: 'default',
            priority: 'high',
            channelId,
            title,
            body,
            data,
          });
        }
      }

      if (messages.length === 0) {
        return;
      }

      // 4. Send via Expo in chunks
      const chunks = chunkPushNotifications(messages);
      const invalidTokensToDeactivate: string[] = [];
      const ticketsToCheck: TicketCheckEntry[] = [];

      for (const chunk of chunks) {
        try {
          const tickets = await this.sendMessagesToExpo(chunk);

          for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            const msg = chunk[i];
            const token = typeof msg.to === 'string' ? msg.to : msg.to[0];
            const recipientId = tokenToRecipientMap.get(token) || 'unknown';
            const dedupKey = `${dedupKeyPrefix}:${recipientId}`;

            if (ticket.status === 'ok') {
              try {
                await NotificationLog.findOneAndUpdate(
                  { dedupKey },
                  {
                    dedupKey,
                    recipientId,
                    type,
                    status: 'sent',
                    title,
                    body,
                    data,
                    ticketId: ticket.id,
                    pushToken: token,
                    receiptStatus: 'pending',
                  },
                  { upsert: true }
                );
              } catch (logErr) {
                // Ignore dedup race
              }

              ticketsToCheck.push({ ticketId: ticket.id, token, dedupKey });
            } else if (ticket.status === 'error') {
              console.warn(
                `[PushNotificationService] Ticket error for token ${token}:`,
                ticket.message,
                ticket.details
              );

              // If token is invalid or unregistered, queue for deactivation
              if (
                ticket.details &&
                (ticket.details.error === 'DeviceNotRegistered' ||
                  ticket.details.error === 'InvalidCredentials')
              ) {
                invalidTokensToDeactivate.push(token);
              }

              try {
                await NotificationLog.findOneAndUpdate(
                  { dedupKey },
                  {
                    dedupKey,
                    recipientId,
                    type,
                    status: 'failed',
                    title,
                    body,
                    data,
                    pushToken: token,
                    receiptStatus: 'error',
                    receiptError: ticket.message || ticket.details?.error,
                    error: ticket.message || ticket.details?.error,
                  },
                  { upsert: true }
                );
              } catch (logErr) {
                // Ignore dedup race
              }
            }
          }
        } catch (chunkErr: any) {
          console.error('[PushNotificationService] Failed to send push chunk:', chunkErr?.message);
        }
      }

      // 5. Deactivate invalid tokens from initial ticket errors if any
      if (invalidTokensToDeactivate.length > 0) {
        await this.deactivateTokens(invalidTokensToDeactivate);
      }

      // 6. Schedule bounded deferred push receipt check for accepted tickets
      if (ticketsToCheck.length > 0) {
        this.scheduleReceiptCheck(ticketsToCheck);
      }
    } catch (err: any) {
      console.error('[PushNotificationService] Unexpected error sending notification:', err?.message);
      // NEVER throw out to caller
    }
  },

  /**
   * Helper: Format paise to rupee string
   */
  formatRupees(paise: number): string {
    return (paise / 100).toFixed(2);
  },

  /**
   * Event: Shared expense created -> notify eligible participants (excluding payer)
   */
  async notifyExpenseCreated(expense: IExpense, roomName: string, payerName?: string): Promise<void> {
    const recipients = expense.participants
      .filter((p) => p.userId !== expense.payerId && p.status === 'pending')
      .map((p) => p.userId);

    if (recipients.length === 0) return;

    const rupeeStr = this.formatRupees(expense.amountPaise);
    const title = roomName || 'Spendly';
    const payerLabel = payerName || 'A roommate';
    const expenseTitle = expense.title || 'Shared Expense';
    const body = `${payerLabel} added "${expenseTitle}" (₹${rupeeStr}). Review and acknowledge or reject this expense.`;

    await this.sendNotification({
      recipientIds: recipients,
      dedupKeyPrefix: `expense-created:${expense._id.toString()}:${expense.revision}`,
      type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
      title,
      body,
      data: {
        type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
        roomId: expense.roomId.toString(),
        expenseId: expense._id.toString(),
        revision: expense.revision,
      },
    });
  },

  /**
   * Event: Shared expense resubmitted -> notify eligible participants (excluding payer)
   */
  async notifyExpenseResubmitted(expense: IExpense, roomName: string, payerName?: string): Promise<void> {
    const recipients = expense.participants
      .filter((p) => p.userId !== expense.payerId && p.status === 'pending')
      .map((p) => p.userId);

    if (recipients.length === 0) return;

    const rupeeStr = this.formatRupees(expense.amountPaise);
    const title = roomName || 'Spendly';
    const payerLabel = payerName || 'A roommate';
    const expenseTitle = expense.title || 'Shared Expense';
    const body = `${payerLabel} updated and resubmitted "${expenseTitle}" (₹${rupeeStr}). Review and acknowledge or reject this expense.`;

    await this.sendNotification({
      recipientIds: recipients,
      dedupKeyPrefix: `expense-resubmitted:${expense._id.toString()}:${expense.revision}`,
      type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
      title,
      body,
      data: {
        type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
        roomId: expense.roomId.toString(),
        expenseId: expense._id.toString(),
        revision: expense.revision,
      },
    });
  },

  /**
   * Event: Expense rejected by participant or unanimously rejected -> notify payer
   */
  async notifyExpenseRejected(
    expense: IExpense,
    rejectorId: string,
    rejectorName: string,
    reason: string,
    roomName: string,
    isUnanimous: boolean
  ): Promise<void> {
    const title = roomName || 'Spendly';
    const expenseTitle = expense.title || 'Shared Expense';

    if (isUnanimous) {
      const body = `"${expenseTitle}" was unanimously rejected by all participants and closed. A 24-hour creation restriction has been applied.`;
      await this.sendNotification({
        recipientIds: [expense.payerId],
        dedupKeyPrefix: `expense-unanimously-rejected:${expense._id.toString()}`,
        type: 'EXPENSE_UNANIMOUSLY_REJECTED',
        title,
        body,
        data: {
          type: 'EXPENSE_UNANIMOUSLY_REJECTED',
          roomId: expense.roomId.toString(),
          expenseId: expense._id.toString(),
        },
      });
    } else {
      const rejectorLabel = rejectorName || 'A participant';
      const body = `${rejectorLabel} rejected "${expenseTitle}": "${reason}". Returned for correction.`;
      await this.sendNotification({
        recipientIds: [expense.payerId],
        dedupKeyPrefix: `expense-rejected:${expense._id.toString()}:${rejectorId}:${expense.revision}`,
        type: 'EXPENSE_REJECTED',
        title,
        body,
        data: {
          type: 'EXPENSE_REJECTED',
          roomId: expense.roomId.toString(),
          expenseId: expense._id.toString(),
          revision: expense.revision,
        },
      });
    }
  },

  /**
   * Event: Expense confirmed -> notify payer
   */
  async notifyExpenseConfirmed(expense: IExpense, roomName: string): Promise<void> {
    const title = roomName || 'Spendly';
    const expenseTitle = expense.title || 'Shared Expense';
    const rupeeStr = this.formatRupees(expense.amountPaise);
    const body = `All participants acknowledged "${expenseTitle}" (₹${rupeeStr}). Expense is now confirmed.`;

    await this.sendNotification({
      recipientIds: [expense.payerId],
      dedupKeyPrefix: `expense-confirmed:${expense._id.toString()}`,
      type: 'EXPENSE_CONFIRMED',
      title,
      body,
      data: {
        type: 'EXPENSE_CONFIRMED',
        roomId: expense.roomId.toString(),
        expenseId: expense._id.toString(),
      },
    });
  },

  /**
   * Event: Settlement requested -> notify receiver (recipient of payment)
   */
  async notifySettlementRequested(
    settlement: ISettlement,
    roomName: string,
    debtorName?: string
  ): Promise<void> {
    const title = roomName || 'Spendly';
    const rupeeStr = this.formatRupees(settlement.amountPaise);
    const debtorLabel = debtorName || 'A member';
    const body = `${debtorLabel} requested repayment verification of ₹${rupeeStr}. Please review and verify.`;

    await this.sendNotification({
      recipientIds: [settlement.receiverId],
      dedupKeyPrefix: `settlement-requested:${settlement._id.toString()}`,
      type: 'SETTLEMENT_REQUESTED',
      title,
      body,
      data: {
        type: 'SETTLEMENT_REQUESTED',
        roomId: settlement.roomId.toString(),
        settlementId: settlement._id.toString(),
      },
    });
  },

  /**
   * Event: Settlement verified -> notify debtor
   */
  async notifySettlementVerified(
    settlement: ISettlement,
    roomName: string,
    receiverName?: string
  ): Promise<void> {
    const title = roomName || 'Spendly';
    const rupeeStr = this.formatRupees(settlement.amountPaise);
    const receiverLabel = receiverName || 'The recipient';
    const body = `${receiverLabel} verified your payment of ₹${rupeeStr}. Balances have been updated.`;

    await this.sendNotification({
      recipientIds: [settlement.debtorId],
      dedupKeyPrefix: `settlement-verified:${settlement._id.toString()}`,
      type: 'SETTLEMENT_VERIFIED',
      title,
      body,
      data: {
        type: 'SETTLEMENT_VERIFIED',
        roomId: settlement.roomId.toString(),
        settlementId: settlement._id.toString(),
      },
    });
  },

  /**
   * Event: Settlement rejected -> notify debtor
   */
  async notifySettlementRejected(
    settlement: ISettlement,
    roomName: string,
    receiverName?: string,
    reason?: string
  ): Promise<void> {
    const title = roomName || 'Spendly';
    const rupeeStr = this.formatRupees(settlement.amountPaise);
    const receiverLabel = receiverName || 'The recipient';
    const reasonText = reason ? `: "${reason}"` : '';
    const body = `${receiverLabel} rejected your settlement of ₹${rupeeStr}${reasonText}. Outstanding debt remains unchanged.`;

    await this.sendNotification({
      recipientIds: [settlement.debtorId],
      dedupKeyPrefix: `settlement-rejected:${settlement._id.toString()}`,
      type: 'SETTLEMENT_REJECTED',
      title,
      body,
      data: {
        type: 'SETTLEMENT_REJECTED',
        roomId: settlement.roomId.toString(),
        settlementId: settlement._id.toString(),
      },
    });
  },

  /**
   * Event: Settlement cancelled -> notify receiver
   */
  async notifySettlementCancelled(
    settlement: ISettlement,
    roomName: string,
    debtorName?: string
  ): Promise<void> {
    const title = roomName || 'Spendly';
    const rupeeStr = this.formatRupees(settlement.amountPaise);
    const debtorLabel = debtorName || 'The debtor';
    const body = `${debtorLabel} cancelled their pending settlement request of ₹${rupeeStr}.`;

    await this.sendNotification({
      recipientIds: [settlement.receiverId],
      dedupKeyPrefix: `settlement-cancelled:${settlement._id.toString()}`,
      type: 'SETTLEMENT_CANCELLED',
      title,
      body,
      data: {
        type: 'SETTLEMENT_CANCELLED',
        roomId: settlement.roomId.toString(),
        settlementId: settlement._id.toString(),
      },
    });
  },

  /**
   * Event: Member joined room via invitation -> notify room admin
   */
  async notifyMemberJoined(
    roomId: string,
    roomName: string,
    adminId: string,
    memberName: string,
    memberId: string
  ): Promise<void> {
    if (adminId === memberId) return; // Admin joined own room

    const title = roomName || 'Spendly';
    const body = `${memberName || 'A new member'} accepted your invitation and joined ${roomName}.`;

    await this.sendNotification({
      recipientIds: [adminId],
      dedupKeyPrefix: `member-joined:${roomId}:${memberId}`,
      type: 'MEMBER_JOINED',
      title,
      body,
      data: {
        type: 'MEMBER_JOINED',
        roomId,
      },
    });
  },

  /**
   * Event: Member removed from room -> notify the removed member
   */
  async notifyMemberRemoved(roomId: string, roomName: string, removedUserId: string): Promise<void> {
    const title = roomName || 'Spendly';
    const body = `You were removed from ${roomName} by the room admin.`;

    await this.sendNotification({
      recipientIds: [removedUserId],
      dedupKeyPrefix: `member-removed:${roomId}:${removedUserId}`,
      type: 'MEMBER_REMOVED',
      title,
      body,
      data: {
        type: 'MEMBER_REMOVED',
        roomId,
      },
    });
  },
};
