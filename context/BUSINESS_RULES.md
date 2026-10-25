# Business Rules — Authoritative V1 Rules

This document is authoritative for expense, acknowledgement, balance, settlement, and abuse-prevention behaviour.

## 1. Money
- Currency in V1 is INR only.
- Store money as integer paise.
- User-facing rupee amount limit: maximum ₹99,999,999.99 (8 digits in whole rupees, allowing up to two decimal places).
- Validate the limit in rupees before converting to integer paise (maximum `9,999,999,999` paise).
- Never use floating-point arithmetic for money calculations or storage.
- All allocated shares must sum exactly to the expense total in paise.
- Remainder paise distribution: When splitting amounts that produce remainder paise, allocate +1 paisa to participants in stable ascending user-ID order until the remainder is exhausted.

## 2. Expense creator and payer
- Only the person who actually paid can create a shared expense.
- The backend enforces that the authenticated creator is the recorded `payerId`.
- The creator's creation action counts as their acknowledgement.
- Shared expenses require at least two distinct participants, including the payer (the payer plus at least one other room member).
- Every other selected participant must acknowledge before the expense confirms.
- The payer's own allocated share offsets their credit from paying; it is not a debt owed to the payer.

## 3. Expense lifecycle
Statuses:
- `pending`
- `rejected`
- `confirmed`
- `cancelled`

Rules:
1. Expense is created as `pending`.
2. Creator is considered acknowledged at creation.
3. Other selected participants can acknowledge or reject (with a mandatory reason for rejection).
4. Confirm only when all required participants have acknowledged the same revision.
5. A rejected expense never affects balances.
6. If at least one participant rejects but not all other participants reject, the expense is marked for correction and returned to the payer. The payer may either:
   - Resubmit with corrected split inputs/participants (creates a new revision and requires fresh acknowledgements from all other selected participants), or
   - Explicitly cancel the expense (transitions to `cancelled` status, permanently closed with audit log).
7. If every other selected participant rejects, treat it as unanimous rejection, close the expense as `rejected`, preserve the rejection reasons and audit trail, and apply the 24-hour creator restriction below.
8. Confirmed expenses are immutable. Any later correction must be represented through explicit correction/reversal records or a new linked expense, never silent mutation.
9. Pending participant removal or split changes must invalidate affected acknowledgements. Do not change a pending revision after acknowledgement without resetting acknowledgements.

## 4. Unanimous rejection and restriction
- "Unanimous rejection" occurs when every other selected participant has rejected the expense. The creator is excluded from the rejection count because creation is their implicit acknowledgement.
- When unanimous rejection occurs:
  - Close the expense as `rejected`.
  - Apply a 24-hour room-expense-creation restriction to the creator across all rooms.
- Restriction is stored and enforced server-side using a trusted server timestamp (`expenseCreationBlockedUntil = now + 24 hours`).
- The restriction blocks creation of new room expenses only. It does not block reading data, acknowledging existing expenses, requesting settlements, or verifying repayments.
- Preserve all rejection reasons and audit events for accountability.
- A creator cannot bypass the restriction by switching rooms, creating a new expense, or resubmitting the rejected expense.
- Do not impose permanent account bans based solely on a single unanimous rejection event.
- Shared expenses enforce a minimum of two participants (payer + at least one other member), guaranteeing that unanimous rejection is always evaluated by at least one other peer.

## 5. Split methods
- `equal`: Distribute the total amount among selected participants. Allocate remainder paise by giving +1 paisa to participants in stable ascending user-ID order until the remainder is exhausted.
- `custom`: User supplies each participant's amount in paise; amounts must be non-negative integers and sum exactly to the expense total.
- `percentage`: Percentages allow at most two decimal places per participant (e.g., `33.33%`, `33.33%`, `33.34%`) and must sum to exactly `100.00%`. Calculated paise shares use rational arithmetic with remainder paise allocated in stable ascending user-ID order.
- `quantity`: Each participant has an integer quantity (> 0) and unit price; itemized totals must reconcile exactly to the expense total. Remainder paise (if any) are distributed in stable ascending user-ID order.
- Store both original split inputs and calculated paise shares for auditability and verification.

