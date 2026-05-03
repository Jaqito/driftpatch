import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ChangeEvent, RepoSkill } from "../types.js";
import { FilePatchPlanSchema, type FilePatchPlan } from "./types.js";

export const RepairResponseSchema = z.object({
  files: z
    .array(FilePatchPlanSchema)
    .describe(
      "Corrected FilePatchPlan entries. Include only files whose plan changes from the previous attempt; the harness keeps untouched files as-is.",
    ),
  notes: z
    .string()
    .describe("Brief explanation of what went wrong in the previous attempt and how the fix addresses it."),
});
export type RepairResponse = z.infer<typeof RepairResponseSchema>;

const SYSTEM_PROMPT = `You are repairing a failed code patch.

Your previous attempt was applied to the user's repo and the validation step (typecheck / lint / tests, per the repo skill) failed. You'll be given:

- The upstream ChangeEvent(s) that the patch was supposed to address
- The previous FilePatchPlan(s) you produced
- The current contents of each affected file
- The validation output (sliced to the failing portion)

Your job: produce corrected FilePatchPlan entries for the files that need fixing. Files that were correct can be omitted from the output.

Same hard rules as the original patcher:
- oldText must be an EXACT substring of the file shown, appearing exactly once.
- newText preserves indentation and quoting style.
- Don't invent APIs; only reference symbols that exist in the file or in the upstream change definition.
- Use status="manual_review" with notes if you genuinely cannot fix the issue automatically.

Read the validation error carefully. Common causes:
- Type mismatch: the prop type derives from a Polaris/SDK type that may not exist yet in the user's installed types — the patch should still be correct in shape; if not, adjust.
- Missing import: a new symbol was used without importing it.
- Stale pass-through: the wrapper destructures specific props before spread; new prop needs to be in the destructure or omitted from it.
- oldText not unique anymore: the file structure changed; rewrite oldText with more context.

Keep changes minimal — fix only what the validation error is complaining about. Do not refactor or restyle.`;

export interface RepairProposedPatchInput {
  repoPath: string;
  events: ChangeEvent[];
  previousPlans: FilePatchPlan[];
  validationOutput: string;
  skill?: RepoSkill;
}

export interface RepairOptions {
  apiKey?: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "max";
}

export interface RepairResult {
  response: RepairResponse;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export async function repairProposedPatch(
  input: RepairProposedPatchInput,
  opts: RepairOptions = {},
): Promise<RepairResult> {
  const apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set; cannot repair patch.");

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? "claude-opus-4-7";
  const effort = opts.effort ?? "medium";

  const userPrompt = await formatUserPrompt(input);

  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: {
        type: "json_schema",
        schema: zodToJsonSchema(RepairResponseSchema),
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
    throw new Error("Repair model did not return a parseable response");
  }

  return {
    response: RepairResponseSchema.parse(raw),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

async function formatUserPrompt(input: RepairProposedPatchInput): Promise<string> {
  const parts: string[] = [];

  parts.push("# Validation failed after applying the previous patch");
  parts.push("");
  parts.push(input.validationOutput);
  parts.push("");

  parts.push("# Previous patch attempt (FilePatchPlan[])");
  parts.push("");
  parts.push("```json");
  parts.push(JSON.stringify(input.previousPlans, null, 2));
  parts.push("```");
  parts.push("");

  parts.push("# Upstream changes");
  parts.push("");
  parts.push("```json");
  parts.push(
    JSON.stringify(
      input.events.map((e) => ({
        id: e.id,
        provider: e.provider,
        kind: e.kind,
        entity: e.entity,
        fromVersion: e.fromVersion,
        toVersion: e.toVersion,
        description: e.description,
        attributes: e.attributes,
        risk: e.risk,
      })),
      null,
      2,
    ),
  );
  parts.push("```");
  parts.push("");

  parts.push("# Current file contents (post-revert, pre-patch)");
  parts.push("");
  for (const plan of input.previousPlans) {
    if (plan.status !== "patch") continue;
    const fullPath = path.join(input.repoPath, plan.filePath);
    let content: string;
    try {
      content = await readFile(fullPath, "utf8");
    } catch (err) {
      content = `[failed to read: ${describe(err)}]`;
    }
    parts.push(`## \`${plan.filePath}\``);
    parts.push("```");
    parts.push(content);
    parts.push("```");
    parts.push("");
  }

  if (input.skill) {
    parts.push("# Repo skill (relevant subset)");
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
    "Produce a RepairResponse: corrected FilePatchPlan(s) for files that need fixing. Omit files that were already correct. Explain the fix in `notes`.",
  );

  return parts.join("\n");
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
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
