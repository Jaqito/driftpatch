# TODO

Living checklist of what's done, what's next, and known issues. PRD lives at [`docs/PRD.md`](docs/PRD.md).

## Known bugs

- [ ] **Generic adapter inverts `fromVersion`/`toVersion` for descending changelogs.** Standard changelogs list newest version first; current parser treats the previously-seen version as `from`, which means in a `13.0.0` → `12.5.0` ordered file the second batch ends up `from: 13.0.0, to: 12.5.0`. Fix: track headings, then assign `from = previous heading below in document order, to = current heading`. ~5 min.

## Featured capabilities

These are the demo-defining capabilities. Track separately from the layer build because they cut across multiple layers and represent the actual product story.

### Change Replay — *prove the patch matters*

Synthesize a minimal repro that exercises the affected code path. Run pre- and post-patch.

- [ ] CLI: `driftpatch replay --change <id>` runs synthesized repro against current tree
- [ ] V1 scope: only synthesize replay for `removal` and `signature_change` (mechanical kinds with high-signal tests). Defer `behavior_change` to V2.
- [ ] Component changes: minimal render via vitest + testing-library, snapshot before/after
- [ ] Webhook / event changes: synthesize sample payload, run handler, assert no error
- [ ] Replay must **fail before the patch and pass after** to count as proof. A trivially-passing test is a regression.
- [ ] Replay artifact written to `.driftpatch/replay/<change_id>/` for review

### Patch Confidence + Blast Radius — *gate auto-apply on real signal*

Replace the freeform `risk: low/medium/high` enum on `ChangeEvent` with a computed score that gates `patch_policy.auto_apply`.

- [ ] Score signals: `# files touched`, `test coverage on touched files`, `change kind`, `AST certainty (exact symbol vs fuzzy match)`, `replay test result`
- [ ] Output: `Confidence: 0.82 (mechanical rename, 2 files, covered by tests)` + blast-radius classification
- [ ] Wire into `patch_policy`: scores ≥ threshold + replay-passes → auto_apply; otherwise require_review
- [ ] Render score and signal breakdown in `impact-report.md`

## Build order

Layer status reflects current commits. "Stub" = file exists with placeholder; "Done" = real implementation.

### Layer 1 — Engine + generic adapter + minimal skill loader
- [x] Type system in `@driftpatch/core` (`ChangeEvent`, `RepoIndex`, `RepoSkill`, `PatchPlan`, ...)
- [x] `DriftEngine` interface
- [x] `@driftpatch/adapter-sdk` with `ProviderAdapter` interface and `defineAdapter` helper
- [x] `@driftpatch/adapter-generic` parses markdown changelogs (with bug above)
- [ ] Skill loader: read/parse `driftpatch.skill.md`, validate against zod schema, cross-check paths against repo
- [ ] Engine implementation wiring classify → index → locate → plan → patch → validate → apply
- [ ] **Replacement-block patcher**: model emits old/new spans; engine deterministically assembles unified diff
- [ ] **Prompt/response trace logger** in `.driftpatch/trace/<run-id>/`
- [ ] **Token/cost logging per AI stage**
- [ ] **Run cache** keyed by `(change_event_id, repo_sha, skill_hash)`
- [ ] **Type-aware planner**: feed new SDK type surface (`.d.ts`, JSON schema, or local wrapper types) into the planner prompt to kill hallucinated APIs

### Layer 1.5 — Minimal RepoIndex

- [x] `ts-morph`-based scanner with import-graph extraction (named imports, type-only flag, package grouping that skips node builtins + path aliases)
- [x] **JSX usage extraction**: component name, props with literal values, resolved import source, **un-aliased original name** (so `import { Card as PolarisCard }` resolves back to `Card`)
- [x] **String literal usage extraction** with context, identifier-like filter, skips imports
- [x] Symbol table (function/component/class/interface/type/variable, exported flag)
- [x] Provider usage map via `filesByPackage`
- [x] JSON output / serialization (`serializeIndex`/`deserializeIndex`)
- [x] Cache by git HEAD `repo_sha`; dirty trees skip cache
- [x] `driftpatch index` CLI command with summary + `--out` JSON dump
- [x] Tests on a small TS+TSX fixture repo (passes)
- [x] Smoke-run on `shopify-components` (208 files in <1s)
- [ ] **Source file filters from skill include/exclude globs** (still hardcoded defaults; needs skill loader first)

