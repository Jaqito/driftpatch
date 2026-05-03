# TODO

Living checklist of what's done, what's next, and known issues. PRD lives at [`docs/PRD.md`](docs/PRD.md).

## Known bugs

- [ ] **Generic adapter inverts `fromVersion`/`toVersion` for descending changelogs.** Standard changelogs list newest version first; current parser treats the previously-seen version as `from`, which means in a `13.0.0` → `12.5.0` ordered file the second batch ends up `from: 13.0.0, to: 12.5.0`. Fix: track headings, then assign `from = previous heading below in document order, to = current heading`. ~5 min.

## Build order (from PRD §17)

Layer status reflects the scaffold commit. "Stub" = file exists with a placeholder; "Done" = real implementation.

### Layer 1 — Engine + generic adapter + minimal skill loader
- [x] Type system in `@driftpatch/core` (`ChangeEvent`, `RepoIndex`, `RepoSkill`, `PatchPlan`, ...)
- [x] `DriftEngine` interface
- [x] `@driftpatch/adapter-sdk` with `ProviderAdapter` interface and `defineAdapter` helper
- [x] `@driftpatch/adapter-generic` parses markdown changelogs (with bug above)
- [ ] Skill loader: read/parse `driftpatch.skill.md`, validate against zod schema, cross-check paths against repo
- [ ] `RepoIndex` builder using `ts-morph` — import graph + symbol table + provider usage map
- [ ] Engine implementation wiring classify → index → locate → plan → patch → validate → apply

### Layer 2 — Polaris adapter + fixtures (eval anchor)
- [x] `examples/adapter-polaris` skeleton (no parser yet)
- [ ] Pull 2–3 real Polaris changelogs into `examples/adapter-polaris/fixtures/`
- [ ] Implement `parseChangelog` for Polaris's actual format
- [ ] Author `fixtures.test.ts` asserting `ChangeEvent[]` per fixture
- [ ] Wire `driftpatch adapter test --provider polaris` to actually run it

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
- [ ] Run `git apply --check` → `tsc` → `eslint` → tests
- [ ] On fail: feed error back to patcher for one repair attempt
- [ ] Second fail: revert and report

### Layer 7 — PR integration
- [ ] `--pr` flag on `run` shells out to `gh pr create`
- [ ] Branch/commit gated by `patch_policy` per change kind

### Layer 8 — Self-improving skill
- [ ] Hook: when a DriftPatch PR is merged, append sanitized diff as an example to the repo's skill

## Suggested next chunk

**Layer 2: Polaris adapter parser.** Getting one real adapter working end-to-end pressure-tests the SDK contract before we layer the engine on top of it. If the contract is wrong, we find out cheaply.

Alternative if you'd rather build downward: **Layer 1 — `RepoIndex` with ts-morph**. The locator is the core engine value; until it works, even a perfect adapter doesn't produce useful patches.
