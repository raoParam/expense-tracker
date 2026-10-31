# Data Model — V1

This document describes logical data contracts. Exact Mongoose schemas and indexes are implemented in the API project.

## 1. User
- `id`
- `displayName` (max 32 characters)
- verified identity/provider reference
- `createdAt`
- account status

Avoid copying mutable display names into authoritative payer identity fields; reference stable user IDs. For historical display, store an explicit snapshot only if product requirements call for it.

## 2. Room
- `id`
- `name`
- `adminId`
- `memberIds` or membership subdocuments
- `status`: active/archived
- `createdAt`, `updatedAt`

Use a membership model that can preserve historical membership when required.

## 3. Invitation
- `id`
- `roomId`
- inviter user ID
- invite token hash/code hash
- expiration
- status: pending/accepted/expired/revoked
- invited identity if applicable
- timestamps

Never store a reusable raw secret invitation token if a hash can be used.

## 4. Expense
- `id`
- `roomId`
- `payerId`
- `title` optional, max 30 chars
- `description` max 300 chars
- `amountPaise` integer (max `9,999,999,999` paise corresponding to ₹99,999,999.99)
- `currency`: INR
- `splitType`: equal/custom/percentage/quantity
- original split inputs
- calculated shares: user ID, amountPaise (minimum 2 distinct participants including payer)
- status: pending/rejected/confirmed/cancelled
- revision number
- per-participant acknowledgement/rejection state
- creation and transition timestamps
- idempotency key/reference as appropriate

Validate the user-facing rupee limit (maximum 8 whole digits, up to 2 decimal places) before converting to integer paise.

## 5. Expense revision and audit
Preserve revisions or append audit events when a pending expense is corrected and resubmitted. Do not overwrite the history of a previously submitted revision.
For confirmed expenses, use immutable records plus explicit linked correction/reversal records if needed.

## 6. Settlement
- `id`
- `roomId`
- debtor/payer ID
- receiver ID
- amountPaise integer (max `9,999,999,999` paise)
- status: pending/verified/rejected/cancelled
- request/verification/rejection timestamps
- idempotency key/reference
- optional relation to suggested debt/payment plan (not required to tie a payment to one expense)

## 7. Settlement graph
- Every room has one persistent `SettlementGraph` stored in MongoDB (`roomId` unique index).
- `vertices` represent room members using stable user IDs.
- `edges` represent directed payments: debtor -> creditor, with stable `edgeId` and integer-paise `amountPaise`.
- When a room is created, its graph is initialized with all room members as vertices and an empty edges array.
- A new shared expense becoming `confirmed` is the ONLY event that recalculates or optimizes the graph.
- When a settlement is verified, only its matching edge's `amountPaise` is set to 0. The edge is not deleted, other edges are unchanged, and the optimizer is never called.
- No parallel settlement plan systems or graph versions are maintained.

A settlement records an actual repayment claim and its verification, not a graph edge.

## 7. User restriction
- `userId`
- `expenseCreationBlockedUntil`
- reason
- triggering expense ID
- createdAt

Store timestamps in UTC and calculate the 24-hour expiry from trusted server time (`expenseCreationBlockedUntil = now + 24 hours`).

## 8. Audit event
- event ID
- actor user ID
- room ID
- entity type and ID
- action
- timestamp
- minimal metadata needed for accountability

Do not place secrets or sensitive authentication data in audit metadata.

## 9. Personal expense (SQLite only in V1)
- local ID
- title/description fields as defined by UI
- amountPaise integer (max `9,999,999,999` paise, validated up to ₹99,999,999.99)
- category ID
- expense date
- createdAt/updatedAt
- optional notes
- deleted state only if needed for local undo; permanent delete is allowed under V1 product policy

No cloud sync in V1. Document device-loss/app-data-erasure risk in product UI or onboarding.

## 10. Indexes and constraints
Design indexes for:
- room membership lookups
- expenses by room and creation time
- expenses by room/status
- settlements by room/status
- restriction lookup by user ID
- unique idempotency keys within an appropriate user/operation scope
- invitation token hashes

Do not rely on indexes alone for authorization or business rules.
