import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChangeEvent, ImpactCandidate, RepoSkill } from "../types.js";
import { assemblePatch, type AssembledPatch } from "./assemble.js";
import { planFilePatch, type PlanFilePatchOptions } from "./plan.js";
import type { FilePatchPlan } from "./types.js";

export interface ImpactedChangeFile {
  filePath: string;
  changes: ChangeEvent[];
  candidates: ImpactCandidate[];
}

export interface ProposePatchInput {
  repoPath: string;
  events: ChangeEvent[];
  candidatesByEvent: Map<string, ImpactCandidate[]>;
  skill?: RepoSkill;
  minConfidence?: "low" | "medium" | "high";
  maxFileBytes?: number;
}

export interface ProposePatchProgress {
  onFileStart?: (file: string, total: number, index: number) => void;
  onFileDone?: (file: string, plan: FilePatchPlan) => void;
}

export interface ProposePatchResult {
  patch: AssembledPatch;
  plans: FilePatchPlan[];
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
  skipped: Array<{ filePath: string; reason: string }>;
}

const DEFAULT_MAX_FILE_BYTES = 64 * 1024;

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

export async function proposePatch(
  input: ProposePatchInput,
  opts: PlanFilePatchOptions & ProposePatchProgress = {},
): Promise<ProposePatchResult> {
  const minConfidence = input.minConfidence ?? "high";
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const grouped = groupByFile(input, minConfidence);
  const plans: FilePatchPlan[] = [];
  const skipped: Array<{ filePath: string; reason: string }> = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;

  for (const [i, file] of grouped.entries()) {
    opts.onFileStart?.(file.filePath, grouped.length, i);

    const fullPath = path.join(input.repoPath, file.filePath);
    let fileContent: string;
    try {
      fileContent = await readFile(fullPath, "utf8");
    } catch (err) {
      skipped.push({
        filePath: file.filePath,
        reason: `failed to read: ${describeError(err)}`,
      });
      continue;
    }
    if (fileContent.length > maxFileBytes) {
      skipped.push({
        filePath: file.filePath,
        reason: `file too large (${fileContent.length} > ${maxFileBytes} bytes); skipping in V1`,
      });
      continue;
    }

    const result = await planFilePatch(
      {
        filePath: file.filePath,
        fileContent,
        changes: file.changes,
        ...(input.skill ? { skill: input.skill } : {}),
      },
      opts,
    );
    plans.push(result.plan);
    totalIn += result.usage.inputTokens;
    totalOut += result.usage.outputTokens;
    totalCacheRead += result.usage.cacheReadInputTokens;
    totalCacheWrite += result.usage.cacheCreationInputTokens;
    opts.onFileDone?.(file.filePath, result.plan);
  }

  const patch = await assemblePatch(plans, { repoPath: input.repoPath });

  return {
    patch,
    plans,
    totalUsage: {
      inputTokens: totalIn,
      outputTokens: totalOut,
      cacheReadInputTokens: totalCacheRead,
      cacheCreationInputTokens: totalCacheWrite,
    },
    skipped,
  };
}

function groupByFile(
  input: ProposePatchInput,
  minConfidence: "low" | "medium" | "high",
): ImpactedChangeFile[] {
  const minRank = CONFIDENCE_RANK[minConfidence];
  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const buckets = new Map<string, { changes: Map<string, ChangeEvent>; candidates: ImpactCandidate[] }>();

  for (const [eventId, candidates] of input.candidatesByEvent) {
    const event = eventById.get(eventId);
    if (!event) continue;
    for (const candidate of candidates) {
      if (CONFIDENCE_RANK[candidate.confidence] < minRank) continue;
      let bucket = buckets.get(candidate.filePath);
      if (!bucket) {
        bucket = { changes: new Map(), candidates: [] };
        buckets.set(candidate.filePath, bucket);
      }
      bucket.changes.set(event.id, event);
      if (!bucket.candidates.includes(candidate)) bucket.candidates.push(candidate);
    }
  }

  return [...buckets.entries()]
    .map(([filePath, bucket]) => ({
      filePath,
      changes: [...bucket.changes.values()],
      candidates: bucket.candidates,
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export { planFilePatch } from "./plan.js";
export { assemblePatch } from "./assemble.js";
export { repairProposedPatch, RepairResponseSchema } from "./repair.js";
export { FilePatchPlanSchema, ReplacementBlockSchema } from "./types.js";
export type { FilePatchPlan, ReplacementBlock } from "./types.js";
export type { AssembledPatch, AssembledFilePatch } from "./assemble.js";
export type { RepairProposedPatchInput, RepairOptions, RepairResponse, RepairResult } from "./repair.js";
