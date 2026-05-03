import { z } from "zod";

export const ReplacementBlockSchema = z.object({
  oldText: z
    .string()
    .describe(
      "EXACT substring of the current file content to replace. Must appear in the file exactly once. Include enough surrounding lines to make the match unambiguous (typically 1-3 lines of context).",
    ),
  newText: z
    .string()
    .describe(
      "Replacement text. Must preserve the file's existing indentation and quoting style. May be empty to delete oldText.",
    ),
  reasoning: z
    .string()
    .describe(
      "One sentence explaining why this change is needed and which ChangeEvent it addresses.",
    ),
  appliesToChangeIds: z
    .array(z.string())
    .describe("ChangeEvent.id values this block addresses (one or more)."),
});
export type ReplacementBlock = z.infer<typeof ReplacementBlockSchema>;

export const FilePatchPlanSchema = z.object({
  filePath: z
    .string()
    .describe("Repo-relative path of the file being patched (echoed from input)."),
  status: z
    .enum(["patch", "skip", "manual_review"])
    .describe(
      "patch: blocks below should be applied. skip: file does not need changes (e.g. change is already present, or change doesn't apply to this usage). manual_review: change requires human judgment we cannot reliably automate.",
    ),
  blocks: z
    .array(ReplacementBlockSchema)
    .describe(
      "Replacement blocks. Empty when status is 'skip' or 'manual_review'. Each block must have a unique oldText match in the file.",
    ),
  notes: z
    .string()
    .describe(
      "Per-file overall reasoning, caveats, or instructions. For 'manual_review' status, explain what the human needs to decide.",
    ),
});
export type FilePatchPlan = z.infer<typeof FilePatchPlanSchema>;
