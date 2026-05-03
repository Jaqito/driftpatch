---
version: 1
repo: polaris-app-fixture
language: typescript
package_manager: pnpm
---

## Validation
- pnpm typecheck

## Areas
### components
- paths: src/components
- pattern: React wrappers around Shopify Polaris web components.

### app
- paths: src/app
- pattern: Application pages composed from polaris wrappers.

## Provider mappings
### polaris
- s-checkbox → src/components/checkbox.tsx
- s-modal → src/components/modal.tsx

## Patch policy
- addition: require_review
- behavior_change: require_review
- deprecation: require_review
- new_default: require_review
- removal: require_review
- rename: require_review
- signature_change: require_review
