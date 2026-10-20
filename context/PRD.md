# Spendly — Product Requirements Document (PRD) — V1

## 1. Product vision
Build an Android-first application that combines private personal expense tracking with an acknowledgement-based shared ledger for hostels, PGs, roommates, and groups of friends.

Core promise: every shared expense has an identifiable payer, explicit allocation, participant acknowledgement, traceable history, and verifiable settlement.

## 2. Target users
- Students sharing hostel or PG expenses
- Roommates splitting groceries, meals, utilities, and supplies
- Friends who regularly spend together
- Small groups that need a transparent ledger without complex financial software

## 3. Product modules
### 3.1 Personal expense tracking
- Private expenses stored locally on the device in V1 using SQLite
- Create, list, edit, and delete personal expense records
- Categories, dates, descriptions, and monthly summaries
- Personal expenses never affect room balances
- No cloud synchronization or automatic cloud backup in V1; disclose local-data-loss risk

### 3.2 Rooms and groups
- Authenticated users can create rooms and invite members
- Only the room admin can invite or remove members
- Members can view authorized room ledger data
- Room admin is a membership-management role, not an accounting authority
- Invitees must authenticate and accept an invitation before accessing the room
- Preserve confirmed ledger history and outstanding balances when a member leaves or is removed
- Prefer archiving over deleting rooms with financial history or unsettled balances

### 3.3 Shared expenses
- Only the person who actually paid may create the expense; server enforces that authenticated creator is the recorded payer
- Shared expenses require at least two distinct participants, including the payer (the payer plus at least one other room member)
- Maximum expense amount is ₹99,999,999.99 (8 whole digits, up to 2 decimal places), stored in integer paise
- Split methods in V1: equal, custom amounts, percentages, quantity-based
- Creator's action counts as the creator's acknowledgement
- Every other selected participant must acknowledge
- Expense affects official balances only after all required participants acknowledge
- Participants can reject with a mandatory reason
- If rejected but not unanimously rejected, return to payer for correction; the payer may resubmit with corrected inputs (requiring fresh acknowledgements) or explicitly cancel the expense
- Pending expenses can be changed only under the rules in BUSINESS_RULES.md
- Confirmed expenses are immutable; corrections use explicit compensating/correction records rather than silent edits

### 3.4 Balances and settlements
- Calculate net balances from confirmed expenses and verified settlements
- Generate a directed graph in memory to calculate and suggest a low number of payments
- Graph is never persisted as source-of-truth data
- V1 settlements are atomic full canonical net-balance transfers; no partial payments
- Debtor requests settlement; recipient verifies or rejects
- Only verified settlement changes balances
- Settle Up actions use the same suggested transfers generated from room net balances

### 3.5 Abuse prevention
- If every other selected participant rejects an expense, the expense is unanimously rejected
- A unanimously rejected expense does not affect balances and is closed as rejected
- Apply a 24-hour room-expense-creation restriction to the creator across all rooms
- Enforce restriction on the server for all create-expense requests
- Preserve the rejected expense and rejection reasons in audit history
- Existing confirmed debts and settlement verification are not blocked by this restriction

### 3.6 Offline behaviour
- Personal expense tracking works locally
- Cached room data can be viewed offline
- Shared mutations (create expense, acknowledge, reject, membership changes, settlement actions) require connectivity in V1
- Do not queue shared mutations offline in V1

## 4. User roles and permissions
- User: manages own personal expenses and participates in rooms
- Room admin: can invite/remove members and archive room subject to retention rules
- Room member: can view room ledger, acknowledge own share, reject own request, and verify repayment only when they are the recipient
- Expense creator/payer: must be the authenticated user who actually paid
- Admin cannot acknowledge, reject, or verify financial actions on behalf of another member solely because they are admin

## 5. V1 split types
- Equal: distributed among participants, with remainder paise allocated in stable ascending user-ID order
- Custom amount: non-negative integer amounts in paise summing exactly to the total
- Percentage: at most 2 decimal places per percentage, summing strictly to 100.00%, remainder paise allocated in stable ascending user-ID order
- Quantity-based: integer quantities (> 0) and unit costs producing exact total

Validation:
- Maximum amount: ₹99,999,999.99 (max `9,999,999,999` paise)
- All shares sum exactly to the total amount in paise
- Percentages total exactly 100.00% with at most 2 decimal places
- Quantity inputs and unit costs are valid and produce the expense total
- Monetary calculations use integer paise, never binary floating point
- Rounding remainder paise are allocated deterministically in stable ascending user-ID order
- Payer's own share offsets the credit from paying; it is not debt owed to payer

## 6. Out of scope for V1
- Multiple currencies
- UPI/bank payment integration or payment gateway
- Receipt OCR and AI categorization
- Recurring expenses
- Cloud backup/sync for personal expenses
- Partial settlements
- Web and iOS apps
- Chat/social feed

## 7. MVP success criteria
- Personal expense CRUD works offline and is separate from room balances
- Shared expense does not affect balances before required acknowledgements
- Rejected expenses do not affect confirmed balances
- Unanimous rejection triggers the 24-hour creator restriction
- Net balances and suggested settlement amounts are correct
- Settlements change balances only after recipient verification
- Room access and mutation permissions are enforced by backend
- Duplicate/retried requests cannot duplicate financial effects
- App runs on supported Android devices and can be built through EAS Build
