# Design System — V1

## 1. Visual direction
Create a credible, restrained Android product for everyday hostel/PG use. It should feel practical, clear, and trustworthy—not like a flashy AI-generated concept.

Avoid:
- AI-style multicolor gradients
- glassmorphism
- excessive shadows, blur, glow, or decorative blobs
- excessive rounded cards for every element
- fake charts, fake metrics, or fabricated activity
- decorative illustrations that obscure core tasks

## 2. Principles
- Prioritize readability and quick data entry.
- Make personal and shared expenses visibly distinct.
- Amounts, balances, status, and required actions should be immediately understandable.
- Use consistent spacing, typography, iconography, and touch targets.
- Support narrow Android screens and system font scaling.
- Use accessible contrast and do not communicate state through color alone.
- Use loading, empty, error, offline, and disabled states intentionally.
- Avoid showing a shared mutation as successful before the server confirms it.

## 3. Suggested color direction
Use a neutral light/dark surface system with one restrained primary accent and semantic colors for success, warning, and error. Define tokens centrally; do not hardcode arbitrary colors across screens. Select exact values during implementation and verify contrast.

## 4. Typography and spacing
- Use platform-friendly sans-serif typography.
- Establish a small type scale for screen titles, section titles, body, labels, and captions.
- Use a consistent spacing scale (for example 4, 8, 12, 16, 24, 32 dp).
- Use touch targets appropriate for Android accessibility.
- Keep form labels visible; don't rely solely on placeholders.

## 5. Navigation
Proposed bottom navigation:
- Home
- Personal
- Rooms
- Activity/Profile (final grouping may be refined after screen flow)

Use Expo Router and keep route names stable and understandable.

## 6. Core screens
### Home
- Overall personal summary
- Pending room actions
- Room balance summary only from server/cached server data
- Clear shortcuts to add personal expense and open rooms

### Personal expenses
- Expense list, category, amount, date
- Add/edit form
- Filter/search only if it fits MVP
- Empty state that encourages first entry without fake sample transactions

### Rooms
- Room list and create/join flow
- Room detail with balances, expenses, settlements, members
- Pending acknowledgements visibly prioritized

### Add shared expense
- Title optional (max 30 chars)
- Description max 300 chars
- Amount
- Participants
- Split type selector
- Split editor appropriate to selected type
- Live split validation and total reconciliation
- Clear submit/confirmation state

### Expense detail
- Payer, total, participants and shares
- Revision/status
- Per-person acknowledgement state
- Rejection reasons
- Audit history appropriate to user permissions

### Settlement
- Current bilateral debt
- Mark paid/request verification
- Recipient verify/reject actions
- Clearly distinguish requested vs verified

## 7. Component patterns
Create reusable components only when useful:
- AmountText
- FormField
- PrimaryButton / SecondaryButton
- StatusBadge
- EmptyState
- ErrorState
- LoadingState
- MemberAvatar
- ExpenseRow
- BalanceSummary
- SplitEditor
- ConfirmationDialog

Avoid premature component abstraction.

## 8. First milestone UI scope
Only build the design system foundation, navigation shell, home placeholder with no fabricated values, and personal expense list/form. Do not design every room screen in Milestone 1.
