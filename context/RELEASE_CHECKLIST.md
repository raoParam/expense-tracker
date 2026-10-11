# Release Checklist — V1

## Product
- [ ] Personal and room expenses are clearly separated
- [ ] All required V1 split types work
- [ ] Acknowledgement/rejection rules work as documented
- [ ] Unanimous rejection restriction is enforced server-side
- [ ] Settlements require recipient verification
- [ ] Room balances reconcile to zero
- [ ] Personal-data local-only limitation is disclosed

## Security
- [ ] Authentication and authorization tested
- [ ] No secrets committed
- [ ] Server validates all shared mutations
- [ ] Rate limiting and input validation enabled
- [ ] Cross-room access tests pass
- [ ] Idempotency and concurrency controls tested
- [ ] Audit trail is retained as designed

## Quality
- [ ] Unit and integration tests pass
- [ ] No known critical calculation bugs
- [ ] Offline/online states tested
- [ ] App tested on physical Android devices
- [ ] Text scaling and small-screen layout checked
- [ ] Error, empty, loading and stale-cache states checked

## Build and operations
- [ ] Production environment variables configured
- [ ] Atlas access restricted appropriately
- [ ] Database backup/retention plan considered for production
- [ ] EAS build configuration checked
- [ ] APK installed and smoke-tested
- [ ] Beta feedback channel established
- [ ] Privacy policy and account deletion/retention rules reviewed before public release