## 6. Membership and rooms
- Only the room admin can invite or remove members.
- Invitations require authenticated acceptance before access is granted.
- A room admin cannot confirm expenses or settlements for another person solely by being admin.
- Removing a member must not erase confirmed expenses, settlement records, or outstanding debts.
- If a member has unresolved pending expenses, require the admin to resolve or cancel those pending items before removal.
- If the admin leaves, transfer the admin role before departure.
- Do not permanently delete a room with confirmed financial history or outstanding debts; archive it instead.

## 7. Settlement
- V1 settlement is atomic and matches one current canonical suggested transfer; no partial settlement.
- Debtor requests repayment verification after transferring funds.
- Only the named receiver can verify or reject the repayment request.
- Only verified settlements change balances.
- Rejected settlements leave the debt unchanged and record the rejection reason.
- The authenticated debtor must be the transfer sender, the receiver must be an active room member, and the amount must match the current net-balance transfer when created and verified.
- Use idempotency keys and concurrency controls so repeated requests or concurrent verification cannot settle twice.
- Preserve full settlement history for auditing.

## 8. Balance calculation
### Sign Convention
- **Positive balance (`> 0`)**: The user is a net creditor and should receive money.
- **Negative balance (`< 0`)**: The user is a net debtor and owes money.
- **Zero balance (`0`)**: All debts and credits are settled.

### Authoritative Balance Formula
For any user $u$ in a given room, their net balance in paise is calculated strictly from confirmed expenses and verified settlements:

$$\text{balance}[u] = \sum_{e \in E_{\text{confirmed}}} \text{Paid}[u, e] - \sum_{e \in E_{\text{confirmed}}} \text{Share}[u, e] + \sum_{s \in S_{\text{verified}}} \text{SettlementPaid}[u, s] - \sum_{s \in S_{\text{verified}}} \text{SettlementReceived}[u, s]$$

Where:
- $\text{Paid}[u, e]$: Total amount paid by user $u$ for confirmed expense $e$ (if $u$ is payer, $\text{totalAmount}$; otherwise $0$).
- $\text{Share}[u, e]$: Allocated share in paise for user $u$ on confirmed expense $e$.
- $\text{SettlementPaid}[u, s]$: Amount in paise paid by user $u$ as debtor in verified settlement $s$ (increases user balance towards zero).
- $\text{SettlementReceived}[u, s]$: Amount in paise received by user $u$ as creditor in verified settlement $s$ (decreases user receivable towards zero).

### Key Invariants
1. **Conservation of Money**: The sum of all member balances in any room must strictly equal zero:
   $$\sum_{u \in \text{Room}} \text{balance}[u] = 0$$
2. **Canonical Transfers**: The directed transfer projection is generated dynamically in memory from these net balances. It is used for suggestions and settlement authorization; it is never persisted as a source-of-truth debt record.
3. **Historical Settlements**: Existing verified settlement records are interpreted as actual debtor-to-receiver payments under this formula. The system does not infer or rewrite their original expense pairing.
4. **Transfer Conservation**: Suggested transfers must conserve money and completely settle all net balances.

## 9. Offline and local data
- Personal expenses are local-only in V1, stored on the device using SQLite.
- Cached room data is read-only offline, clearly marked as potentially stale.
- Shared mutations require network connectivity and server confirmation.
- Never optimistically display a shared mutation as confirmed before server acceptance.
- Inform users that local personal data can be lost if app data is erased or the device is lost.

## 10. API and security invariants
- Backend is authoritative for shared data and permissions.
- Validate authorization, room membership, participant membership, amounts, split inputs, status transitions, and creator restrictions on the server.
- Do not trust client-supplied balances or calculated share amounts without server recomputation.
- Use idempotency keys for create-expense and settlement-request operations.
- Use revision/version checks for acknowledgement, resubmission, and settlement verification.
- Preserve append-only audit events for all financial state transitions.
