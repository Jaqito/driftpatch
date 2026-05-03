import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runRun } from "./commands/run.js";
import { runIndex } from "./commands/index-cmd.js";
import { runAdapterInit, runAdapterGenerate, runAdapterTest } from "./commands/adapter.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("driftpatch")
    .description("Turn upstream changes into reviewable, validated patches.")
    .version("0.0.0");

  program
    .command("init")
    .description("Generate a draft repo skill interactively")
    .option("--repo <path>", "repo path", ".")
    .action(async (opts) => {
      await runInit({ repo: opts.repo });
    });

  program
    .command("index")
    .description("Build the RepoIndex and print summary; optionally dump JSON")
    .option("--repo <path>", "repo path", ".")
    .option("--out <path>", "write full index JSON to this path")
    .option("--pretty", "pretty-print the JSON output", false)
    .option("--no-cache", "rebuild even if a cached index exists")
    .action(async (opts) => {
      await runIndex({
        repo: opts.repo,
        out: opts.out,
        pretty: Boolean(opts.pretty),
        noCache: !opts.cache,
      });
    });

  program
    .command("run")
    .description("Ingest a changelog, generate and validate a patch")
    .option("--source <path>", "changelog file (alternative to --from/--to)")
    .option("--from <ver>", "previous version (calls adapter.fetchChangelog)")
    .option("--to <ver>", "current/target version (calls adapter.fetchChangelog)")
    .option("--provider <name>", "provider adapter name", "generic")
    .option("--repo <path>", "target repo to index and locate against")
    .option("--skill <path>", "override skill file path")
    .option("--pr", "open a PR after applying", false)
    .action(async (opts) => {
      await runRun({
        source: opts.source,
        from: opts.from,
        to: opts.to,
        provider: opts.provider,
        repo: opts.repo,
        skill: opts.skill,
        pr: Boolean(opts.pr),
      });
    });

  const adapter = program.command("adapter").description("Adapter authoring");
  adapter
    .command("init")
    .requiredOption("--provider <name>", "provider name")
    .action(async (opts) => {
      await runAdapterInit({ provider: opts.provider });
    });
  adapter
    .command("generate")
    .requiredOption("--provider <name>", "provider name")
    .requiredOption("--samples <dir>", "directory of sample changelogs")
    .action(async (opts) => {
      await runAdapterGenerate({ provider: opts.provider, samples: opts.samples });
    });
  adapter
    .command("test")
    .requiredOption("--provider <name>", "provider name")
    .action(async (opts) => {
      await runAdapterTest({ provider: opts.provider });
    });

  return program;
}
