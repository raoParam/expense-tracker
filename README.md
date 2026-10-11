# Spendly — Mobile Application

Android-first expense management application for hostel/PG residents and roommate groups.

This repository implements **Milestones M1 (Personal Expense Tracker)** and **M2 (Backend Foundation & Firebase Authentication)**.

---

## Requirements & Prerequisites

- **Node.js**: `v18.0.0` or higher (`v20+` or `v24+` recommended)
- **npm**: `v9.0.0` or higher
- **Android Device**: Physical Android smartphone running Android 8.0+
- **Expo Go App**: Install [Expo Go from the Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) on your physical Android phone.

> **Note on Environment:** Development is optimized for low-resource hardware (e.g. Pentium Gold CPU, 4 GB RAM). Android Studio and local emulators are intentionally avoided. Use Expo Go on your physical phone.

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests & Type Checks
```bash
# Run unit and integration tests
npm test

# Run TypeScript strict typecheck
npm run typecheck
```

### 3. Start Expo Development Server
```bash
npm start
```

---

## Running on a Physical Android Device

### Option A: Local Wi-Fi (LAN) — Recommended
1. Connect your **computer** and your **Android smartphone** to the **same Wi-Fi network**.
2. Run:
   ```bash
   npm start
   ```
3. A QR code and local Metro URL (e.g. `exp://192.168.1.x:8081`) will appear in your terminal.
4. Open the **Expo Go** app on your Android phone and scan the QR code (or tap **"Scan QR code"** inside Expo Go).
5. The JavaScript bundle will download and the application will start automatically.

### Option B: Cloud Tunnel (If LAN / Wi-Fi fails)
If your hostel/PG Wi-Fi has client isolation enabled (preventing phone from reaching laptop IP):
1. Start Expo in tunnel mode:
   ```bash
   npx expo start --tunnel
   ```
2. Scan the generated tunnel QR code using Expo Go.

---

## Architecture & Features in Milestone M1

- **Framework**: React Native + Expo (SDK 52) + TypeScript in strict mode
- **Navigation**: Expo Router (file-based tabs and stack navigation)
- **Local Persistence**: Expo SQLite (`hostel_expense.db`) with migration runner
- **Accounting Engine**:
  - Strict integer paise money representation (1 INR = 100 paise)
  - Maximum limit: ₹99,999,999.99 (9,999,999,999 paise)
  - Strict 2-decimal validation (prevents binary floating-point inaccuracy)
  - Indian currency formatting (`₹1,23,456.78`)
- **Features**:
  - Personal Expense CRUD (Create, Read, Edit, Delete with modal confirmation)
  - Home Dashboard with monthly spending summary and category breakdown
  - Expense list with search, category filtering, and date sorting
  - Offline-first local SQLite storage

---

## Specification Documents

All architectural designs, PRD, business rules, and API specifications are located in the [`context/`](./context/) directory:

- [`context/PRD.md`](./context/PRD.md) — Product Requirements Document
- [`context/BUSINESS_RULES.md`](./context/BUSINESS_RULES.md) — Authoritative Financial & Lifecycle Rules
- [`context/ARCHITECTURE.md`](./context/ARCHITECTURE.md) — System Architecture
- [`context/DATA_MODEL.md`](./context/DATA_MODEL.md) — Entity Schemas
- [`context/API_CONTRACTS.md`](./context/API_CONTRACTS.md) — Backend API Contracts (M2+)
- [`context/DESIGN_SYSTEM.md`](./context/DESIGN_SYSTEM.md) — UI Tokens & Guidelines
- [`context/TEST_PLAN.md`](./context/TEST_PLAN.md) — Test Coverage & Validation Strategy
- [`context/DEVELOPMENT_WORKFLOW.md`](./context/DEVELOPMENT_WORKFLOW.md) — Milestone Roadmap
- [`context/RELEASE_CHECKLIST.md`](./context/RELEASE_CHECKLIST.md) — Release Criteria

---

## Production Build & Deployment Guide (Milestone M7)

### 1. Backend Server Deployment (Node.js / Express)
The backend in `server/` is production-ready for deployment to any container or PaaS provider (Render, Railway, Fly.io, Google Cloud Run, AWS App Runner).

1. **Build Step**: `npm run build` (compiles TypeScript to `server/dist`).
2. **Start Command**: `npm start` (executes `node dist/index.js`).
3. **Environment Variables Required**:
   - `PORT`: Provided dynamically by host or default `5000`.
   - `HOST`: `0.0.0.0` (binds to all interfaces).
   - `NODE_ENV`: `production`.
   - `MONGODB_URI`: Production MongoDB Atlas connection URI (`mongodb+srv://...`).
   - `FIREBASE_PROJECT_ID`: Firebase project ID (e.g., `spendly-70334`).
   - `FIREBASE_CLIENT_EMAIL`: Service account client email.
   - `FIREBASE_PRIVATE_KEY`: Service account private key string (with escaped newlines).
4. **MongoDB Atlas Security**:
   - Configure Atlas Network Access whitelist to include the hosting provider's IP range or `0.0.0.0/0` with strong authentication.
   - Set up separate non-admin database user credentials for Spendly API.

### 2. Standalone Android APK Build (EAS Build)
Spendly is configured for Expo Application Services (EAS) using `eas.json`.

1. **Install EAS CLI and Login**:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. **Configure Environment Secrets**:
   Set `EXPO_PUBLIC_API_URL` to your production HTTPS backend (e.g., `https://spendly-api.yourdomain.com/api/v1`) in EAS Secrets:
   ```bash
   eas secret:create --name EXPO_PUBLIC_API_URL --value https://spendly-api.yourdomain.com/api/v1 --type string
   ```
   Or include the Firebase web client environment variables.
3. **Build Standalone Preview APK**:
   ```bash
   eas build -p android --profile preview
   ```
   This generates an installable `.apk` file for physical device smoke testing.
4. **Build Production Android App Bundle (AAB for Google Play)**:
   ```bash
   eas build -p android --profile production
   ```

