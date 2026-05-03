# Product Requirements Document

## DriftPatch — Upstream Change → Impact → Patch → PR

---

## 1. Overview

Modern apps depend on external systems (Shopify, Stripe, SDKs, web components) that change frequently and rarely ship actionable migration guidance for downstream consumers.

DriftPatch is a generic upstream-drift engine that becomes useful in a specific repo through two extensions: **provider adapters** (per-upstream, FDE-authored, reused across engagements) and a **repo skill** (per-repo, generated then refined). The engine handles ingestion, indexing, classification, location, patching, validation, and PR creation. The adapter teaches it how to read a specific upstream. The skill teaches it how a specific repo is shaped.

**Generic Engine + Provider Adapter + Repo Skill = useful automated PRs.**

---

## 2. Goals

### Primary
Turn upstream changes into reviewable, validated, repo-aware code updates.

### Secondary
- Reduce time-to-react on integration changes from days to minutes
- Give FDEs a fast path to onboard new providers and customers
- Provide observability into upstream drift across a repo's dependencies
- Demonstrate a thoughtful split between deterministic execution and AI reasoning

---

## 3. Non-Goals (V1)

- **Built-in adapter library.** Adapters are FDE-authored per engagement and shared via internal registry; we do not ship a curated catalog.
- **Continuous polling / auto-triggered runs.** On-demand `fetchChangelog(from, to)` is in scope (and expected of real adapters); the scheduled-poller, dedup, and secret-management loop is deferred.
- UI / dashboard
- Perfect patch accuracy without human review
- Behavior-change patches applied without human approval

---

## 4. Target Users

- **Forward-deployed engineers** authoring adapters and onboarding repos at customers (primary)
- **Backend engineers** maintaining SDK-heavy integrations
- **Frontend engineers** wrapping external component libraries

---

## 5. User Stories

**As an FDE onboarding a customer**, I can:
- Scaffold a new provider adapter from a sample changelog
- Run `init` against the customer repo to generate a draft skill
- Refine the skill interactively and commit it
- Hand off a working `driftpatch run` command to the customer team

**As a developer on the customer team**, I can:
- Provide a changelog (or let the adapter fetch it) and get a structured impact report
- Generate a validated patch and open a PR with one command
- Trust that mechanical changes are auto-applied and behavior changes are flagged for review

---

## 6. Architecture

Three layers, sharp boundaries.

```
┌──────────────────────────────────────────────────────────┐
│ Generic Engine (ships with DriftPatch)                   │
│  ingest → classify → index → locate → plan → patch →     │
│  validate → apply → PR                                   │
└──────────────────────────────────────────────────────────┘
        ▲                                    ▲
        │                                    │
┌───────┴────────────┐              ┌────────┴────────────┐
│ Provider Adapter   │              │ Repo Skill          │
│ (FDE-authored,     │              │ (init-generated,    │
│  per-upstream,     │              │  per-repo,          │
│  reused across     │              │  human-refined)     │
│  customers)        │              │                     │
└────────────────────┘              └─────────────────────┘
```

### 6.1 Generic Engine

```ts
interface DriftEngine {
  ingest(adapter: ProviderAdapter, source: Source): RawChangelog;
  classify(raw: RawChangelog, adapter: ProviderAdapter): ChangeEvent[];
  indexRepo(repo: Repo): RepoIndex;
  locate(change: ChangeEvent, index: RepoIndex, skill: RepoSkill): ImpactCandidate[];
  plan(change: ChangeEvent, candidates: ImpactCandidate[], skill: RepoSkill): PatchPlan;
  patch(plan: PatchPlan): ProposedPatch;
  validate(patch: ProposedPatch, skill: RepoSkill): ValidationResult;
  apply(patch: ProposedPatch): ApplyResult;
}
```

The engine is reusable across every repo and every provider. It owns the pipeline; adapter and skill are inputs.

### 6.2 Provider Adapter

