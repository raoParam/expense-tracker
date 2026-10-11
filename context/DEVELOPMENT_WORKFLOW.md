# AI-Assisted Development Workflow

## 1. General rule
Implement one milestone at a time. Do not ask the agent to build the entire product in one prompt.

## 2. Before every task
The agent must:
1. Read `README.md` and the relevant specification documents.
2. Inspect the current repository and git status.
3. Report current state and a short plan.
4. Make only changes within the approved milestone.
5. Run appropriate checks and tests.
6. Summarize files changed, commands run, results, limitations, and exact next step.

## 3. Avoid
- Replacing working code without explaining why
- Adding unrequested features
- Installing unnecessary packages
- Using mock data in production workflows
- Hardcoding secrets or API URLs without configuration
- Claiming tests/build succeeded without actually running them
- Making destructive git changes or committing without user approval
- Silently changing business rules or documents

## 4. Developer environment
- Pentium Gold CPU, 4 GB RAM
- Use physical Android device, not Android emulator
- Keep browser tabs and background services minimal
- Use Expo development workflows appropriate to the chosen device and installed Expo Go/runtime
- Use cloud build for APK when required

## 5. Milestones
### M0 — Repository and documentation
- Add and review all specification files
- No application implementation yet

### M1 — Mobile foundation + personal tracker
- Expo + TypeScript + Expo Router
- Design tokens and base components
- SQLite local schema/repository
- Personal expense list and CRUD
- Validation and unit tests
- Instructions for physical-device testing

### M2 — API foundation
- Express + TypeScript skeleton
- Configuration and health endpoint
- Database connection to Atlas
- Error handling, logging, validation
- No shared financial flow until auth strategy is finalized

### M3 — Identity and rooms
- Authentication provider integration
- Rooms, membership, invitations and authorization tests

### M4 — Shared expenses
- Split engine
- Expense lifecycle, acknowledgements, rejection, revision handling
- Unanimous rejection restriction

### M5 — Balances and settlements
- Net balance engine
- Suggested transfer algorithm
- Atomic settlements and audit events

### M6 — Integration and release
- Cached room data, notifications, compatibility tests
- EAS APK build and beta distribution

## 6. Definition of done
A milestone is complete only when:
- Scope matches the milestone
- Type checks and linting pass where configured
- Tests pass, or blockers are clearly reported
- App/build is runnable as relevant
- No known secret is committed
- Documentation is updated
- User receives a concise handoff and the next prompt is not executed automatically