### Layer 1.75 — Locator (provider-aware impact matching)

- [x] `locate(change, index, opts)` in `@driftpatch/core/src/locator/`
- [x] Name-variant heuristics: kebab → PascalCase, prefix stripping, alias-aware via `originalName`
- [x] Confidence model: direct kebab usage → high; PascalCase wrapper from a provider-named import path → high; PascalCase wrapper from relative path → low
- [x] String literal matching for webhook-style entities
- [x] Per-file aggregation: dedupe reasons across multiple usages in same file, upgrade confidence
- [x] Tests pass (5/5 locator + 7/7 indexer = 12/12)
- [x] CLI `run --provider <name> --from <ver> --to <ver> --repo <path>` wires fetch → diff → index → locate → impact report
- [x] **End-to-end demo on shopify-components proven**: real Polaris CDN diff produces 4 ChangeEvents, locator finds 9 affected files across `app/`, `components/polaris/`, and `data/examples/` — with line numbers and reasons

### Layer 2 — Polaris adapter + fixtures (eval anchor)

**Reality check (verified 2026-05-02):** Polaris ships zero structured changelog. The CDN bundle at `https://cdn.shopify.com/shopifycloud/polaris.js` *is* the source of truth — minified, identified only by `/*!<sha>*/` at top. Custom-element names, observed attributes, and prop enum values survive minification because they're string-keyed args to `customElements.define()`.

So the Polaris adapter is a **bundle differ**, not a markdown parser.

**Runtime data path (production):** the adapter snapshots the CDN bundle to a per-customer baseline store. CI/cron job runs the adapter on a schedule; when the current CDN SHA differs from the stored baseline, the differ produces `ChangeEvent[]` from the two bundles. No third-party runtime dependency.

**Dev-only backfill:** `polaris-changelog.dev/builds/<sha>.js` archives historical bundles. Useful *only* to seed test fixtures with realistic version pairs without waiting for the CDN to ship two changes during dev. Never on the runtime path.

- [x] `examples/adapter-polaris` skeleton
- [x] **Bundle fetcher**: CDN current; archive backfill marked dev-only
- [x] **API surface extractor**: vm-only with stubbed `customElements.define` + minimal DOM (EventTarget → Node → Element → HTMLElement chain, plus File/Blob/AbortController/URL/MutationObserver/etc). Real Polaris bundles parse with **0 warnings**, extracting **62 elements** with full observedAttributes, properties, methods. jsdom fallback not needed.
- [x] **Surface differ**: two snapshots → `ChangeEvent[]`. Element / attribute / property / method add+remove all classified with risk levels.
- [x] **Implement `fetchChangelog(from, to)`** wrapping bundle fetch
- [x] **Implement `parseChangelog(raw)`** wrapping extract + diff
- [x] `versionRange` semantics: SHA-based, `*` for now
- [x] Fixtures: `old.js` (backfilled SHA `913ce26d…`) + `new.js` (current CDN SHA `5ff803d5…`), checked in
- [x] **`fixtures.test.ts` passes 4/4**: extractor warnings empty, `s-button.loading` confirmed in current bundle, real diff produces exactly the expected 4 events (`s-checkbox[labelaccessibilityvisibility]` + property, `s-modal[alignself]` + property)
- [x] End-to-end smoke (`scripts/diff.ts`): live fetch + diff prints sane output
- [ ] **Baseline store**: `.driftpatch/baselines/polaris/<sha>.js` + `latest.json` pointer. Adapter reads `latest`, diffs against current CDN, writes new baseline on success. (Adapter already accepts arbitrary SHA pairs; baseline store is the wrapper that maintains the "what was last seen" pointer.)
- [ ] **Define Polaris `EntityDef` shape** in `getEntityDefinition` so the planner can be fed real type info
- [ ] Wire `driftpatch adapter test --provider polaris` to actually run it (currently a stub)
- [ ] Method-name false-positive cleanup: a small set of inherited DOM methods are filtered at extraction; revisit if more leak through on future bundles

