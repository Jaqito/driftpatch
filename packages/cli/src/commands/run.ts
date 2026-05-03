import { readFile } from "node:fs/promises";
import { genericAdapter } from "@driftpatch/adapter-generic";
import type { ProviderAdapter, RawChangelog } from "@driftpatch/adapter-sdk";
import {
  indexRepo,
  locate,
  type ChangeEvent,
  type ImpactCandidate,
  type ProviderConventionsHint,
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

  const conventions: ProviderConventionsHint = {
    entityPrefix: adapter.conventions.entityPrefix,
    namingStyle: adapter.conventions.namingStyle,
  };

  console.log("\n=== Impact report ===");
  let totalCandidates = 0;
  for (const event of events) {
    const candidates = locate(event, index, {
      conventions,
      providerAliases: [adapter.name],
    });
    if (candidates.length === 0) continue;
    totalCandidates += candidates.length;
    printChangeImpact(event, candidates);
  }

  if (totalCandidates === 0) {
    console.log("(no impacted files in this repo)");
  } else {
    console.log(`\n[run] ${totalCandidates} impact candidate(s) across all events`);
  }

  if (opts.pr) console.log("\n[run] --pr requested but apply/PR pipeline not implemented yet");
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

function printChangeImpact(event: ChangeEvent, candidates: ImpactCandidate[]): void {
  console.log(`\n[${event.kind} risk:${event.risk}] ${event.entity}`);
  if (event.description) console.log(`  ${event.description}`);
  for (const c of candidates) {
    const symbols = c.matchedSymbols.length > 0 ? ` [${c.matchedSymbols.join(", ")}]` : "";
    console.log(`  → ${c.filePath} (confidence: ${c.confidence})${symbols}`);
    console.log(`      ${c.reason}`);
  }
}
