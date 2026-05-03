# TODO

Living checklist of what's done, what's next, and known issues. PRD lives at [`docs/PRD.md`](docs/PRD.md).

## Known bugs

- [ ] **Generic adapter inverts `fromVersion`/`toVersion` for descending changelogs.** Standard changelogs list newest version first; current parser treats the previously-seen version as `from`, which means in a `13.0.0` → `12.5.0` ordered file the second batch ends up `from: 13.0.0, to: 12.5.0`. Fix: track headings, then assign `from = previous heading below in document order, to = current heading`. ~5 min.

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

### Layer 1.5 — Minimal RepoIndex (next chunk)

Reordered ahead of Layer 2 because the index is the load-bearing product value. Adapter SDK contract can be validated with a stub adapter; the index can't.

- [ ] `ts-morph`-based scanner with import-graph extraction
- [ ] **JSX usage extraction**: component name, props, prop values, import source
- [ ] **String literal usage extraction** for webhook/event names
- [ ] Symbol table (declarations + references for components, types, functions)
- [ ] Provider usage map (precomputed "files using `@shopify/polaris`" lookup)
- [ ] **Source file filters from skill include/exclude globs**
- [ ] JSON output fixture for inspection / debugging
- [ ] Cache by `repo_sha`

### Layer 2 — Polaris adapter + fixtures (eval anchor)
- [x] `examples/adapter-polaris` skeleton (no parser yet)
- [ ] **Define Polaris `EntityDef` shape** for components / props / events
- [ ] Pull 2–3 real Polaris changelogs into `examples/adapter-polaris/fixtures/`
- [ ] **One mechanical fixture + one behavior/ambiguous fixture** at minimum
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
- [ ] **Clean-working-tree check before apply / PR**
- [ ] Run `git apply --check` → `tsc` → `eslint` → tests
- [ ] On fail: feed error back to patcher for one repair attempt
- [ ] **Second fail: rollback and report** (revert any partial apply)

### Layer 7 — PR integration
- [ ] `--pr` flag on `run` shells out to `gh pr create`
- [ ] Branch/commit gated by `patch_policy` per change kind

### Layer 8 — Self-improving skill
- [ ] **Hook: when a DriftPatch PR is merged, append sanitized diff as an example to the repo's skill.**
  Implementation options: (a) GitHub Action on `pull_request: closed && merged`, calls `driftpatch learn --pr <num>`; (b) manual `driftpatch learn --pr <num>` post-merge; (c) scheduled `driftpatch learn --since 7d` scanning labeled PRs. "Sanitized" = strip secrets / internal URLs / customer identifiers from the diff before it lands in the skill.

## CLI behavior

- [ ] **`--dry-run` is the default mode**: write artifacts to `.driftpatch/`, do not modify files. Apply requires explicit `--apply` flag.
- [ ] `--yes` flag for non-interactive CI / FDE demos (skips confirmation prompts)

## Suggested next chunk

**Layer 1.5 — Minimal RepoIndex.** Build the import graph + JSX prop usage + string literal extraction with `ts-morph`, output a JSON fixture. Once it works, given an `s-button.loading` ChangeEvent we can immediately prove the engine finds `ButtonProps` / wrapper files. That's the demo that sells the tool — "given this change, here are the exact files I'd touch."

After that, Polaris adapter (Layer 2) becomes the second proof point: real upstream → real ChangeEvents → real impacted files.
