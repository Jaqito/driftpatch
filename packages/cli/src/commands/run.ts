import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { genericAdapter } from "@driftpatch/adapter-generic";
import type { ProviderAdapter, RawChangelog } from "@driftpatch/adapter-sdk";
import {
  indexRepo,
  loadSkill,
  locate,
  proposePatch,
  type ChangeEvent,
  type FilePatchPlan,
  type ImpactCandidate,
  type ProviderConventionsHint,
  type RepoSkill,
} from "@driftpatch/core";
import { polarisAdapter } from "@driftpatch-example/adapter-polaris";

export interface RunOptions {
  source?: string;
  from?: string;
  to?: string;
  provider: string;
  repo?: string;
  skill?: string;
  pr: boolean;
  patch: boolean;
  effort?: "low" | "medium" | "high" | "max";
  model?: string;
  minConfidence: "low" | "medium" | "high";
}

const ADAPTERS: Record<string, ProviderAdapter> = {
  generic: genericAdapter,
  polaris: polarisAdapter,
};

export async function runRun(opts: RunOptions): Promise<void> {
  const adapter = ADAPTERS[opts.provider];
  if (!adapter) {
    console.error(`Unknown provider '${opts.provider}'. Known: ${Object.keys(ADAPTERS).join(", ")}`);
    process.exit(2);
  }

  const events = await loadEvents(adapter, opts);
  console.log(`[run] ${events.length} change event(s) from ${adapter.name}`);
  for (const e of events.slice(0, 10)) {
    console.log(`  - [${e.kind} risk:${e.risk}] ${e.entity}`);
    if (e.description) console.log(`      ${e.description}`);
  }
  if (events.length > 10) console.log(`  ... and ${events.length - 10} more`);

  if (!opts.repo) {
    console.log("\n[run] no --repo provided; skipping locate step");
    if (opts.pr) console.log("[run] --pr requested but apply/PR pipeline not implemented yet");
    return;
  }

  console.log(`\n[run] indexing ${opts.repo} ...`);
  const index = await indexRepo(opts.repo, { useCache: true });
  console.log(
    `[run] indexed ${index.files.length} files (${index.jsxUsages.length} JSX usages, sha=${index.sha.slice(0, 8)}${index.dirty ? "-dirty" : ""})`,
  );

  const skill = await loadOptionalSkill(opts.repo, opts.skill);
  if (skill) {
    const skillSummary = `${skill.areas.length} areas, ${Object.keys(skill.providerMappings).length} providers mapped`;
    console.log(`[run] loaded skill (${skillSummary})`);
  } else {
    console.log("[run] no driftpatch.skill.md found; running without skill");
  }

  const conventions: ProviderConventionsHint = {
    entityPrefix: adapter.conventions.entityPrefix,
    namingStyle: adapter.conventions.namingStyle,
  };

  console.log("\n=== Impact report ===");
  const candidatesByEvent = new Map<string, ImpactCandidate[]>();
  let totalCandidates = 0;
  for (const event of events) {
    const candidates = locate(event, index, {
      conventions,
      providerAliases: [adapter.name],
      ...(skill ? { skill } : {}),
    });
    if (candidates.length === 0) continue;
    candidatesByEvent.set(event.id, candidates);
    totalCandidates += candidates.length;
    printChangeImpact(event, candidates);
  }

  if (totalCandidates === 0) {
    console.log("(no impacted files in this repo)");
    return;
  }
  console.log(`\n[run] ${totalCandidates} impact candidate(s) across all events`);

  if (!opts.patch) {
    console.log("[run] --patch not set; stopping after impact report. Pass --patch to generate proposed.patch.");
    return;
  }

  const patchModel = opts.model ?? "claude-opus-4-7";
  console.log(
    `\n[run] generating patch via ${patchModel} (min confidence: ${opts.minConfidence}) ...`,
  );
  const result = await proposePatch(
    {
      repoPath: path.resolve(opts.repo),
      events,
      candidatesByEvent,
      minConfidence: opts.minConfidence,
      ...(skill ? { skill } : {}),
    },
    {
      ...(opts.effort ? { effort: opts.effort } : {}),
      model: patchModel,
      onFileStart: (file, total, idx) => {
        console.log(`  [${idx + 1}/${total}] planning patch for ${file} ...`);
      },
      onFileDone: (file, plan) => {
        const blockSummary = plan.status === "patch" ? `${plan.blocks.length} blocks` : plan.status;
        console.log(`    → ${file}: ${blockSummary}`);
      },
    },
  );

  for (const skip of result.skipped) {
    console.log(`  [skip] ${skip.filePath}: ${skip.reason}`);
  }

  await writeArtifacts(opts.repo, result.patch.unifiedDiff, result.plans);

  const applied = result.patch.files.filter((f) => f.status === "applied").length;
  const failed = result.patch.files.filter((f) => f.status === "error").length;
  const review = result.patch.files.filter((f) => f.status === "manual_review").length;
  const skippedFiles = result.patch.files.filter((f) => f.status === "skipped").length;

  console.log(
    `\n[run] patch results: ${applied} applied · ${failed} errored · ${review} manual review · ${skippedFiles} skipped`,
  );
  console.log(
    `[run] tokens: in=${result.totalUsage.inputTokens}, out=${result.totalUsage.outputTokens}, cache_read=${result.totalUsage.cacheReadInputTokens}, cache_write=${result.totalUsage.cacheCreationInputTokens}`,
  );

  if (failed > 0) {
    console.log("\n[run] errors:");
    for (const file of result.patch.files) {
      if (file.status === "error") {
        for (const err of file.errors) console.log(`  ${file.filePath}: ${err}`);
      }
    }
  }

  if (opts.pr) console.log("\n[run] --pr requested but apply/PR pipeline not implemented yet");
}

