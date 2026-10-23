export type SharedExpenseStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type ParticipantResponseStatus = 'pending' | 'acknowledged' | 'rejected';

export interface ExpenseParticipationInput {
  payerId: string;
  participants: Array<{ userId: string; sharePaise: number; status: ParticipantResponseStatus }>;
  status: SharedExpenseStatus;
}

export interface ExpenseParticipationPresentation {
  kind: 'payer' | 'participant' | 'not-involved';
  involvementLabel: string;
  responseLabel?: string;
  sharePaise?: number;
}

export function getSharedExpenseParticipation(
  expense: ExpenseParticipationInput,
  userId: string | undefined
): ExpenseParticipationPresentation {
  if (!userId) return { kind: 'not-involved', involvementLabel: 'Not involved' };
  if (expense.payerId === userId) {
    return { kind: 'payer', involvementLabel: 'Paid by you' };
  }

  const participant = expense.participants.find((entry) => entry.userId === userId);
  if (!participant) return { kind: 'not-involved', involvementLabel: 'Not involved' };

  let responseLabel: string | undefined;
  if (expense.status === 'pending') {
    responseLabel =
      participant.status === 'pending'
        ? 'Your acknowledgement pending'
        : participant.status === 'acknowledged'
          ? 'You acknowledged'
          : 'You rejected';
  }

  return {
    kind: 'participant',
    involvementLabel: `Your share: ₹${(participant.sharePaise / 100).toFixed(2)}`,
    responseLabel,
    sharePaise: participant.sharePaise,
  };
}
