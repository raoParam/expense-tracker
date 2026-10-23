import { getSharedExpenseParticipation } from '../src/domain/shared-expense-presentation';

const expense = {
  payerId: 'payer-1',
  status: 'pending' as const,
  participants: [
    { userId: 'payer-1', sharePaise: 5000, status: 'acknowledged' as const },
    { userId: 'member-1', sharePaise: 2500, status: 'pending' as const },
    { userId: 'member-2', sharePaise: 2500, status: 'rejected' as const },
  ],
};

describe('shared expense participation presentation', () => {
  test('uses stable payer ID and excludes payer from participant share messaging', () => {
    expect(getSharedExpenseParticipation(expense, 'payer-1')).toEqual({
      kind: 'payer',
      involvementLabel: 'Paid by you',
    });
  });

  test('shows a participant share and acknowledgement state', () => {
    expect(getSharedExpenseParticipation(expense, 'member-1')).toEqual({
      kind: 'participant',
      involvementLabel: 'Your share: ₹25.00',
      responseLabel: 'Your acknowledgement pending',
      sharePaise: 2500,
    });
    expect(getSharedExpenseParticipation(expense, 'member-2').responseLabel).toBe('You rejected');
  });

  test('does not infer involvement from room membership', () => {
    expect(getSharedExpenseParticipation(expense, 'room-member-not-selected')).toEqual({
      kind: 'not-involved',
      involvementLabel: 'Not involved',
    });
  });

  test('keeps terminal expense status separate from participant response status', () => {
    expect(
      getSharedExpenseParticipation({ ...expense, status: 'confirmed' }, 'member-1')
    ).toMatchObject({
      involvementLabel: 'Your share: ₹25.00',
      responseLabel: undefined,
    });
    expect(
      getSharedExpenseParticipation({ ...expense, status: 'cancelled' }, 'member-2')
    ).toMatchObject({
      involvementLabel: 'Your share: ₹25.00',
      responseLabel: undefined,
    });
  });
});
