import {
  ACKNOWLEDGE_EXPENSE_ACTION,
  EXPENSE_ACKNOWLEDGEMENT_NOTIFICATION_TYPE,
  REJECT_EXPENSE_ACTION,
  isValidRejectionReason,
  parseExpenseNotificationActionResponse,
} from '../src/services/notification-actions';

function response(actionIdentifier: string, userText?: string) {
  return {
    actionIdentifier,
    userText,
    notification: {
      request: {
        identifier: 'notification-1',
        content: {
          data: {
            type: EXPENSE_ACKNOWLEDGEMENT_NOTIFICATION_TYPE,
            expenseId: 'expense-1',
            roomId: 'room-1',
            revision: 3,
          },
        },
      },
    },
  };
}

describe('expense notification actions', () => {
  test('parses acknowledgement using server revision from the payload', () => {
    expect(parseExpenseNotificationActionResponse(response(ACKNOWLEDGE_EXPENSE_ACTION))).toEqual({
      action: 'acknowledge',
      expenseId: 'expense-1',
      roomId: 'room-1',
      expectedRevision: 3,
      responseKey: 'notification-1:expense_acknowledge',
    });
  });

  test('trims valid rejection input and preserves the mandatory reason', () => {
    expect(parseExpenseNotificationActionResponse(response(REJECT_EXPENSE_ACTION, '  Wrong split  '))).toMatchObject({
      action: 'reject',
      reason: 'Wrong split',
      expectedRevision: 3,
    });
    expect(isValidRejectionReason('  abc  ')).toBe(true);
  });

  test('does not treat blank, short, or oversized reason as a successful rejection payload', () => {
    expect(parseExpenseNotificationActionResponse(response(REJECT_EXPENSE_ACTION, '  '))?.reason).toBeUndefined();
    expect(isValidRejectionReason('  ')).toBe(false);
    expect(isValidRejectionReason('x'.repeat(301))).toBe(false);
  });

  test('rejects stale or unrelated notification payload shapes before calling an API', () => {
    expect(parseExpenseNotificationActionResponse(response('other-action'))).toBeNull();
    expect(
      parseExpenseNotificationActionResponse({
        ...response(ACKNOWLEDGE_EXPENSE_ACTION),
        notification: { request: { content: { data: { expenseId: 'expense-1' } } } },
      })
    ).toBeNull();
  });
});
