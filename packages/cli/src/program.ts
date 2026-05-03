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
    .description(
      "Generate a draft repo skill. Without --dry-run, calls Claude and writes driftpatch.skill.md.",
    )
    .option("--repo <path>", "repo path", ".")
    .option(
      "--dry-run",
      "extract and print summary only; do not call LLM or write skill",
      false,
    )
    .option("--out <path>", "write the summary JSON to this path (debug)")
    .option("--pretty", "pretty-print the JSON output", false)
    .option("--effort <level>", "LLM effort level: low, medium, high, max", "medium")
    .option("--model <id>", "Claude model id (e.g. claude-sonnet-4-6 for cheaper testing)")
    .option("--force", "overwrite an existing driftpatch.skill.md", false)
    .action(async (opts) => {
      await runInit({
        repo: opts.repo,
        dryRun: Boolean(opts.dryRun),
        out: opts.out,
        pretty: Boolean(opts.pretty),
        effort: opts.effort,
        model: opts.model,
        force: Boolean(opts.force),
      });
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
    .option("--patch", "generate proposed patch via LLM after impact report", false)
    .option("--effort <level>", "patch LLM effort: low|medium|high|max", "medium")
    .option("--model <id>", "Claude model id for the patcher (e.g. claude-sonnet-4-6 for cheaper testing)")
    .option(
      "--min-confidence <level>",
      "patch only impacts at this confidence or higher (low|medium|high)",
      "high",
    )
    .option("--validate", "apply patch + run skill validation commands; revert after", false)
    .option("--repair", "if validation fails, ask LLM for one repair attempt and re-validate", false)
    .option("--allow-dirty", "skip clean-tree check before validating (use with care)", false)
    .option("--pr", "open a PR after applying", false)
    .action(async (opts) => {
      await runRun({
        source: opts.source,
        from: opts.from,
        to: opts.to,
        provider: opts.provider,
        repo: opts.repo,
        skill: opts.skill,
        patch: Boolean(opts.patch),
        effort: opts.effort,
        model: opts.model,
        minConfidence: opts.minConfidence,
        validate: Boolean(opts.validate),
        repair: Boolean(opts.repair),
        allowDirty: Boolean(opts.allowDirty),
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
