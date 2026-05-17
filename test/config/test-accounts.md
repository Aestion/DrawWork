# Test Accounts

All E2E tests use dynamically registered accounts via `registerAccount()` helper from `specs/utils.js`.

## Pattern

- Each test creates fresh accounts with `generateUnique()` prefixes
- No pre-existing accounts needed
- Share/collaboration tests register separate accounts for each participant

## Local Development

If you need to test manually:
- Register at `/register` with any email/password
- Default test password: `TestPass123!` (configurable in `settings.yaml`)

## Test Resources

- Test video: `test/level1-playwright/fixtures/test-video.mp4`
