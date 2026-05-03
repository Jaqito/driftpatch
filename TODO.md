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
- [x] **JSX usage extraction**: component name, props with literal values, resolved import source
- [x] **String literal usage extraction** with context, identifier-like filter, skips imports
- [x] Symbol table (function/component/class/interface/type/variable, exported flag)
- [x] Provider usage map via `filesByPackage`
- [x] JSON output / serialization (`serializeIndex`/`deserializeIndex`)
- [x] Cache by git HEAD `repo_sha`; dirty trees skip cache
- [x] `driftpatch index` CLI command with summary + `--out` JSON dump
- [x] Tests on a small TS+TSX fixture repo (passes 7/7)
- [x] Smoke-run on `shopify-components` (208 files in <1s)
- [ ] **Source file filters from skill include/exclude globs** (still hardcoded defaults; needs skill loader first)

### Layer 2 — Polaris adapter + fixtures (eval anchor)

**Reality check (verified 2026-05-02):** Polaris ships zero structured changelog. The CDN bundle at `https://cdn.shopify.com/shopifycloud/polaris.js` *is* the source of truth — minified, identified only by `/*!<sha>*/` at top. A third-party reverse-engineering site (`polaris-changelog.dev`) archives historical builds at `/builds/<sha>.js` and publishes an RSS feed of summaries. Custom-element names, observed attributes, and even prop enum values survive minification because they're string-keyed.

So the Polaris adapter is a **bundle differ**, not a markdown parser.

- [x] `examples/adapter-polaris` skeleton
- [ ] **Define Polaris `EntityDef` shape**: `{ name, observedAttributes, properties: { name → { kind, enumValues? } }, methods }`
- [ ] **Bundle fetcher**: `https://polaris-changelog.dev/builds/<sha>.js` for historical, `https://cdn.shopify.com/shopifycloud/polaris.js` for current
- [ ] **API surface extractor**: load bundle in `node:vm` with stubbed `customElements.define`, capture each class's `observedAttributes` + getters/setters. Fall back to jsdom if bundle needs DOM globals to evaluate.
- [ ] **Surface differ**: two surface snapshots → `ChangeEvent[]` (element added/removed, attribute added/removed, enum value changes, method changes). Diff is computed, not LLM-interpreted.
- [ ] **RSS feed reader**: `https://polaris-changelog.dev/rss.xml` enumerates builds and provides human descriptions; cross-reference into `ChangeEvent.description`.
- [ ] **Self-snapshot fallback**: each `driftpatch run` fetches the current CDN bundle, hashes it, caches at `.driftpatch/cache/polaris/<hash>.js`. Reduces dependency on `polaris-changelog.dev` over time.
- [ ] **Implement `fetchChangelog(fromSha, toSha)`** wrapping bundle fetch + cache
- [ ] **Implement `parseChangelog(raw)`** wrapping extract + diff
- [ ] `versionRange` semantics: SHA-based (with short-SHA support). Document the deviation from semver.
- [ ] Fixture: two archived Polaris builds with a known surface diff (one mechanical change, one prop-shape change)
- [ ] Author `fixtures.test.ts` asserting `ChangeEvent[]` for the build pair
- [ ] Wire `driftpatch adapter test --provider polaris` to actually run it

**Risk:** dependency on `polaris-changelog.dev` (third-party, not Shopify). Self-snapshot fallback partly mitigates; documented as known constraint.

### Layer 3 — `driftpatch init`
- [ ] Repo scanner: detect language, package manager, candidate areas
- [ ] LLM proposes draft skill from scan
- [ ] Interactive confirm/edit loop
- [ ] Verify proposed validation commands actually run before saving
- [ ] Write `driftpatch.skill.md` + add `.driftpatch/` to `.gitignore`

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