**Risk eliminated:** no runtime dependency on third parties. Dev archive is a one-time fixture-seeding convenience.

### Layer 3 — `driftpatch init` (skill generation)

**Design constraint:** `init` must generalize beyond Polaris. We pressure-tested the design against 5 canonical cases (see PRD §13: Generalization across providers) — Polaris (React + web components), Stripe (server SDK + webhooks), Anthropic/OpenAI SDK, Prisma (DB schema + types), Auth0 (middleware + hooks). All five collapse to the same `RepoSummary` shape if we add function-call extraction to the index.

**Approach:** deterministic extraction does the bulk of the work; the LLM only fills in human-judgment gaps (area descriptions, picking the canonical wrapper file when multiple candidates exist, suggesting exclusions, one-line repo description). Per-provider affinity logic (e.g. "for Stripe, look for `payment_intent.*` literals") lives in the **adapter's `summarize(index)` method**, not in core.

#### 3a — Index gaps to close first (3 of 5 cases need them)

- [ ] **Function-call extraction in `@driftpatch/core` indexer**: capture `CallExpression`s on identifiers we care about (e.g. `stripe.checkout.sessions.create`, `prisma.user.findMany`, `messages.create`). Records callee chain + sample args + import source. ~50 LOC ts-morph addition.
- [ ] **Object-property-value extraction**: partially covered by string literal extractor's `object_value` context. Confirm sufficient for `{ model: "claude-..." }` Anthropic case before extending.
- [ ] **Multi-language source files** (Prisma `schema.prisma`, GraphQL `.graphql`, etc) stay out of core. **Per-provider responsibility** — adapter brings its own non-TS indexer when needed; results merge into the provider's `ProviderSnapshot`.

#### 3b — Summary types in core

- [ ] `RepoSummary`, `ProviderSnapshot`, `WrapperCandidate`, `AreaSnapshot` types (see PRD §13 for shape)
- [ ] `affinity` discriminator: `jsx | callSites | literals | propertyValues` — covers all 5 canonical consumption patterns

#### 3c — Per-provider summarize hook

- [ ] Add `summarize(index): ProviderSnapshot` to `ProviderAdapter` interface in `@driftpatch/adapter-sdk` (optional; default returns minimal snapshot from imports alone)
- [ ] Polaris adapter implements it: JSX usage + wrapper-candidate scoring (pull this out of the locator code we already wrote)
- [ ] Generic adapter falls back to "files importing the package" only

#### 3d — Generic extractor

- [ ] `extractRepoSummary(index, repoPath, adapters): RepoSummary` in core. Combines deterministic facts (`package.json`, scripts, lockfile detection, top-dir tree) with each adapter's `summarize` output.
- [ ] Includes deterministic validation-command candidates (scan `scripts` for `typecheck|lint|test|check|verify`)

#### 3e — `driftpatch init --dry-run` first

- [ ] CLI command that runs only the deterministic extraction and prints `RepoSummary` JSON
- [ ] Iterate on the shape against `shopify-components` + at least one non-Polaris case (Stripe sample repo or similar) before adding LLM call

#### 3f — LLM call + skill draft

- [ ] Single structured LLM call: `RepoSummary` + skill schema → draft skill
- [ ] LLM only fills: area pattern descriptions, canonical wrapper picks, suggested exclusions, one-line repo description
- [ ] Deterministic fields (name, language, package manager, scripts) merged in from extraction — LLM never overrides them

#### 3g — Validation + interactive confirm + save

