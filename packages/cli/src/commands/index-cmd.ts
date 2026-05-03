import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { indexRepo, serializeIndex } from "@driftpatch/core";

export interface IndexCommandOptions {
  repo: string;
  out?: string;
  pretty: boolean;
  noCache: boolean;
}

export async function runIndex(opts: IndexCommandOptions): Promise<void> {
  const start = Date.now();
  const index = await indexRepo(opts.repo, { useCache: !opts.noCache });
  const elapsed = Date.now() - start;

  const serialized = serializeIndex(index);
  const summary = {
    sha: serialized.sha,
    dirty: serialized.dirty,
    files: serialized.files.length,
    importsByFile: Object.keys(serialized.importsByFile).length,
    packagesUsed: Object.keys(serialized.filesByPackage).length,
    symbols: Object.values(serialized.symbols).reduce((n, arr) => n + arr.length, 0),
    jsxUsages: serialized.jsxUsages.length,
    stringLiterals: serialized.stringLiterals.length,
    elapsedMs: elapsed,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (opts.out) {
    const out = path.resolve(opts.out);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, JSON.stringify(serialized, null, opts.pretty ? 2 : 0));
    console.log(`\nWrote index to ${out}`);
  }
}
