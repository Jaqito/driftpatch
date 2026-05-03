import { z } from "zod";

export const ChangeKindSchema = z.enum([
  "rename",
  "removal",
  "signature_change",
  "behavior_change",
  "new_default",
  "deprecation",
  "addition",
]);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

export const RiskSchema = z.enum(["low", "medium", "high"]);
export type Risk = z.infer<typeof RiskSchema>;

export const ChangeEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  kind: ChangeKindSchema,
  entity: z.string(),
  fromVersion: z.string(),
  toVersion: z.string(),
  description: z.string(),
  attributes: z.record(z.unknown()).optional(),
  risk: RiskSchema,
});
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export type Confidence = "high" | "medium" | "low";

export interface ImpactCandidate {
  filePath: string;
  reason: string;
  confidence: Confidence;
  matchedSymbols: string[];
}

export interface ReplacementBlock {
  filePath: string;
  oldText: string;
  newText: string;
}

export interface PatchPlan {
  changeId: string;
  steps: Array<{
    filePath: string;
    intent: string;
    notes?: string;
  }>;
}

export interface ProposedPatch {
  unifiedDiff: string;
  blocks: ReplacementBlock[];
  planRef: string;
}

export type ValidationStatus = "ok" | "failed";

export interface ValidationResult {
  status: ValidationStatus;
  steps: Array<{
    command: string;
    status: ValidationStatus;
    output: string;
  }>;
}

export interface ApplyResult {
  branch: string;
  commitSha?: string;
  prUrl?: string;
}

export interface RepoIndex {
  rootPath: string;
  sha: string;
  importsByFile: Map<string, string[]>;
  filesByPackage: Map<string, string[]>;
  symbols: Map<string, SymbolDef[]>;
}

export interface SymbolDef {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "component";
  filePath: string;
  line: number;
}

export interface RepoSkill {
  version: number;
  repo: string;
  language: string;
  packageManager?: string;
  validation: { commands: string[] };
  areas: Array<{
    name: string;
    paths: string[];
    pattern: string;
  }>;
  providerMappings: Record<
    string,
    Array<{
      upstreamEntity: string;
      localFile: string;
      typeName?: string;
    }>
  >;
  patchPolicy: Record<ChangeKind, "auto_apply" | "require_review" | "create_todo_only">;
  examples: Array<{ title: string; body: string }>;
}
