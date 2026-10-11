# Test Plan — V1

## 1. Testing approach
- Unit tests for split and balance calculations
- Unit tests for local personal-expense validation/repository
- API integration tests for authorization and state transitions
- Multi-user integration tests for acknowledgement and settlement
- Manual physical Android device checks
- Type checking and linting at every milestone

Use a lightweight test setup compatible with the chosen Expo and Node/TypeScript versions. Do not add multiple overlapping test frameworks without a reason.

## 2. Split tests
- Equal split where total divides evenly
- Equal split with remainder paise allocated in stable ascending user-ID order
- Custom split exact total
- Custom split with under/over allocation rejected
- Percentage split with at most 2 decimal places per percentage summing to exactly 100.00%
- Percentage split with > 2 decimal places or non-100% sum rejected
- Percentage rounding remainder allocated deterministically in stable ascending user-ID order
- Quantity split validates unit cost and quantities, producing exact total
- All shares sum exactly to total in paise
- Maximum amount boundary test: ₹99,999,999.99 (9,999,999,999 paise) accepted; > ₹99,999,999.99 or > 2 decimal places rejected
- Invalid, negative, zero, NaN, infinite, and oversized amounts rejected
- Shared expense with fewer than 2 distinct participants (payer + at least 1 other) rejected

## 3. Expense workflow tests
- Creator is automatically acknowledged
- Other participants must acknowledge
- Expense stays pending until all required participants acknowledge
- Confirmed expense contributes to balances once
- Rejected expense never contributes to balances
- Partial rejection returns expense to payer for correction
- Payer can resubmit with corrected inputs (creates new revision and resets acknowledgements)
- Payer can explicitly cancel a pending/resubmission-requested expense
- Acknowledgement against stale revision rejected
- Unanimous rejection closes expense and applies 24-hour restriction across all rooms
- Restriction applies across all rooms for new room expense creation
- Restriction does not block existing settlement verification or viewing data
- Duplicate create request with same idempotency key does not duplicate expense
- Confirmed record cannot be silently edited/deleted

## 4. Balance tests
Sign convention: positive means the user should receive money; negative means they owe money.
- Expense adds total credit to payer and debits each participant's allocated share
- Sum of all room balances is strictly zero ($\sum \text{balance} = 0$)
- Reverse debts net correctly between participant pairs
- Verified settlement increases debtor balance towards zero and decreases receiver receivable towards zero
- Rejected/pending settlement has no balance effect
- Suggested transfers conserve money and settle all balances
- Cases with multiple creditors/debtors and multiple valid solutions
- No graph edge is persisted as a financial source-of-truth record

## 5. Authorization tests
- Non-member cannot read room data
- Non-admin cannot invite/remove members
- User cannot acknowledge/reject another user's share
- Only receiver can verify/reject settlement
- Creator cannot create an expense on behalf of another payer
- Client-supplied balances are ignored/rejected
- Cross-room object ID access is denied
- Restricted user cannot create room expenses

## 6. Local personal expense tests
- CRUD works offline using SQLite
- Records survive app restart
- Personal records never affect room balances
- Rupee limit (₹99,999,999.99) and excessive text lengths are validated and rejected
- Deleting app data/device-loss limitation is documented in the UI