```ts
interface ProviderAdapter {
  name: string;                                    // "polaris"
  versionRange: string;                            // ">=12.0.0 <14.0.0"
  conventions: ProviderConventions;                // entityPrefix, naming style, etc.

  fetchChangelog(from: Version, to: Version): Promise<RawChangelog>;  // expected for real adapters
  parseChangelog(raw: RawChangelog): ChangeEvent[];                   // required
  getEntityDefinition(name: string, version: Version): EntityDef | null;
}
```

`fetchChangelog` is technically optional in the SDK (the generic adapter has nothing to fetch), but every real adapter is expected to implement it. CLI usage is `driftpatch run --provider polaris --from 13.0.0 --to 14.0.0` for the fetch path, or `--source <file>` to bypass fetching.

Each adapter lives in its own directory:

```
adapters/polaris/
  index.ts           # exports adapter
  parser.ts          # changelog → ChangeEvent[]
  entities.ts        # entity definitions, conventions
  fixtures/
    v12-to-v13.md
    v13-to-v14.md
  fixtures.test.ts   # asserts parser output for each fixture
  README.md          # FDE notes
```

**Reuse model:** adapters live in an internal registry (private npm scope or monorepo). FDE A writes the Polaris adapter once; FDE B at the next Polaris customer pulls it. Customer engagements never rewrite an existing adapter — they extend it.

**Fallback:** a built-in `generic` adapter ships with the engine. Dumb markdown parser, no conventions, fully agentic classification. Lower quality but unblocks day-1 demos before a real adapter exists.

### 6.3 Repo Skill

A markdown file (`driftpatch.skill.md`) with structured sections, generated by `driftpatch init` and human-refined. Hint layer for the engine — never source of truth. Every run cross-checks the skill against the current index; stale entries trigger warnings, not silent miscategorization.

```markdown
---
version: 1
repo: PolarisKit
language: typescript
package_manager: pnpm
---

## Validation
- pnpm typecheck
- pnpm lint
- pnpm test

## Areas
### components
- paths: src/components
- pattern: React wrappers around Shopify Polaris web components

### recipes
- paths: src/recipes
- pattern: Higher-level flows composed from components

## Provider mappings
### polaris
- s-button → src/components/Button.tsx (ButtonProps)
- s-card → src/components/Card.tsx (CardProps)

## Patch policy
- mechanical: auto_apply
- behavior: require_review
- unknown: create_todo_only

## Examples
### s-button: added `loading` prop
- add `loading?: boolean` to ButtonProps
- pass `loading` through to <s-button>
- do not modify recipes unless they manually emulate loading
```

Markdown over YAML: easier to hand-edit, comments are first-class, LLMs read it back better. `version: 1` from day one to avoid schema-migration pain.

---

## 7. Core Concepts

### ChangeEvent

```ts
type ChangeKind =
  | "rename" | "removal" | "signature_change"
  | "behavior_change" | "new_default" | "deprecation"
  | "addition";

type ChangeEvent = {
  id: string;                          // stable hash for caching/dedup
  provider: string;
  kind: ChangeKind;                    // closed enum, not freeform
  entity: string;                      // e.g. "s-button"
  fromVersion: string;
  toVersion: string;
  description: string;
  attributes?: Record<string, unknown>;
  risk: "low" | "medium" | "high";    // gates patch policy
};
```

V1 handles `rename | removal | signature_change | new_default | deprecation` end-to-end. `behavior_change` is detected and reported but defaults to `require_review`. `addition` is detected and informational only.

### RepoIndex

Built from `ts-morph`-style AST analysis. Provides:

- **Import graph**: which files import which packages
- **Symbol table**: declarations and references for components, types, functions
- **Provider usage map**: pre-computed lookup of "files using `@shopify/polaris`"

Deterministic, cacheable per `repo_sha`. Embeddings considered later; not in V1.

### ImpactCandidate

```ts
type ImpactCandidate = {
  filePath: string;
  reason: string;          // agent's justification, surfaces in impact report
  confidence: "high" | "medium" | "low";
  matchedSymbols: string[];
};
```

