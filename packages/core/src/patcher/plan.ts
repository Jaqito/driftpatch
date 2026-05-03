import Anthropic from "@anthropic-ai/sdk";
import type { ChangeEvent, RepoSkill } from "../types.js";
import { FilePatchPlanSchema, type FilePatchPlan } from "./types.js";
import { z } from "zod";

const SYSTEM_PROMPT = `You are an assistant that generates code patches for upstream-library changes.

You receive: a single source file from the user's repo, the upstream ChangeEvent(s) that affect it, the user's repo skill (provider mappings, area patterns, patch policy), and instructions for how to respond.

Your job is to emit ReplacementBlocks (oldText → newText) that, when applied, update the file to handle the upstream change correctly. The harness assembles the unified diff from your blocks deterministically — you do NOT compute line numbers, and you do NOT emit unified-diff hunks. Just emit the substring to find and what to replace it with.

CRITICAL constraints on every ReplacementBlock:

1. **oldText must be an EXACT substring of the current file content.** Copy it byte-for-byte from the file shown. No paraphrasing, no normalizing whitespace, no fixing typos. If the file has a tab, your oldText has a tab. If the file has Windows line endings, match them.

2. **oldText must appear in the file EXACTLY ONCE.** If the change applies to multiple call sites, emit one block per site, with enough surrounding context (1-3 lines typically) in each oldText to make it unique.

3. **newText must preserve indentation and style.** Match the file's existing indent (tabs vs spaces, count). Match its quote style ('single' vs "double"). Match its trailing-comma convention.

4. **Do not invent APIs.** Only reference functions, types, props, attributes, or methods that exist in the new upstream surface (described in ChangeEvent attributes) or that already exist in the user's file.

5. **Do not reformat unrelated code.** Each block should be the minimum surface area needed for the change.

When to use status="skip": the file shouldn't be patched at all (e.g. the change is already present in the file, or the file uses the affected entity in a way the change doesn't apply to).

When to use status="manual_review": the change is real but it requires judgment you cannot make reliably (a behavior change with semantic implications, ambiguous mapping, or refactoring beyond mechanical edit). Explain what the human needs to decide in 'notes'.

When to use status="patch": you are confident the blocks below are correct. Each block addresses one or more ChangeEvent ids.

Output the JSON object matching the schema you'll be told about. No prose outside the structured output.`;

export interface PlanFilePatchInput {
  filePath: string;
  fileContent: string;
  changes: ChangeEvent[];
  skill?: RepoSkill;
}

export interface PlanFilePatchOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
}

export interface PlanFilePatchResult {
  plan: FilePatchPlan;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export async function planFilePatch(
  input: PlanFilePatchInput,
  opts: PlanFilePatchOptions = {},
): Promise<PlanFilePatchResult> {
  const apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set; cannot plan patches.");
  }

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? "claude-opus-4-7";
  const effort = opts.effort ?? "medium";

  const userPrompt = formatUserPrompt(input);

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: {
        type: "json_schema",
        schema: zodToJsonSchema(FilePatchPlanSchema),
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

  const raw = response.parsed_output;
  if (!raw) {
    throw new Error(`Model did not return a parseable patch plan for ${input.filePath}`);
  }

  return {
    plan: FilePatchPlanSchema.parse(raw),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

function formatUserPrompt(input: PlanFilePatchInput): string {
  const parts: string[] = [];

  parts.push(`# Target file\n\n\`${input.filePath}\``);
  parts.push("");
  parts.push("```");
  parts.push(input.fileContent);
  parts.push("```");
  parts.push("");

  parts.push("# Upstream changes affecting this file");
  parts.push("");
  parts.push("```json");
  parts.push(
    JSON.stringify(
      input.changes.map((c) => ({
        id: c.id,
        provider: c.provider,
        kind: c.kind,
        entity: c.entity,
        fromVersion: c.fromVersion,
        toVersion: c.toVersion,
        description: c.description,
        attributes: c.attributes,
        risk: c.risk,
      })),
      null,
      2,
    ),
  );
  parts.push("```");
  parts.push("");

  if (input.skill) {
    parts.push("# Repo skill (relevant subset)");
    parts.push("");
    parts.push("```json");
    parts.push(
      JSON.stringify(
        {
          providerMappings: input.skill.providerMappings,
          patchPolicy: input.skill.patchPolicy,
        },
        null,
        2,
      ),
    );
    parts.push("```");
    parts.push("");
  }

  parts.push("# Your task");
  parts.push("");
  parts.push(
    "Emit a FilePatchPlan that addresses the upstream changes above for this file. Remember the constraints from the system prompt — especially that oldText must be exact and unique.",
  );
  parts.push(
    'If the file is already correct or the change does not apply, status="skip". If you cannot reliably automate the edit, status="manual_review".',
  );

  return parts.join("\n");
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
  if (schema instanceof z.ZodEnum) {
    const values = (schema as z.ZodEnum<[string, ...string[]]>).options;
    return wrap({ type: "string", enum: values });
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodNodeToJsonSchema(schema.unwrap());
    inner["nullable"] = true;
    return wrap(inner);
  }
  if (schema instanceof z.ZodOptional) {
    return zodNodeToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodArray) {
    return wrap({ type: "array", items: zodNodeToJsonSchema(schema.element) });
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
