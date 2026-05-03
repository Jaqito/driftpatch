# DriftPatch — Take-home submission

**Repo**: https://github.com/Jaqito/driftpatch  
**Live demo PR**: https://github.com/Jaqito/react-polaris-web-components/pull/3  
**Architecture & flow**: [`docs/FLOW.md`](./FLOW.md)

---

## What I built and why

At a high level:

> **DriftPatch takes upstream changes and turns them into validated pull requests by generating and applying codemods.**

The mental model I landed on is:

> _“What if upstream systems shipped codemods… but they don’t?”_

So this is a system that **generates those codemods for you**, then safely applies them to your repo.

---

### The motivating problem (Polaris)

I started with **Shopify Polaris**, which is a bit of a worst-case upstream.

They don’t ship:

- versioning
- changelogs
- migration guides

Instead, they publish a compiled bundle at:

cdn.shopify.com/shopifycloud/polaris.js

It’s just a minified file with a build hash at the top. When something changes (e.g. `<s-button>` gets a new prop), nothing is announced — the file just changes.

That means downstream consumers (like my wrapper library `react-polaris-web-components`) silently drift out of date.

I’ve been manually fixing these, and it’s exactly the kind of repetitive, error-prone work that feels automatable.

---

### The core loop

DriftPatch is built around this loop:

upstream change
→ understand it
→ find impacted code
→ update code
→ validate
→ open PR

The goal is to **close that loop automatically**, but safely.

---

## How it’s structured

The system splits into three parts:

generic engine + provider adapter + repo skill

- **Engine**  
  Handles orchestration: indexing, patching, validation, git, PRs

- **Adapter**  
  Knows how to interpret upstream changes  
  (e.g. Polaris bundle diff, Stripe changelog, OpenAPI diff)

- **Skill (per repo)**  
  Describes how a specific repo is structured  
  (where integrations live, naming conventions, safe changes)

The key idea is:

> The engine doesn’t know about Polaris  
> The adapter doesn’t know about your repo  
> The skill bridges the two

---

## Types of “drift”

While building this, I found it useful to think in three categories:

announced drift → official changelog / version notes
detected drift → artifact/spec/bundle diff
observed drift → runtime unknowns (logs, webhooks)

### Polaris = detected drift

polaris.js changes
→ diff bundle-derived artifacts
→ infer API change
→ ChangeEvent
→ patch/PR

### Stripe = announced drift

API version change
→ changelog
→ ChangeEvent
→ patch/PR

### Webhooks = observed drift

unknown event seen at runtime
→ capture + normalize
→ ChangeEvent
→ fixture/test/handler PR

The same engine handles all three — only the adapter changes.

---

## Where AI is used (and where it isn’t)

One thing I was careful about was **not letting the model do everything**.

### Deterministic

- repo indexing (`ts-morph`)
- diff generation
- file edits
- git operations
- validation (`typecheck`, `lint`, etc.)

### AI

- turning upstream signals into structured changes
- figuring out _what should change_
- planning patches
- handling ambiguous cases
- repair when validation fails

---

### Important constraint

> The model never generates unified diffs.

Instead it outputs **before/after code blocks**, and the system builds the diff itself.

This avoids one of the most common LLM failure modes (bad line numbers / context).

---

## Safety model

I ended up thinking of this as more of a **harness than a tool**.

Everything goes through:

patch → validate → (optional repair) → PR

If a patch doesn’t pass the repo’s own validation commands, it doesn’t get applied.

That matters more than whether the model “sounds correct.”

---

## End-to-end flow

fetch upstream
→ diff / extract changes
→ classify into ChangeEvents
→ index repo (AST)
→ locate impacted code
→ generate patch (replacement blocks)
→ validate
→ one-shot repair if needed
→ branch + commit + PR

Full breakdown in `docs/FLOW.md`.

---

## What actually happened in practice

I ran this end-to-end against my Polaris wrapper repo:

- ~30 seconds total
- ~$0.06 API cost
- opened a real PR

There was a nice real-world failure:

- the first patch failed `npm run typecheck`
- because the installed `@shopify/polaris` types didn’t include the new prop yet
- the repair step correctly diagnosed and fixed it

That was a good sanity check that the loop actually works.

---

## How I used AI

I built this mostly inside Claude Code (Opus 4.7), treating it like a **fast but slightly overconfident pair programmer**.

The most useful pattern was:

- discuss architecture first
- push on tradeoffs
- then implement

Where it helped most:

- exploring adapter abstractions (Polaris, Stripe, Prisma, etc.)
- generating repo “skills”
- repair after validation failures
- writing boilerplate

---

## Where AI got things wrong (and how I pushed back)

A few real examples:

### Architecture without constraints

It suggested replacing SDK-based init with a Claude Code skill.

I pushed:

> “This wouldn’t work in CI, right?”

It confirmed that and we reverted to a hybrid approach:

- SDK for headless paths
- skill for interactive

---

### Over-narrow “deterministic V1”

It tried to simplify Polaris into a deterministic-only problem.

That breaks the generality goal, so I pushed to keep:

> LLM = core reasoning layer

---

## What I’d improve with more time

The main direction is making it more **generically useful**:

- add a second adapter (Stripe OpenAPI diff is the obvious one)
- support more languages (tree-sitter)
- baseline store for tracking upstream versions
- better PR summaries (LLM-generated migration notes)
- pass real type definitions into prompts
- build a real eval harness across providers

The rule I’m using:

if it benefits all providers → engine
if it’s specific → adapter

---

## Limitations

- **Patch output is non-deterministic across runs**  
  → evaluation is done on intermediate artifacts (events, plans), not final patches

- **Locator is weaker for relative imports**  
  → needs full import resolution

- **No cost cap yet**  
  → `--max-files` would fix this

---

## Logistics

- TypeScript + pnpm monorepo
- `ts-morph` for indexing
- `@anthropic-ai/sdk` for LLM
- `diff` for patch generation
- `gh` CLI for PRs

---

## What this demonstrates

- designing a system that safely applies AI-generated changes to real codebases
- using AI where it adds value (interpretation, planning) and not where it breaks (diffs, execution)
- building a generic engine with provider-specific adapters and repo-specific context
- closing the loop from upstream change → validated PR
