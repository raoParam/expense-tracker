# API Contracts — V1

Base path: `/api/v1`. JSON over HTTPS. Exact schemas must be validated on the server and shared through TypeScript types where appropriate.

## 1. Response conventions
Success responses return the authoritative resource or result.
Errors should use a consistent shape:
```json
{
  "error": {
    "code": "EXPENSE_REVISION_CONFLICT",
    "message": "This expense has changed. Refresh and try again."
  }
}
```
Do not expose stack traces or internal database details to clients.

## 2. Auth (Firebase Authentication)
Authentication is handled via Firebase Authentication:
- **Client**: Authenticates via Firebase Client SDK (Email/Password) to obtain short-lived Firebase ID tokens (`user.getIdToken()`).
- **Request Header**: All protected API requests pass the ID token in the standard header:
  `Authorization: Bearer <firebase_id_token>`
- **Backend Middleware (`requireAuth`)**: Verifies token validity using Firebase Admin SDK and injects authenticated user profile (`uid`, `email`, `displayName`) into request context.

## 3. System
- `GET /api/v1/health` — System and service health check

## 4. Rooms
- `POST /rooms` — create room
- `GET /rooms` — list rooms for authenticated user
- `GET /rooms/:roomId` — fetch authorized room
- `PATCH /rooms/:roomId` — update permitted room metadata
- `POST /rooms/:roomId/invitations` — admin creates invitation
- `POST /invitations/:invitationId/accept` — authenticated invitee accepts
- `POST /rooms/:roomId/members/:userId/removal` — admin requests removal
- `POST /rooms/:roomId/archive` — archive under room lifecycle rules

## 5. Expenses
- `GET /rooms/:roomId/expenses` — paginated expense history
- `POST /rooms/:roomId/expenses` — create expense (requires idempotency key, minimum 2 distinct participants including payer, max ₹99,999,999.99)
- `GET /expenses/:expenseId` — fetch if caller is authorized
- `POST /expenses/:expenseId/acknowledge` — payload includes current revision
- `POST /expenses/:expenseId/reject` — payload includes current revision and mandatory reason
- `POST /expenses/:expenseId/resubmit` — payer submits corrected inputs and expected revision
- `POST /expenses/:expenseId/cancel` — payer explicitly cancels pending/resubmission-requested expense before confirmation

## 6. Balances
- `GET /rooms/:roomId/balances` — fresh authoritative net balances from confirmed expenses and verified settlements
- `GET /rooms/:roomId/suggested-settlements` — deterministic transfer projection generated from those exact balances; these transfers are also the only valid Settle Up requests
- `GET /rooms/:roomId/bilateral-debts` — deprecated compatibility alias for the same suggested transfers; no separate bilateral calculation is maintained

## 7. Settlements
- `GET /rooms/:roomId/settlements` — authorized settlement history
- `POST /rooms/:roomId/settlements` — create verification request for the authenticated debtor's current suggested transfer; idempotency key required
- `POST /settlements/:settlementId/verify` — receiver only; version/state validation
- `POST /settlements/:settlementId/reject` — receiver only; mandatory reason

## 8. Notifications
- `GET /notifications` — in-app notification list
- `POST /notifications/:notificationId/read` — mark read
- Shared-expense acknowledgement pushes use Expo category `expense_acknowledgement` and carry only:
  `type: EXPENSE_NEEDS_ACKNOWLEDGEMENT`, `roomId`, `expenseId`, and the server `revision`.
  The Android client may submit the existing acknowledge/reject endpoints directly from those actions;
  the payload is untrusted and never authorizes the mutation.
- Rejection actions provide a mandatory trimmed reason, 3–300 characters. The server revalidates the
  authenticated user, room membership, participant status, expense status, and expected revision.
- Duplicate acknowledgement actions are idempotent. A participant cannot transition twice in one
  revision; resubmission creates the next revision and resets eligible participants to pending.

## 9. API invariants
- Every route authenticates the caller where required via `Authorization: Bearer <token>`.
- Every room route checks membership and permission.
- Validate object IDs, amounts (integer paise up to 9,999,999,999), text lengths, split types, participant lists (minimum 2 participants), and status transitions.
- Ignore or reject client-supplied balance calculations; server recomputes.
- Use expected revision/version values for concurrent mutations.
- Use idempotency keys for create expense and settlement request.
- Shared mutations require connectivity and a successful server response.