- [ ] **Verify validation commands run successfully** in the repo before saving them; drop failures, warn user
- [ ] Interactive confirm/edit loop (display draft, allow edits)
- [ ] Markdown serializer: `RepoSkill` JSON ↔ `driftpatch.skill.md`
- [ ] Add `.driftpatch/` to `.gitignore`

### Layer 4 — `adapter init` + `adapter generate`
- [ ] `adapter init`: scaffold directory (`index.ts`, `parser.ts`, `entities.ts`, `fixtures/`, `fixtures.test.ts`, `README.md`)
- [ ] `adapter generate`: LLM drafts parser from sample changelogs, emits ChangeEvents per sample for FDE review

### Layer 5 — Eval harness
- [ ] Grader scoring (classify match, locate match, patch applies, validation passes)
- [ ] Fixture loader spec
- [ ] CI integration: regressions block merge

### Layer 6 — Validation repair loop
- [ ] **Clean-working-tree check before apply / PR**
- [ ] Run `git apply --check` → `tsc` → `eslint` → tests → **synthesized replay** (see Featured: Change Replay)
- [ ] On fail: feed error back to patcher for one repair attempt
- [ ] **Second fail: rollback and report** (revert any partial apply)

### Layer 7 — PR integration
- [ ] `--pr` flag on `run` shells out to `gh pr create`
- [ ] Branch/commit gated by `patch_policy` per change kind
- [ ] **Auto-generated migration doc** as PR body: four sections (`What changed / Why / How we updated / What you should verify`) generated from existing artifacts (impact-report, patch-plan, diff). Single LLM call.

### Layer 8 — Self-improving skill
- [ ] **Hook: when a DriftPatch PR is merged, append sanitized diff as an example to the repo's skill.**
  Implementation options: (a) GitHub Action on `pull_request: closed && merged`, calls `driftpatch learn --pr <num>`; (b) manual `driftpatch learn --pr <num>` post-merge; (c) scheduled `driftpatch learn --since 7d` scanning labeled PRs. "Sanitized" = strip secrets / internal URLs / customer identifiers from the diff before it lands in the skill.

## CLI behavior

- [ ] **`--dry-run` is the default mode**: write artifacts to `.driftpatch/`, do not modify files. Apply requires explicit `--apply` flag.
- [ ] `--yes` flag for non-interactive CI / FDE demos (skips confirmation prompts)
- [ ] **`--from <ver> --to <ver>` on `run`**: when no `--source` file is provided, call `adapter.fetchChangelog(from, to)`. Errors loudly if the adapter doesn't implement `fetchChangelog`.

## Impact report polish

Tied to PRD §6 (auditable reasoning). Cheap once `ImpactCandidate.reason` is wired.

- [ ] Render per-file confidence in `impact-report.md`
- [ ] **"Files considered but not modified" section** with reason for skipping each — kills "agent picked random files" skepticism
- [ ] Code-span links (file:line) for each cited symbol

## Future / wow factor (out of V1 scope)

Captured here so we don't lose them. None of these block any V1 layer.

- [ ] **Continuous polling / auto-trigger**: scheduled poller detects new upstream versions and auto-runs the pipeline in CI. (On-demand `fetchChangelog` is in V1 — see Layer 2 / CLI. The polling loop, dedup, scheduling, and secret management for private changelogs is what's deferred.)
- [ ] **Graph-aware impact** via call graph — "this handler is called by X, Y, Z." Heavy; runtime polymorphism limits accuracy. Defer.

## Suggested next chunk

**Layer 1.5 — Minimal RepoIndex.** Build the import graph + JSX prop usage + string literal extraction with `ts-morph`, output a JSON fixture. Once it works, given an `s-button.loading` ChangeEvent we can immediately prove the engine finds `ButtonProps` / wrapper files. That's the demo that sells the tool — "given this change, here are the exact files I'd touch."

After that, Polaris adapter (Layer 2) becomes the second proof point: real upstream → real ChangeEvents → real impacted files.
