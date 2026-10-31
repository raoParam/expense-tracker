# Spendly — Project Context

## Purpose
This repository contains the product and engineering specification for an Android-first expense app designed for hostel/PG residents and groups of friends.

The product has two distinct modes:
1. **Personal expenses** — private expenses stored locally on the user's device in V1.
2. **Room/group expenses** — shared expenses stored in a cloud backend, acknowledged by participants, and settled through verified repayment records.

The directed settlement graph is a **persisted execution plan**, never the source of truth. The source of truth remains the persisted shared expense and verified-settlement history; graph persistence and edge transitions make suggested repayment paths stable.

## How to use these documents
Read these documents before writing code, in this order:
1. `PRD.md`
2. `BUSINESS_RULES.md`
3. `ARCHITECTURE.md`
4. `DATA_MODEL.md`
5. `API_CONTRACTS.md`
6. `DESIGN_SYSTEM.md`
7. `TEST_PLAN.md`
8. `DEVELOPMENT_WORKFLOW.md`
9. `RELEASE_CHECKLIST.md`

If documents conflict, do not silently guess. Report the conflict and ask for a decision. `BUSINESS_RULES.md` is authoritative for financial and workflow behaviour; `PRD.md` is authoritative for product scope.

## Development constraints
- The developer is a solo engineering student using AI-assisted development.
- Development machine: Pentium Gold CPU, 4 GB RAM. Avoid heavy local services and Android emulators.
- Use a physical Android phone for testing.
- Build Android APKs using a cloud build service (Expo EAS Build) when needed.
- Prefer incremental, testable milestones. Do not generate the entire application in one pass.
- UI should look like a credible production SaaS/mobile product: restrained, practical, accessible, and consistent. No AI-style gradients, glassmorphism, excessive decoration, or unrealistic dashboards.
- Reuse the developer's React/JavaScript background and keep tooling lightweight.

## Initial technology direction
- Mobile: React Native + Expo + TypeScript
- Navigation: Expo Router
- Local personal data: Expo SQLite
- Backend: Node.js + Express + TypeScript
- Shared data: MongoDB Atlas + Mongoose
- API: versioned REST over HTTPS
- Testing: unit and integration tests, selected to work in a lightweight environment
- Android build: EAS Build
- Push notifications: Expo Notifications after core flows are reliable

This is a proposed V1 stack, not permission to install packages indiscriminately. Before implementation, check current project state and compatible stable package versions. Keep dependencies minimal.

## First implementation milestone
Only build the mobile foundation and personal expense tracker:
- Expo + TypeScript project foundation
- Expo Router navigation
- design tokens and reusable components
- local SQLite schema and repository
- personal expense list, create, edit, delete
- input validation and integer-paise money handling
- basic tests and instructions for running on a physical Android device

Do not implement cloud authentication, rooms, shared expenses, settlements, or notifications in Milestone 1 unless explicitly instructed later.