`reason` is captured from the locator and rendered into the impact report. This is how we counter the "confident-but-wrong" failure mode: every selected file comes with auditable reasoning.

---

## 8. Pipeline

```
1. ingest        adapter.fetch or load file
2. classify      raw → ChangeEvent[] (adapter)
3. index         repo → RepoIndex (deterministic, AST-based)
4. locate        ChangeEvent + index + skill → ImpactCandidate[]
                 (agentic; falls back to skill mappings when present)
5. plan          ChangeEvent + candidates + skill examples → PatchPlan
6. patch         plan → replacement blocks (per file)
7. assemble      replacement blocks → unified diff (deterministic)
8. validate      git apply --check → typecheck → lint → tests
                 on fail: one repair attempt, then revert
9. apply         branch + commit (gated by patch_policy)
10. PR           gh pr create (optional, --pr flag)
```

**Key choice: replacement blocks, not LLM-generated diffs.** The patcher emits old/new code spans (or full file replacements); the engine assembles the unified diff deterministically. LLM-generated unified diffs routinely get line numbers and context lines wrong — taking that step out of the model's hands eliminates a large class of "patch fails to apply" failures.

**Validation repair loop:** on validation failure, the engine feeds the error (typecheck output, failing test) back to the patcher for one repair attempt. Second failure reverts and reports. No multi-round repair loops — pathological behavior risk.

**Patch policy enforcement:** `auto_apply` is gated per change kind via the skill. Default V1 skill ships everything as `require_review` until the classifier earns trust on that kind through the eval harness.

---

## 9. CLI

```
driftpatch init [--repo .]
  Scans repo, proposes a draft skill interactively, verifies validation
  commands actually run, writes driftpatch.skill.md.

driftpatch run --provider <name> (--source <changelog> | --from <ver> --to <ver>) [--apply] [--pr] [--skill <path>] [--yes]
  Runs the full pipeline. Either --source loads a changelog from disk
  or --from/--to calls adapter.fetchChangelog. --dry-run is the default;
  --apply opts in to writing changes. --pr opens a PR on success.
  --skill overrides the default skill location for testing. --yes for CI.

driftpatch adapter init --provider <name>
  Scaffolds a new adapter directory with fixtures slot and test stub.

driftpatch adapter generate --provider <name> --samples <dir>
  LLM-drafts a parser from sample changelogs. Outputs ChangeEvents per
  sample so FDE can review before refining.

driftpatch adapter test --provider <name>
  Runs adapter fixtures.test.ts — asserts parser output matches expected
  ChangeEvents.
```

Three commands at the top level (`init`, `run`, `adapter`). `pr` is a flag on `run`, not a subcommand — it's mostly a `gh pr create` wrapper and doesn't earn its own command.

---

## 10. AI Usage Map

| Step | AI? | Rationale |
|---|---|---|
| Adapter parser generation (`adapter generate`) | Yes | Drafts parser from samples; FDE refines |
| Skill generation (`init`) | Yes | Proposes structure from repo scan; user confirms interactively |
| Changelog classification | Yes (in adapter) | Provider-shaped; adapter owns the prompt |
| Repo indexing | No | AST-based, deterministic |
| File location | Yes (agentic) | Reads code, follows imports, reasons about relevance |
| Patch planning | Yes | Reasoning step, fed type defs of new SDK version |
| Patch generation | Yes (replacement blocks only) | Deterministic diff assembly downstream |
| Diff assembly | No | Deterministic from replacement blocks |
| Validation execution | No | Just runs `tsc`, `eslint`, tests |
| Validation repair | Yes (one attempt) | Error → repaired patch |
| Git/PR ops | No | `git`, `gh` |

**Important: pass new SDK type definitions into the planner.** The changelog says what changed; the type defs say what's actually callable now. Without this the planner hallucinates APIs.

---

## 11. Observability

- **Prompt/response logging** for every AI step, written to `.driftpatch/trace/<run-id>/`. Required for debugging the inevitable "why did it pick that file" question.
- **Token counts per stage** logged so we can spot regressions in prompt cost.
- **Skill drift warnings**: when the skill references files or symbols that no longer exist, surface in run output.