async function writeArtifacts(
  repoPath: string,
  unifiedDiff: string,
  plans: FilePatchPlan[],
): Promise<void> {
  const outDir = path.join(path.resolve(repoPath), ".driftpatch");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "proposed.patch"), unifiedDiff);
  await writeFile(
    path.join(outDir, "patch-plan.json"),
    JSON.stringify(plans, null, 2),
  );
  console.log(`\n[run] wrote ${path.join(outDir, "proposed.patch")}`);
  console.log(`[run] wrote ${path.join(outDir, "patch-plan.json")}`);
}

async function loadEvents(adapter: ProviderAdapter, opts: RunOptions): Promise<ChangeEvent[]> {
  if (opts.source) {
    const text = await readFile(opts.source, "utf8");
    return Promise.resolve(adapter.parseChangelog({ text }));
  }
  if (opts.from && opts.to) {
    if (!adapter.fetchChangelog) {
      console.error(
        `Adapter '${adapter.name}' does not implement fetchChangelog; pass --source instead.`,
      );
      process.exit(2);
    }
    console.log(`[run] fetching ${adapter.name} changelog ${opts.from} → ${opts.to} ...`);
    const raw = await adapter.fetchChangelog(opts.from, opts.to);
    return Promise.resolve(adapter.parseChangelog(raw as RawChangelog));
  }
  console.error("[run] need either --source <file> or --from <ver> --to <ver>");
  process.exit(2);
}

async function loadOptionalSkill(
  repoPath: string,
  override: string | undefined,
): Promise<RepoSkill | null> {
  const skillPath = override ?? path.join(path.resolve(repoPath), "driftpatch.skill.md");
  try {
    const result = await loadSkill(skillPath);
    if (result.warnings.length > 0) {
      for (const w of result.warnings) console.warn(`[run] skill warning: ${w}`);
    }
    return result.skill;
  } catch (err) {
    if (override) {
      console.error(`[run] failed to load --skill ${override}: ${describeError(err)}`);
      process.exit(2);
    }
    return null;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if ("code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return "not found";
    return err.message;
  }
  return String(err);
}

function printChangeImpact(event: ChangeEvent, candidates: ImpactCandidate[]): void {
  console.log(`\n[${event.kind} risk:${event.risk}] ${event.entity}`);
  if (event.description) console.log(`  ${event.description}`);
  for (const c of candidates) {
    const symbols = c.matchedSymbols.length > 0 ? ` [${c.matchedSymbols.join(", ")}]` : "";
    console.log(`  → ${c.filePath} (confidence: ${c.confidence})${symbols}`);
    console.log(`      ${c.reason}`);
  }
}
