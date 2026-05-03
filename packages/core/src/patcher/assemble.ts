import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPatch } from "diff";
import type { FilePatchPlan, ReplacementBlock } from "./types.js";

export interface AssembledFilePatch {
  filePath: string;
  status: "applied" | "skipped" | "manual_review" | "error";
  diff: string;
  errors: string[];
  blocksApplied: number;
  notes: string;
}

export interface AssembledPatch {
  unifiedDiff: string;
  files: AssembledFilePatch[];
}

export interface AssembleOptions {
  repoPath: string;
}

export async function assemblePatch(
  plans: FilePatchPlan[],
  opts: AssembleOptions,
): Promise<AssembledPatch> {
  const files: AssembledFilePatch[] = [];

  for (const plan of plans) {
    files.push(await assembleSingleFile(plan, opts.repoPath));
  }

  const unifiedDiff = files
    .filter((f) => f.status === "applied")
    .map((f) => f.diff)
    .join("");

  return { unifiedDiff, files };
}

async function assembleSingleFile(
  plan: FilePatchPlan,
  repoPath: string,
): Promise<AssembledFilePatch> {
  const fullPath = path.join(repoPath, plan.filePath);

  if (plan.status === "skip") {
    return {
      filePath: plan.filePath,
      status: "skipped",
      diff: "",
      errors: [],
      blocksApplied: 0,
      notes: plan.notes,
    };
  }

  if (plan.status === "manual_review") {
    return {
      filePath: plan.filePath,
      status: "manual_review",
      diff: "",
      errors: [],
      blocksApplied: 0,
      notes: plan.notes,
    };
  }

  let original: string;
  try {
    original = await readFile(fullPath, "utf8");
  } catch (err) {
    return {
      filePath: plan.filePath,
      status: "error",
      diff: "",
      errors: [`failed to read file: ${describeError(err)}`],
      blocksApplied: 0,
      notes: plan.notes,
    };
  }

  const errors: string[] = [];
  let working = original;
  let applied = 0;

  for (const [i, block] of plan.blocks.entries()) {
    const result = applyBlock(working, block, i);
    if (typeof result === "string") {
      working = result;
      applied += 1;
    } else {
      errors.push(result);
    }
  }

  if (errors.length > 0 && applied === 0) {
    return {
      filePath: plan.filePath,
      status: "error",
      diff: "",
      errors,
      blocksApplied: 0,
      notes: plan.notes,
    };
  }

  const diff = createPatch(plan.filePath, original, working, "", "", { context: 3 });

  return {
    filePath: plan.filePath,
    status: errors.length > 0 ? "error" : "applied",
    diff,
    errors,
    blocksApplied: applied,
    notes: plan.notes,
  };
}

type ApplyResult = string | string;

function applyBlock(content: string, block: ReplacementBlock, index: number): ApplyResult {
  if (block.oldText.length === 0) {
    return `block #${index}: oldText is empty`;
  }
  const occurrences = countOccurrences(content, block.oldText);
  if (occurrences === 0) {
    return `block #${index}: oldText not found in file (got ${truncated(block.oldText)})`;
  }
  if (occurrences > 1) {
    return `block #${index}: oldText matches ${occurrences} times; needs more context (got ${truncated(block.oldText)})`;
  }
  return content.replace(block.oldText, block.newText);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while (true) {
    const found = haystack.indexOf(needle, pos);
    if (found === -1) break;
    count += 1;
    pos = found + needle.length;
  }
  return count;
}

function truncated(text: string, max = 80): string {
  const single = text.replace(/\n/g, "\\n");
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
