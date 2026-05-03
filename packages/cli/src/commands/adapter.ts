import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";

const exec = promisify(execFile);

export interface AdapterInitOptions {
  provider: string;
  outDir: string;
  force: boolean;
}

export async function runAdapterInit(opts: AdapterInitOptions): Promise<void> {
  const target = path.resolve(path.join(opts.outDir, `adapter-${opts.provider}`));
  await ensureFresh(target, opts.force);
  await mkdir(path.join(target, "src"), { recursive: true });
  await mkdir(path.join(target, "fixtures"), { recursive: true });
  await mkdir(path.join(target, "test"), { recursive: true });

  await writeFile(path.join(target, "package.json"), packageJsonStub(opts.provider));
  await writeFile(path.join(target, "tsconfig.json"), tsconfigStub());
  await writeFile(path.join(target, "tsup.config.ts"), tsupStub());
  await writeFile(path.join(target, "vitest.config.ts"), vitestStub());
  await writeFile(path.join(target, "src/index.ts"), indexStub(opts.provider));
  await writeFile(path.join(target, "src/parser.ts"), parserStub(opts.provider));
  await writeFile(path.join(target, "src/types.ts"), typesStub());
  await writeFile(path.join(target, "test/parser.test.ts"), testStub(opts.provider));
  await writeFile(path.join(target, "fixtures/.keep"), "");
  await writeFile(path.join(target, "README.md"), readmeStub(opts.provider));

  console.log(`[adapter init] scaffolded ${target}`);
  console.log(`Next:`);
  console.log(`  1. Drop sample changelogs into ${path.join(target, "fixtures")}/`);
  console.log(
    `  2. Run 'driftpatch adapter generate --provider ${opts.provider} --samples ${path.join(target, "fixtures")} --path ${path.dirname(target)}' to draft the parser.`,
  );
  console.log(`  3. Implement fetchChangelog/parseChangelog in src/parser.ts`);
  console.log(`  4. Run 'driftpatch adapter test --provider ${opts.provider} --path ${path.dirname(target)}'`);
}

async function ensureFresh(dir: string, force: boolean): Promise<void> {
  try {
    await stat(dir);
    if (!force) {
      throw new Error(`${dir} already exists. Pass --force to overwrite.`);
    }
  } catch (err) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      if (!force) throw err;
    }
  }
}

export interface AdapterGenerateOptions {
  provider: string;
  samples: string;
  outDir: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
}

