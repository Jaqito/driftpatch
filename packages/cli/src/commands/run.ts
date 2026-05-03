import { readFile } from "node:fs/promises";
import { genericAdapter } from "@driftpatch/adapter-generic";

export interface RunOptions {
  source: string;
  provider: string;
  skill?: string;
  pr: boolean;
}

export async function runRun(opts: RunOptions): Promise<void> {
  const text = await readFile(opts.source, "utf8");

  if (opts.provider !== "generic") {
    console.log(`[run] non-generic provider '${opts.provider}' not wired yet; using generic`);
  }

  const events = await genericAdapter.parseChangelog({ text });
  console.log(`[run] parsed ${events.length} change events`);
  for (const e of events.slice(0, 5)) {
    console.log(`  - ${e.kind} ${e.entity} (${e.fromVersion} -> ${e.toVersion})`);
  }
  if (events.length > 5) console.log(`  ... and ${events.length - 5} more`);

  if (opts.pr) console.log("[run] --pr requested, but apply/PR pipeline not implemented yet");
}