---

## 12. Eval Harness

A first-class deliverable, not an afterthought. Lives at `evals/`.

- 5–10 fixture cases per supported provider, each with: source changelog, target repo state, expected ChangeEvents, expected files-touched, known-good patch.
- Grader scores: (a) ChangeEvents match, (b) correct files selected, (c) patch applies, (d) patch passes validation.
- Run on every change to engine prompts; regressions block merge.
- Self-improving skill: when a generated PR is merged in production, sanitized diff appended to the repo's skill examples. Skill sharpens over time per repo.

---

## 13. Outputs

```
.driftpatch/
  changelog.json           # parsed ChangeEvent[]
  impact-report.md         # per-change: candidates + agent reasoning
  patch-plan.md            # planned changes per file
  proposed.patch           # assembled unified diff
  validation.log           # tsc/lint/test output
  trace/<run-id>/          # prompts + responses for every AI call
```

`.driftpatch/` should be gitignored by default — `init` adds the entry.

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| LLM-generated diffs fail to apply | Replacement blocks + deterministic diff assembly |
| Hallucinated APIs in patches | Pass new SDK type defs to planner; validation catches calls to nonexistent symbols |
| Confident-but-wrong file selection | Capture agent reasoning per candidate; surface in impact report for review |
| Skill rot (stale paths/mappings) | Cross-check skill against index every run; warn on drift |
| Adapter drift across upstream versions | `versionRange` on adapter; fail loudly outside range |
| Auto-apply on miscategorized changes | Default all policies to `require_review` until classifier proven on that kind |
| Pathological validation-repair loops | Cap at one repair attempt, then revert |
| Non-determinism from agentic search | Cache by `(change_event_id, repo_sha)`; document as known property |
| Per-engagement adapter rebuild | Internal registry; FDEs publish, engagements pull |
| Day-1 demo with no adapter built | Generic adapter fallback for any markdown changelog |

---

## 15. Success Criteria

1. **End-to-end demo on Polaris fixture**: changelog → impact report → validated patch → PR, with mechanical changes auto-applied and behavior changes flagged.
2. **FDE adapter authoring**: a new adapter (e.g. Stripe) goes from `adapter init` to passing fixtures in under a working day.
3. **Eval pass rate**: V1 ships when ≥80% of mechanical-change fixtures pass the full grader across at least two providers.
4. **Patch reliability**: ≥95% of generated patches apply cleanly (`git apply --check`).
5. **Reasoning auditability**: every selected file has a captured reason in the impact report.

---

## 16. Open Questions

- **Skill format vs Claude Code skills**: should `driftpatch.skill.md` piggyback on Claude Code's skill system, or remain DriftPatch-specific? Piggybacking gives us discovery and tooling for free; staying separate keeps the engine portable across harnesses. Default position: separate, but document the structural similarity.
- **Adapter registry distribution**: private npm scope vs internal monorepo. Lean toward npm scope for versioning ergonomics.
- **Multi-provider repos**: one skill file with nested providers (current shape) vs one skill per provider. Current shape for V1; revisit if files get long.
- **Index caching across runs**: assume yes, keyed on `repo_sha`, but cache-invalidation rules need spelling out.

---

## 17. Implementation Layers (build order)

1. **Engine + generic adapter + minimal skill loader** — get end-to-end working on a markdown changelog with no real adapter.
2. **Polaris adapter + fixtures** — first real adapter, becomes the eval anchor.
3. **`init` command** — interactive skill generation, validation command verification.
4. **`adapter init` + `adapter generate`** — FDE workflow.
5. **Eval harness** — grader, fixture cases, regression gating.
6. **Validation repair loop** — single repair attempt with error context.
7. **PR integration** — `--pr` flag, branch/commit gating by policy.
8. **Self-improving skill** — append merged-PR examples to skill.

Each layer is independently demoable. No layer waits on the next.
