# Polaris fixtures

Real Polaris CDN bundles backfilled for testing. Both files are minified JavaScript bundles ~500KB each.

| File | Build SHA | Source |
| --- | --- | --- |
| `old.js` | `913ce26d86e1755e5b8c29606465c88c2fccf691` | Backfilled from `polaris-changelog.dev/builds/<sha>.js` |
| `new.js` | `5ff803d5f82b5b8a4238acb189bfebec198906dc` | Fetched from `cdn.shopify.com/shopifycloud/polaris.js` (current as of 2026-05-02) |

These are dev-only test fixtures. The runtime adapter never depends on `polaris-changelog.dev` — production uses self-snapshotted bundles from a per-customer baseline store.

Known surface diff between `old.js` → `new.js` (regression-tested in `test/diff.test.ts`):

- `s-checkbox` gained attribute `labelaccessibilityvisibility` and corresponding property
- `s-modal` gained attribute `alignself` and corresponding property
