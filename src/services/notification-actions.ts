export const EXPENSE_ACKNOWLEDGEMENT_NOTIFICATION_TYPE = 'EXPENSE_NEEDS_ACKNOWLEDGEMENT';
export const EXPENSE_ACKNOWLEDGEMENT_CATEGORY_ID = 'expense_acknowledgement';
export const ACKNOWLEDGE_EXPENSE_ACTION = 'expense_acknowledge';
export const REJECT_EXPENSE_ACTION = 'expense_reject';
export const MAX_REJECTION_REASON_LENGTH = 300;

export interface ExpenseNotificationActionResponse {
  action: 'acknowledge' | 'reject';
  expenseId: string;
  roomId?: string;
  expectedRevision: number;
  reason?: string;
  responseKey: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseExpenseNotificationActionResponse(response: unknown):
  | ExpenseNotificationActionResponse
  | null {
  if (!isRecord(response)) return null;
  const actionIdentifier = response.actionIdentifier;
  const action =
    actionIdentifier === ACKNOWLEDGE_EXPENSE_ACTION
      ? 'acknowledge'
      : actionIdentifier === REJECT_EXPENSE_ACTION
        ? 'reject'
        : null;
  if (!action) return null;

  const notification = isRecord(response.notification) ? response.notification : null;
  const request = notification && isRecord(notification.request) ? notification.request : null;
  const content = request && isRecord(request.content) ? request.content : null;
  const data = content && isRecord(content.data) ? content.data : null;
  if (!data || data.type !== EXPENSE_ACKNOWLEDGEMENT_NOTIFICATION_TYPE) return null;

  const expenseId = cleanId(data.expenseId);
  const roomId = cleanId(data.roomId);
  const revision = Number(data.revision);
  if (!expenseId || !Number.isInteger(revision) || revision < 1) return null;

  const notificationId = cleanId(request?.identifier) || expenseId;
  if (action === 'acknowledge') {
    return {
      action,
      expenseId,
      roomId,
      expectedRevision: revision,
      responseKey: `${notificationId}:${actionIdentifier}`,
    };
  }

  const rawReason = typeof response.userText === 'string' ? response.userText.trim() : '';
  if (rawReason.length < 3 || rawReason.length > MAX_REJECTION_REASON_LENGTH) {
    return {
      action,
      expenseId,
      roomId,
      expectedRevision: revision,
      reason: undefined,
      responseKey: `${notificationId}:${actionIdentifier}`,
    };
  }

  return {
    action,
    expenseId,
    roomId,
    expectedRevision: revision,
    reason: rawReason,
    responseKey: `${notificationId}:${actionIdentifier}`,
  };
}

export function isValidRejectionReason(reason: unknown): reason is string {
  return (
    typeof reason === 'string' &&
    reason.trim().length >= 3 &&
    reason.trim().length <= MAX_REJECTION_REASON_LENGTH
  );
}
