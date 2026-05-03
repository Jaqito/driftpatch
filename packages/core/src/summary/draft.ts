import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { RepoSummary } from "./types.js";

export const SkillDraftSchema = z.object({
  oneLineDescription: z
    .string()
    .describe("One-sentence description of what this repo is and does."),
  areas: z
    .array(
      z.object({
        path: z.string().describe("Top-level directory path"),
        name: z.string().describe("Short kebab-case name for this area"),
        pattern: z
          .string()
          .describe("One sentence describing what this directory contains and its role"),
      }),
    )
    .describe(
      "Per-area descriptions, one entry per top-level directory worth naming. Skip directories that are obviously generated, vendored, or test fixtures.",
    ),
  providerMappings: z
    .array(
      z.object({
        provider: z.string().describe("Provider name, e.g. 'polaris'"),
        entries: z.array(
          z.object({
            upstreamEntity: z
              .string()
              .describe("Upstream identifier, e.g. 's-button' or 'messages.create'"),
            localFile: z
              .string()
              .nullable()
              .describe(
                "Path of the canonical wrapper file in this repo, or null if no clear canonical exists among the candidates",
              ),
            reasoning: z
              .string()
              .describe("Brief reason for picking this candidate (or null)"),
          }),
        ),
      }),
    )
    .describe(
      "For each provider, pick the canonical local wrapper for each upstream entity from the candidates surfaced in the summary. If multiple candidates and no clear winner, pick the one with the highest score and explain. If genuinely no good match, set localFile to null.",
    ),
  suggestedExclusions: z
    .array(
      z.object({
        path: z.string(),
        reason: z.string(),
      }),
    )
    .describe(
      "Directories that DriftPatch should ignore (e.g. legacy/, vendor/, generated/). Only suggest exclusions with strong evidence — directory names containing 'legacy', 'vendor', 'generated', '__generated__', 'fixtures', '.snapshots', etc.",
    ),
});

export type SkillDraft = z.infer<typeof SkillDraftSchema>;

const SYSTEM_PROMPT = `You are an assistant that drafts repo skills for DriftPatch, a tool that turns upstream changes (e.g. Shopify Polaris updates, Stripe SDK changes) into reviewable code patches.

A repo skill is a per-repo configuration file that tells DriftPatch how a specific repo is shaped. Most fields (name, language, package manager, scripts, validation commands) are extracted deterministically. Your job is to fill in the parts that need human-style judgment from a structured RepoSummary you'll be given.

Your output goes into the schema you'll be told about, with these sections:

1. **One-line description** — what is this repo? Be concrete; avoid marketing fluff.

2. **Areas** — for each meaningful top-level directory, write a short name and a one-sentence pattern describing what's in it (e.g. "React wrappers around Shopify Polaris web components"). Skip directories that are obviously generated, vendored, or pure test fixtures. Look at the example file snippets to ground your descriptions.

3. **Provider mappings** — for each provider in providersDetected, look at its wrapperCandidates. For each upstreamEntity, pick the candidate that's most likely the canonical wrapper file in THIS repo. The candidates are scored — prefer higher scores, but use your judgment if the top candidate looks like a story file or test or shadcn-style copy. If no candidate is genuinely the right answer, set localFile to null. Always include a brief reasoning.

4. **Suggested exclusions** — only suggest excluding a directory when there's strong evidence (the path contains "legacy", "vendor", "generated", "__generated__", ".snapshots", or is clearly a fixtures/test directory based on the example files). Don't speculate.

Guidelines:
- Be concise. Each pattern/description is one sentence.
- Don't speculate. If the data doesn't tell you something clearly, say so or skip it.
- The repo skill will guide future automated patches, so wrong guesses are worse than blank fields.
- Output must conform exactly to the schema.`;

export interface DraftSkillOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
}

export interface DraftSkillResult {
  draft: SkillDraft;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export async function draftSkill(
  summary: RepoSummary,
  opts: DraftSkillOptions = {},
): Promise<DraftSkillResult> {
  const apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Pass --api-key or set the env var to draft a skill.",
    );
  }

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? "claude-opus-4-7";
  const effort = opts.effort ?? "medium";

  const userPrompt = formatUserPrompt(summary);

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: {
        type: "json_schema",
        schema: zodToJsonSchema(SkillDraftSchema),
      },
    },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const draft = response.parsed_output;
  if (!draft) {
    throw new Error("Model did not return a parseable skill draft");
  }

  return {
    draft: SkillDraftSchema.parse(draft),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function formatUserPrompt(summary: RepoSummary): string {
  return [
    "Here is the structured RepoSummary for the repository. Use it to fill in the skill draft per the schema.",
    "",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
  ].join("\n");
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodNodeToJsonSchema(schema);
}

function zodNodeToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const description = schema.description;
  const wrap = (out: Record<string, unknown>) => {
    if (description) out["description"] = description;
    return out;
  };

  if (schema instanceof z.ZodString) return wrap({ type: "string" });
  if (schema instanceof z.ZodNumber) return wrap({ type: "number" });
  if (schema instanceof z.ZodBoolean) return wrap({ type: "boolean" });
  if (schema instanceof z.ZodNull) return wrap({ type: "null" });

  if (schema instanceof z.ZodNullable) {
    const inner = zodNodeToJsonSchema(schema.unwrap());
    inner["nullable"] = true;
    return wrap(inner);
  }
  if (schema instanceof z.ZodOptional) {
    return zodNodeToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodArray) {
    return wrap({
      type: "array",
      items: zodNodeToJsonSchema(schema.element),
    });
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodNodeToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return wrap({
      type: "object",
      properties,
      required,
      additionalProperties: false,
    });
  }
  return wrap({});
}