export async function runAdapterGenerate(opts: AdapterGenerateOptions): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("[adapter generate] ANTHROPIC_API_KEY not set");
    process.exit(2);
  }

  const adapterDir = path.resolve(path.join(opts.outDir, `adapter-${opts.provider}`));
  const samplesDir = path.resolve(opts.samples);

  let entries: string[];
  try {
    entries = await readdir(samplesDir);
  } catch {
    console.error(`[adapter generate] samples directory not found: ${samplesDir}`);
    process.exit(2);
  }

  const sampleFiles = entries.filter((f) => !f.startsWith("."));
  if (sampleFiles.length === 0) {
    console.error(`[adapter generate] no sample files in ${samplesDir}`);
    process.exit(2);
  }

  const samples: Array<{ name: string; content: string }> = [];
  for (const name of sampleFiles.slice(0, 5)) {
    const content = await readFile(path.join(samplesDir, name), "utf8");
    if (content.length > 32 * 1024) {
      console.warn(`[adapter generate] skipping ${name} (larger than 32KB)`);
      continue;
    }
    samples.push({ name, content });
  }

  console.log(`[adapter generate] sending ${samples.length} sample(s) to Claude ...`);
  const client = new Anthropic({ apiKey });

  const userPrompt = formatGeneratePrompt(opts.provider, samples);

  const response = await client.messages.create({
    model: opts.model ?? "claude-opus-4-7",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "medium" },
    system: [
      {
        type: "text",
        text: GENERATE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = extractCodeBlocks(text);
  if (parsed.parser) {
    await writeFile(path.join(adapterDir, "src/parser.ts"), parsed.parser);
    console.log(`[adapter generate] wrote ${path.join(adapterDir, "src/parser.ts")}`);
  } else {
    console.warn(`[adapter generate] model did not emit a parser block; saving raw response`);
    await writeFile(path.join(adapterDir, ".driftpatch-raw-response.md"), text);
  }
  if (parsed.notes) {
    console.log("\nNotes from the model:");
    console.log(parsed.notes);
  }

  console.log(
    `\n[adapter generate] tokens: in=${response.usage.input_tokens}, out=${response.usage.output_tokens}, cache_read=${response.usage.cache_read_input_tokens ?? 0}, cache_write=${response.usage.cache_creation_input_tokens ?? 0}`,
  );
  console.log(`\nReview src/parser.ts, refine as needed, then add fixtures + tests.`);
}

export interface AdapterTestOptions {
  provider: string;
  outDir: string;
}

export async function runAdapterTest(opts: AdapterTestOptions): Promise<void> {
  const adapterDir = path.resolve(path.join(opts.outDir, `adapter-${opts.provider}`));
  console.log(`[adapter test] running 'pnpm test' in ${adapterDir}`);
  try {
    const { stdout, stderr } = await exec("pnpm", ["test"], {
      cwd: adapterDir,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  } catch (err) {
    if (err instanceof Error) {
      const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      if (e.stdout) process.stdout.write(e.stdout);
      if (e.stderr) process.stderr.write(e.stderr);
    }
    process.exitCode = 1;
  }
}

const GENERATE_SYSTEM_PROMPT = `You are drafting a changelog parser for a DriftPatch ProviderAdapter.

The user will give you 1-5 sample changelog files for a single provider. Your job: write a TypeScript module \`parser.ts\` that exports a \`parseChangelog({ text, metadata }: RawChangelog): ChangeEvent[]\` function which converts those changelogs into structured ChangeEvents.

A ChangeEvent looks like:
\`\`\`ts
type ChangeEvent = {
  id: string;
  provider: string;
  kind: "rename" | "removal" | "signature_change" | "behavior_change" | "new_default" | "deprecation" | "addition";
  entity: string;
  fromVersion: string;
  toVersion: string;
  description: string;
  attributes?: Record<string, unknown>;
  risk: "low" | "medium" | "high";
};
\`\`\`

Output format:
1. A markdown code block tagged \`typescript\` containing the full parser.ts file (imports, types, function).
2. Optionally a "Notes" section explaining edge cases and assumptions.

Hard rules:
- Use only built-in Node and npm packages that are common (e.g., no need to add new deps).
- The parser must be deterministic and side-effect free.
- For each detected change, set risk based on the change kind: removal/signature_change → high, behavior_change/deprecation → medium, addition/new_default/rename → low.
- Use a stable id (hash of provider+kind+entity+versions).
- If the changelog format is ambiguous, write defensive parsing that handles missing fields gracefully.
- Do NOT call external APIs or read files. Pure function.`;

function formatGeneratePrompt(provider: string, samples: Array<{ name: string; content: string }>): string {
  const parts: string[] = [];
  parts.push(`# Provider: ${provider}`);
  parts.push("");
  parts.push("# Sample changelogs");
  parts.push("");
  for (const sample of samples) {
    parts.push(`## ${sample.name}`);
    parts.push("```");
    parts.push(sample.content);
    parts.push("```");
    parts.push("");
  }
  parts.push("# Your task");
  parts.push("");
  parts.push("Write a parseChangelog function that converts changelogs of this shape into ChangeEvent[]. Output the full parser.ts file as a single typescript code block, then any notes about edge cases.");
  return parts.join("\n");
}

interface ExtractedBlocks {
  parser: string | null;
  notes: string | null;
}

function extractCodeBlocks(text: string): ExtractedBlocks {
  const tsMatch = /```(?:typescript|ts)\s*\n([\s\S]*?)```/i.exec(text);
  const parser = tsMatch ? tsMatch[1]!.trim() : null;
  const notesMatch = /(?:Notes|notes):?\s*([\s\S]*?)$/i.exec(text);
  const notes = notesMatch ? notesMatch[1]!.trim() : null;
  return { parser, notes };
}

function packageJsonStub(provider: string): string {
  return `${JSON.stringify(
    {
      name: `@driftpatch-example/adapter-${provider}`,
      version: "0.0.0",
      private: true,
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      files: ["dist", "fixtures"],
      scripts: {
        build: "tsup",
        typecheck: "tsc --noEmit",
        test: "vitest run",
      },
      dependencies: {
        "@driftpatch/adapter-sdk": "workspace:*",
        "@driftpatch/core": "workspace:*",
      },
      devDependencies: {
        tsx: "^4.19.2",
        vitest: "^2.1.5",
      },
    },
    null,
    2,
  )}\n`;
}

function tsconfigStub(): string {
  return `${JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: { outDir: "dist" },
      include: ["src/**/*"],
    },
    null,
    2,
  )}\n`;
}

function tsupStub(): string {
  return `import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
`;
}

function vitestStub(): string {
  return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
`;
}

function indexStub(provider: string): string {
  return `import { defineAdapter } from "@driftpatch/adapter-sdk";
import { parseChangelog } from "./parser.js";

export const ${camelCase(provider)}Adapter = defineAdapter({
  name: "${provider}",
  versionRange: "*",
  conventions: {
    // TODO: fill in entityPrefix and namingStyle for this provider
  },
  parseChangelog,
});

export { parseChangelog } from "./parser.js";
`;
}

function parserStub(provider: string): string {
  return `import type { ChangeEvent } from "@driftpatch/core";
import type { RawChangelog } from "@driftpatch/adapter-sdk";

/**
 * Parse a raw ${provider} changelog into ChangeEvents.
 *
 * TODO: implement. Run 'driftpatch adapter generate --provider ${provider} --samples ./fixtures'
 * to get a draft from Claude based on real sample changelogs.
 */
export function parseChangelog(_raw: RawChangelog): ChangeEvent[] {
  return [];
}
`;
}

function typesStub(): string {
  return `// Internal types for the adapter implementation. Add as needed.\n`;
}

function testStub(provider: string): string {
  return `import { describe, expect, it } from "vitest";
import { parseChangelog } from "../src/parser.js";

describe("${provider} parseChangelog", () => {
  it("returns an empty array for an empty changelog", () => {
    expect(parseChangelog({ text: "" })).toEqual([]);
  });

  // TODO: drop sample changelogs into ./fixtures/ and add fixture-driven tests.
});
`;
}

function readmeStub(provider: string): string {
  return `# adapter-${provider}

DriftPatch adapter for the **${provider}** upstream provider.

## What this adapter does

- Fetches upstream changelog artifacts (implement \`fetchChangelog\` in \`src/parser.ts\`)
- Parses them into structured \`ChangeEvent[]\` (implement \`parseChangelog\` in \`src/parser.ts\`)
- Optionally implements \`summarize(index)\` to expose ${provider}-specific affinity to the engine

## FDE workflow

1. Drop 2-3 real ${provider} changelogs into \`./fixtures/\` (anything that represents the upstream's actual format)
2. Run \`driftpatch adapter generate --provider ${provider} --samples ./fixtures\` to get a Claude-drafted \`parser.ts\`
3. Review and refine the parser
4. Add fixture-driven assertions in \`test/parser.test.ts\`
5. Run \`pnpm test\` to verify
6. Wire the adapter into the customer's \`driftpatch run\` invocation
`;
}

function camelCase(s: string): string {
  return s.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}
