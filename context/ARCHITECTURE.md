# Technical Architecture — V1

## 1. Architecture style
Use a modular monolith. Do not introduce microservices for V1.

## 2. Stack
- Mobile: React Native + Expo + TypeScript
- Navigation: Expo Router
- Local personal database: Expo SQLite
- Backend: Node.js + Express + TypeScript
- Shared database: MongoDB Atlas + Mongoose
- Identity & Authentication: Firebase Authentication (Free Tier)
  - Mobile client: Firebase Client SDK
  - Backend: Firebase Admin SDK for ID token verification
- API: versioned REST over HTTPS (`/api/v1`)
- Notifications: Expo Push Notifications after core ledger flows are stable
- Android builds: EAS Build
- Testing: TypeScript checks, unit tests, API integration tests

Before installing packages, inspect current package versions and choose mutually compatible stable releases. Keep dependencies minimal.

## 3. System boundaries
### Mobile app
Responsibilities:
- UI and navigation
- Local personal expense CRUD in SQLite
- Firebase Client SDK authentication and token management
- Read-only cache of authorized room data
- API calls for shared mutations with `Authorization: Bearer <firebase_id_token>`
- Display server-calculated balances and settlement suggestions
- Store auth credentials only using appropriate secure storage

Not authoritative for:
- Room permissions
- Expense confirmation
- User restrictions
- Settlement verification
- Shared balances

### Backend
Responsibilities:
- Authentication verification via Firebase Admin SDK
- Authorization and membership checks
- Validation and split calculation
- Expense state transitions and acknowledgement logic
- 24-hour restriction enforcement
- Settlement validation and verification
- Balance calculation from persisted records
- Audit events and notification triggers

### MongoDB
Persists:
- Users/profile references as needed
- Rooms and membership
- Invitations
- Expense records and revisions
- Settlement records
- User restrictions
- Audit events
- Notification records if needed

### SQLite
Persists:
- Personal expenses and categories
- Local-only preferences
- Cached room read data if required

## 4. Request lifecycle
1. Mobile sends authenticated HTTPS request with `Authorization: Bearer <firebase_id_token>`.
2. API authenticates caller using Firebase Admin SDK.
3. Middleware validates request schema.
4. Module checks authorization and current state.
5. Backend calculates/validates business rules.
6. Database mutation occurs with appropriate transaction/concurrency protection.
7. Audit event is recorded.
8. API returns authoritative state.
9. Client refreshes displayed data.

## 5. Database consistency
Critical operations include:
- Confirming expense after final acknowledgement
- Recording unanimous rejection and applying restriction
- Verifying settlement
- Removing room member while preserving ledger consistency

Use MongoDB transactions if deployment and configuration support them. Verify Atlas tier and transaction support before depending on them. Where transactions are unavailable, design explicit atomic document updates, unique constraints, idempotency, and recovery logic; do not pretend multi-document atomicity exists.

## Update release notes
Expo Updates `updateId` is the installed JavaScript bundle identity; app version/runtime alone is
not sufficient because multiple OTA updates can share both. Structured release-note items are
identified by stable IDs in update metadata. The mobile client persists delivered IDs and stages
the target update ID before reload; IDs are delivered only when that target update is observed
running after reload. A bundle carrying structured note metadata establishes its own explicit
baseline. No delivery is inferred from opening or dismissing an update dialog.

## 6. Authentication (Finalized: Firebase Authentication)
- **Identity Provider**: Firebase Authentication (Spark Free Plan).
- **Client Flow**: The mobile app interacts directly with Firebase to register, sign in, manage sessions, and obtain short-lived Firebase ID tokens (`user.getIdToken()`).
- **Backend Verification**: The backend verifies tokens server-side using the Firebase Admin SDK (`requireAuth` middleware) and extracts `uid`, `email`, and `displayName`.
- **Security Invariant**: Passwords and raw secrets never touch the application backend. Authorization is enforced strictly by backend middleware and module logic, not client UI state.

## 7. Offline
- Personal expense CRUD works offline using SQLite.
- Room data can be displayed from cache while offline, clearly marked as potentially stale.
- All shared mutations require a successful server response.
- No offline queue for shared mutations in V1.

## 8. Notifications
Do not block core product delivery on push notifications. First implement reliable state transitions and an in-app pending-actions view. Add push notifications after the core shared ledger passes integration tests.

## 9. Lightweight development
- Do not require Android Studio emulator.
- Use a physical Android device.
- Prefer cloud builds for installable APKs.
- Avoid running MongoDB locally; use Atlas.
- Avoid unnecessary background services and large local dependencies.
