# DriftPatch — Take-home submission

**Repo**: https://github.com/Jaqito/driftpatch
**Live demo PR** (real, opened end-to-end against my own public Polaris-wrapper repo): https://github.com/Jaqito/react-polaris-web-components/pull/3
**Architecture & flow**: [`docs/FLOW.md`](./FLOW.md) — three Mermaid diagrams + step-by-step.

---

## What I built and why

**DriftPatch** turns upstream-library changes into reviewable, validated GitHub PRs in a downstream consumer's repo. The motivating example is **Shopify Polaris**: it ships an unversioned CDN bundle at `cdn.shopify.com/shopifycloud/polaris.js` — no semver, no changelog, no migration guide, just a minified file with a build SHA at the top. When Shopify adds a new attribute to `<s-button>`, downstream wrapper libraries silently fall behind. I have my own wrapper library (`react-polaris-web-components`) that I babysit through these and it's exactly the kind of grind I'd want fixed.

The architecture is **generic engine + per-upstream provider adapter + per-repo skill**. The engine never knows about Polaris specifically; the Polaris adapter never knows about a specific customer repo; the skill (a markdown file in the customer repo) bridges them. End-to-end pipeline: fetch upstream artifacts → diff → index target repo → locate impacts → LLM-patch (replacement blocks, never unified diffs) → validate against the repo's own commands → one-shot LLM repair on failure → branch + commit + push + `gh pr create`. The LLM has exactly five jobs in the system; everything else is deterministic. **`docs/FLOW.md`** has the full breakdown with diagrams.

I ran it for real against my Polaris-wrapper repo on GitHub: ~30 seconds wall-clock, ~$0.06 in API costs (Sonnet 4.6), one merged-ready PR including a real-world repair where the first patch failed `npm run typecheck` because the installed `@shopify/polaris` types hadn't shipped the new attribute yet, and the repair LLM correctly diagnosed and fixed it.

## How I used AI

Claude Code (Opus 4.7) was the harness for the whole build. I treated it as a smart-but-eager pair-programmer: useful for drafting code, very useful for surfacing tradeoffs I hadn't thought through, occasionally over-confident about architecture choices that needed pushback. The most valuable mode was the back-and-forth on architectural decisions — pressure-testing 5 canonical adapter cases (Polaris, Stripe, OpenAI SDK, Prisma, Auth0) before committing to abstractions, deciding deterministic-vs-LLM per pipeline step, debating skill-based vs SDK-based init.

Specific things that worked well: structured discussion of architecture tradeoffs before coding (the doc-first approach in `docs/PRD.md`), generating the per-repo skill mappings (89 wrapper picks across Polaris elements in one $0.05 call), repair on validation failure (the model correctly inferred type-system constraints I hadn't told it about), and writing the boring-but-load-bearing parts (markdown serializer, zod schemas, git wrappers) where I just wanted clean code.

## Where AI got things wrong, and how I pushed back

A few real ones, not curated:

**Architecture pivots without checking constraints.** Early on, the model proposed dropping the SDK-based init in favor of a Claude Code skill. Sounded clean. I pushed back: _"so in CI this wouldn't work right if we didn't do it with the API key?"_ — the model agreed, retracted, restated. It then went to actually delegate research to the `claude-code-guide` subagent and came back with the real answer: skills don't work in `claude -p` non-interactive mode. That confirmed the pushback. After that we landed on the right hybrid: SDK for headless paths (run, patch, repair), skill option for interactive paths.

**"Deterministic-only V1" reframe.** Mid-build the model wanted to argue that V1 could be mostly deterministic since Polaris attribute additions are mechanical. I called this out as too narrow — the whole product premise is _generic_ patching across providers. We committed to LLM-as-core in PRD §10 and the rest of the build flowed from that.

**Speculative cleverness.** The original design had a "self-improving skill" layer — append merged-PR diffs to the repo's skill examples. When I pushed on it (_"does this even make sense?"_), the model defended a softened version (eval accumulation). I pushed harder; we dropped it entirely. Saved meaningful complexity.

**Smaller stuff.** Cost estimates were off by ~70% on the first init run ($0.14 estimated, $0.24 actual — adaptive-thinking tokens not accounted for). Twice the model overwrote `packages/core/src/index.ts` by confusing the `Write` tool with `Edit`; recovered via `git checkout` both times. The Polaris adapter's wrapper-auto-detection silently produced 0 mappings on `react-polaris-web-components` because that repo uses `createElement('s-checkbox', ...)` instead of JSX `<s-checkbox>` — real generality bug, caught during testing, fixed by extending the adapter to also scan call-argument string literals. The validator's clean-tree check was too strict by default; needed an `--allow-dirty` escape hatch when a freshly-written `.driftpatch/proposed.patch` showed up as an untracked file.

In each case I cared more about the architectural claim being honest than about looking smart, so pushback was specific (_"why are we removing this?"_, _"does this even make sense?"_) rather than directional.

## What I'd improve with more time

The thread is **continue making this more generic**:

- **Second adapter**. The architecture is provider-agnostic by construction, but until I ship Stripe (OpenAPI diff) or OpenAI (model lifecycle) or Prisma (schema diff), "the abstractions are correct" is unfalsified. A second adapter is roughly an FDE day given the existing scaffolding.
- **Multi-language indexer**. Currently TS/TSX only via `ts-morph`. Same architecture works for Python / Go / Ruby with `tree-sitter` + per-language extractors; everything downstream of `RepoIndex` is language-agnostic.
- **Baseline store**. The current GitHub Action takes `from_sha` as a manual input. A `.driftpatch/baselines/<provider>/latest.json` auto-tracks last-seen upstream version, so a scheduled cron becomes "diff against latest, open PR if anything changed."
- **Auto-generated migration docs**. PR body is currently templated; an LLM call over the existing artifacts (events + plans + validation results) gives reviewers a richer migration narrative.
- **Type-defs into the planner prompt**. Closes the hallucinated-API loophole — pass the _new_ SDK's type surface alongside the changelog so the model can't invent properties.
- **Real eval harness**. The single snapshot test catches deterministic regressions on one fixture. Multi-provider graded fixtures become valuable once the second adapter ships and we need to know whether prompt changes improve _averages_, not just one case.

The connecting thread: every item above is either a new adapter (FDE-shaped, isolated) or a generic-engine improvement that benefits every provider at once. That's the design test, and so far it holds.

## Limitations and rough edges (honest)

- **LLM patcher is non-deterministic across runs**. Running the same patch twice with Sonnet 4.6 produced functionally identical but byte-different output (different doc-comment phrasing). The snapshot eval explicitly skips this layer for that reason.
- **Locator is weak on relative imports without skill mappings.** Files importing via `..` get marked low confidence even when the import resolves to a skill-mapped wrapper. Solvable with full import resolution; deferred.
- **No per-run cost cap.** A pathological case (giant repo, many high-confidence files) could spend more than expected. `--max-files` budget flag is the obvious mitigation, not implemented.

## Logistics

- Stack: TypeScript, pnpm monorepo, `ts-morph` for indexing, `node:vm` sandbox for Polaris bundle parsing, `@anthropic-ai/sdk` for LLM calls, `diff` package for unified-diff assembly, `gh` CLI for PRs.
- License: proprietary (`LICENSE` file). Source is public for review.
- Run end-to-end yourself: clone the repo, set `ANTHROPIC_API_KEY`, follow `docs/FLOW.md` for the run command. The GitHub Action template is in [`react-polaris-web-components/.github/workflows/driftpatch.yml`](https://github.com/Jaqito/react-polaris-web-components/blob/master/.github/workflows/driftpatch.yml).
