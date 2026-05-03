import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { genericAdapter } from "@driftpatch/adapter-generic";
import {
  draftSkill,
  extractRepoSummary,
  indexRepo,
  mergeSkill,
  serializeSkillToMarkdown,
  type SummaryAdapter,
} from "@driftpatch/core";
import { polarisAdapter } from "@driftpatch-example/adapter-polaris";

export interface InitOptions {
  repo: string;
  dryRun: boolean;
  out?: string;
  pretty: boolean;
  effort?: "low" | "medium" | "high" | "max";
  force: boolean;
}

const ADAPTERS_FOR_SUMMARY: SummaryAdapter[] = [
  {
    name: "polaris",
    summarize: polarisAdapter.summarize,
  },
  {
    name: "generic",
    packagesHint: [],
  },
];
void genericAdapter;

export async function runInit(opts: InitOptions): Promise<void> {
  console.log(`[init] indexing ${opts.repo} ...`);
  const t0 = Date.now();
  const index = await indexRepo(opts.repo, { useCache: true });
  console.log(
    `[init] indexed ${index.files.length} files in ${Date.now() - t0}ms (sha=${index.sha.slice(0, 8)}${index.dirty ? "-dirty" : ""})`,
  );

  console.log(`[init] extracting summary ...`);
  const t1 = Date.now();
  const summary = await extractRepoSummary(opts.repo, index, {
    adapters: ADAPTERS_FOR_SUMMARY,
  });
  console.log(`[init] summary extracted in ${Date.now() - t1}ms`);

  console.log("\n=== RepoSummary ===");
  console.log(`name: ${summary.name}`);
  console.log(`language: ${summary.language}`);
  console.log(`packageManager: ${summary.packageManager}`);
  console.log(`validationCandidates: ${summary.validationCandidates.join(", ") || "(none)"}`);

  console.log(`\ntopDirs (${summary.topDirs.length}):`);
  for (const d of summary.topDirs) {
    console.log(`  ${d.path}: ${d.tsxFiles}.tsx + ${d.tsFiles}.ts + ${d.otherFiles} other`);
  }

  console.log(`\nproviders detected (${summary.providersDetected.length}):`);
  for (const p of summary.providersDetected) {
    console.log(`  ${p.name} (${p.packages.join(", ")})`);
    console.log(`    files importing directly: ${p.filesUsing.length}`);
    if (p.affinity.jsx) {
      console.log(`    JSX components: ${p.affinity.jsx.components.length}`);
    }
    if (p.affinity.callSites?.length) {
      console.log(`    call sites: ${p.affinity.callSites.length}`);
    }
    if (p.affinity.literals?.length) {
      console.log(`    string literals: ${p.affinity.literals.length}`);
    }
    if (p.wrapperCandidates) {
      console.log(`    wrapper candidates: ${p.wrapperCandidates.length} elements`);
    }
  }

  console.log(`\nareas (${summary.areaCandidates.length}):`);
  for (const a of summary.areaCandidates) {
    console.log(`  ${a.path}: ${a.fileCount} files; sample: ${a.exampleFiles.join(", ")}`);
  }

  if (opts.out) {
    const outPath = path.resolve(opts.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(summary, null, opts.pretty ? 2 : 0));
    console.log(`\n[init] wrote summary to ${outPath}`);
  }

  if (opts.dryRun) {
    return;
  }

  const skillPath = path.join(path.resolve(opts.repo), "driftpatch.skill.md");
  if (!opts.force) {
    try {
      const fs = await import("node:fs/promises");
      await fs.stat(skillPath);
      console.error(
        `\n[init] ${skillPath} already exists. Re-run with --force to overwrite.`,
      );
      process.exit(2);
    } catch {
      // file doesn't exist, continue
    }
  }

  console.log("\n[init] drafting skill via Claude (this calls the API) ...");
  const t2 = Date.now();
  const result = await draftSkill(summary, { effort: opts.effort });
  console.log(
    `[init] draft returned in ${Date.now() - t2}ms (in=${result.usage.inputTokens}, out=${result.usage.outputTokens}, cache_read=${result.usage.cacheReadInputTokens}, cache_write=${result.usage.cacheCreationInputTokens})`,
  );

  const skill = mergeSkill(summary, result.draft);
  const markdown = serializeSkillToMarkdown(skill);

  await writeFile(skillPath, markdown);
  console.log(`\n[init] wrote ${skillPath}`);
  console.log(
    `[init] ${skill.areas.length} areas, ${Object.keys(skill.providerMappings).length} providers mapped, ${skill.validation.commands.length} validation commands`,
  );
  console.log(
    "[init] review the file, then run 'driftpatch run --provider <name> --from <ver> --to <ver> --repo .'",
  );
}
